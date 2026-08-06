import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function response(origin: string, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...jsonHeaders,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin"
    }
  });
}

function allowedOrigin(requestOrigin: string) {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin);
  return local || configured.includes(requestOrigin);
}

function usernameEmail(username: string) {
  return `${username}@accounts.malseum-ssiat.app`;
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigin(origin)) {
    return response("null", 403, { error: "허용되지 않은 접속 주소입니다." });
  }
  if (request.method === "OPTIONS") return response(origin, 200, { ok: true });
  if (request.method !== "POST") return response(origin, 405, { error: "지원하지 않는 요청입니다." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return response(origin, 503, { error: "회원가입 서버 설정이 아직 완료되지 않았습니다." });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return response(origin, 400, { error: "입력 내용을 읽지 못했습니다." });
  }

  const username = String(payload.username || "").trim().toLowerCase();
  const displayName = String(payload.displayName || "").trim();
  const department = String(payload.department || "").trim();
  const memberRole = String(payload.memberRole || "student");
  const pin = String(payload.pin || "");

  if (!/^[a-z0-9][a-z0-9._-]{3,19}$/.test(username)) {
    return response(origin, 400, { error: "아이디는 영문 소문자와 숫자를 중심으로 4~20자로 입력해 주세요." });
  }
  if (displayName.length < 2 || displayName.length > 20) {
    return response(origin, 400, { error: "이름은 2~20자로 입력해 주세요." });
  }
  if (!department || department.length > 30) {
    return response(origin, 400, { error: "부서를 30자 이내로 입력해 주세요." });
  }
  if (!new Set(["student", "teacher", "minister"]).has(memberRole)) {
    return response(origin, 400, { error: "사용자 구분을 다시 선택해 주세요." });
  }
  if (!/^\d{6}$/.test(pin)) {
    return response(origin, 400, { error: "개인 비밀번호는 숫자 6자리로 입력해 주세요." });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return response(origin, 401, { error: "현재 기기 사용 정보를 확인하지 못했습니다." });
  }
  const { data: callerData, error: callerError } = await admin.auth.getUser(accessToken);
  const caller = callerData.user;
  if (callerError || !caller) {
    return response(origin, 401, { error: "현재 기기 사용 정보가 만료되었습니다. 앱을 새로고침해 주세요." });
  }
  if (!caller.is_anonymous) {
    return response(origin, 409, { error: "이미 여러 기기에서 사용할 수 있는 계정입니다." });
  }

  const [{ data: guestProfile, error: guestProfileError }, { data: guestState, error: guestStateError }] = await Promise.all([
    admin
      .from("malseum_ssiat_profiles")
      .select("id")
      .eq("id", caller.id)
      .maybeSingle(),
    admin
      .from("malseum_ssiat_user_state")
      .select("progress,history")
      .eq("user_id", caller.id)
      .maybeSingle()
  ]);
  if (guestProfileError || !guestProfile || guestStateError) {
    return response(origin, 409, { error: "현재 기기의 암송 기록을 확인하지 못했습니다. 앱에서 다시 저장한 뒤 시도해 주세요." });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameEmail(username),
    password: pin,
    email_confirm: true,
    user_metadata: { username, display_name: displayName, department, member_role: memberRole }
  });

  if (createError || !created.user) {
    const duplicate = /already|registered|exists/i.test(createError?.message || "");
    return response(origin, duplicate ? 409 : 400, {
      error: duplicate ? "이미 사용 중인 아이디입니다." : "계정을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."
    });
  }

  const userId = created.user.id;
  const { error: profileError } = await admin.from("malseum_ssiat_profiles").insert({
    id: userId,
    username,
    display_name: displayName,
    department,
    member_role: memberRole
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    const duplicate = profileError.code === "23505";
    return response(origin, duplicate ? 409 : 500, {
      error: duplicate ? "이미 사용 중인 아이디입니다." : "계정 정보를 저장하지 못했습니다."
    });
  }

  const { error: stateError } = await admin.from("malseum_ssiat_user_state").insert({
    user_id: userId,
    progress: guestState?.progress || {},
    history: Array.isArray(guestState?.history) ? guestState.history : []
  });

  if (stateError) {
    await admin.from("malseum_ssiat_profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return response(origin, 500, { error: "개인 기록 공간을 만들지 못했습니다." });
  }

  // 새 영구 계정에 기록이 안전하게 복사된 뒤 기기 전용 익명 사용자를 정리합니다.
  await admin.auth.admin.deleteUser(caller.id).catch(() => {});

  return response(origin, 201, { ok: true, migrated: true });
});
