import { createClient } from "npm:@supabase/supabase-js@2";

function allowedOrigin(requestOrigin: string) {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin);
  return local || configured.includes(requestOrigin);
}

function respond(origin: string, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin"
    }
  });
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigin(origin)) return respond("null", 403, { error: "허용되지 않은 접속 주소입니다." });
  if (request.method === "OPTIONS") return respond(origin, 200, { ok: true });
  if (request.method !== "POST") return respond(origin, 405, { error: "지원하지 않는 요청입니다." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!supabaseUrl || !serviceRoleKey || !token) return respond(origin, 401, { error: "관리자 로그인이 필요합니다." });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData.user) return respond(origin, 401, { error: "로그인 정보를 확인하지 못했습니다." });

  const { data: callerProfile } = await admin
    .from("malseum_ssiat_profiles")
    .select("member_role")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (callerProfile?.member_role !== "admin") return respond(origin, 403, { error: "관리자 권한이 필요합니다." });

  const payload = await request.json().catch(() => ({}));
  const userId = String(payload.userId || "");
  const pin = String(payload.pin || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^\d{6}$/.test(pin)) {
    return respond(origin, 400, { error: "회원과 새 숫자 6자리 비밀번호를 확인해 주세요." });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password: pin });
  if (updateError) return respond(origin, 400, { error: "비밀번호를 초기화하지 못했습니다." });
  return respond(origin, 200, { ok: true });
});
