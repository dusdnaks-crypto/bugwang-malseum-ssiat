import { createClient } from "@supabase/supabase-js";

const config = window.MALSEUM_SSIAT_SERVER || {};
const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

const tableNames = {
  profiles: config.profilesTable || "malseum_ssiat_profiles",
  shared: config.sharedTable || "malseum_ssiat_shared_state",
  userState: config.userStateTable || "malseum_ssiat_user_state",
  rankings: config.rankingsTable || "malseum_ssiat_rankings"
};

function createAppClient(storageKey) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey
      }
    });
}

const regularClient = configured ? createAppClient("bugwang-malseum-ssiat-auth-v17") : null;
const adminClient = configured ? createAppClient("bugwang-malseum-ssiat-auth-v21-admin") : null;
let client = regularClient;

function requireClient(targetClient = client) {
  if (!targetClient) throw new Error("서버 설정이 아직 완료되지 않았습니다.");
  return targetClient;
}

function normalizeUsername(value = "") {
  return String(value).trim().toLowerCase();
}

function accountEmail(username = "") {
  return `${normalizeUsername(username)}@accounts.malseum-ssiat.app`;
}

function koreanError(error, fallback = "요청을 처리하지 못했습니다.") {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("anonymous sign-ins are disabled")) return "서버에서 ‘익명 로그인’을 켜 주세요.";
  if (message.includes("invalid login credentials")) return "아이디 또는 6자리 번호가 맞지 않습니다.";
  if (message.includes("already") || message.includes("duplicate")) return "이미 사용 중인 아이디입니다.";
  if (message.includes("rate limit")) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (message.includes("failed to fetch") || message.includes("network")) return "서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.";
  return error?.message || fallback;
}

function guestIdentity(userId = "") {
  const compactId = String(userId).replaceAll("-", "").toLowerCase();
  const shortId = compactId.slice(0, 12);
  const labelId = compactId.slice(-4).toUpperCase();
  return {
    id: userId,
    username: `guest_${shortId}`,
    display_name: `말씀친구 ${labelId}`,
    department: "부광교회",
    member_role: "student"
  };
}

function mapProfile(data, user) {
  return {
    id: data.id,
    username: data.username,
    name: data.display_name,
    department: data.department,
    role: data.member_role,
    isGuest: Boolean(user?.is_anonymous),
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

async function ensureProfile(user, scopedClient = requireClient()) {
  if (!user?.id) throw new Error("사용자 정보를 확인하지 못했습니다.");
  const columns = "id,username,display_name,department,member_role,created_at,updated_at";
  const { data: existing, error: selectError } = await scopedClient
    .from(tableNames.profiles)
    .select(columns)
    .eq("id", user.id)
    .maybeSingle();
  if (selectError) throw new Error(koreanError(selectError, "사용 정보를 불러오지 못했습니다."));
  if (existing) return mapProfile(existing, user);
  if (!user.is_anonymous) throw new Error("관리자 계정 정보가 아직 준비되지 않았습니다.");

  const { data: created, error: insertError } = await scopedClient
    .from(tableNames.profiles)
    .insert(guestIdentity(user.id))
    .select(columns)
    .single();
  if (insertError) throw new Error(koreanError(insertError, "자동 사용 정보를 만들지 못했습니다."));
  return mapProfile(created, user);
}

async function currentSessionFor(targetClient = client) {
  const scopedClient = requireClient(targetClient);
  const { data, error } = await scopedClient.auth.getSession();
  if (error) throw new Error(koreanError(error));
  if (!data.session) return null;
  const { data: userData, error: userError } = await scopedClient.auth.getUser();
  if (userError || !userData.user) {
    await scopedClient.auth.signOut({ scope: "local" }).catch(() => {});
    return null;
  }
  return data.session;
}

async function currentSession() {
  return currentSessionFor(client);
}

async function startAutomatically() {
  client = regularClient;
  const existing = await currentSessionFor(regularClient);
  if (existing) {
    await ensureProfile(existing.user, regularClient);
    return existing;
  }
  const { data, error } = await requireClient(regularClient).auth.signInAnonymously();
  if (error || !data.session) throw new Error(koreanError(error, "앱을 바로 시작하지 못했습니다."));
  await ensureProfile(data.user || data.session.user, regularClient);
  return data.session;
}

async function signIn(username, pin) {
  client = regularClient;
  const { data, error } = await requireClient(regularClient).auth.signInWithPassword({
    email: accountEmail(username),
    password: String(pin)
  });
  if (error) throw new Error(koreanError(error));
  return data.session;
}

async function registerAccount(payload) {
  client = regularClient;
  requireClient(regularClient);
  const session = await currentSessionFor(regularClient);
  if (!session?.access_token || !session.user?.is_anonymous) {
    throw new Error("계정 없이 사용 중일 때만 새 계정으로 전환할 수 있습니다.");
  }
  let response;
  try {
    response = await fetch(`${String(config.supabaseUrl).replace(/\/+$/, "")}/functions/v1/register-account`, {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: normalizeUsername(payload.username),
        displayName: String(payload.displayName || "").trim(),
        department: String(payload.department || "").trim(),
        memberRole: payload.memberRole,
        pin: String(payload.pin || "")
      })
    });
  } catch (error) {
    throw new Error(koreanError(error, "계정 연결 서버에 접속하지 못했습니다."));
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "계정을 만들지 못했습니다.");
  return signIn(payload.username, payload.pin);
}

async function resumeAdmin() {
  const session = await currentSessionFor(adminClient);
  if (!session) return null;
  const adminProfile = await ensureProfile(session.user, adminClient);
  if (adminProfile.role !== "admin") {
    await adminClient.auth.signOut({ scope: "local" }).catch(() => {});
    return null;
  }
  client = adminClient;
  return session;
}

async function signInAdmin(username, pin) {
  const scopedClient = requireClient(adminClient);
  const { data, error } = await scopedClient.auth.signInWithPassword({
    email: accountEmail(username),
    password: String(pin)
  });
  if (error || !data.session) throw new Error(koreanError(error));

  try {
    const adminProfile = await ensureProfile(data.user || data.session.user, scopedClient);
    if (adminProfile.role !== "admin") throw new Error("관리자로 지정된 계정이 아닙니다.");
  } catch (profileError) {
    await scopedClient.auth.signOut({ scope: "local" }).catch(() => {});
    throw profileError;
  }

  client = scopedClient;
  return data.session;
}

function useRegularMode() {
  client = regularClient;
}

async function signOut() {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw new Error(koreanError(error, "로그아웃하지 못했습니다."));
}

async function profile() {
  const { data: userData, error: userError } = await requireClient().auth.getUser();
  if (userError || !userData.user) throw new Error("로그인 정보를 확인하지 못했습니다.");
  return ensureProfile(userData.user);
}

async function updateOwnProfile(displayName, department) {
  const name = String(displayName || "").trim();
  const group = String(department || "").trim();
  if (name.length < 2 || name.length > 20) throw new Error("표시 이름은 2~20자로 입력해 주세요.");
  if (group.length < 1 || group.length > 30) throw new Error("부서는 1~30자로 입력해 주세요.");
  const { data: userData, error: userError } = await requireClient().auth.getUser();
  if (userError || !userData.user) throw new Error("사용자 정보를 확인하지 못했습니다.");
  const { error } = await requireClient()
    .from(tableNames.profiles)
    .update({ display_name: name, department: group, updated_at: new Date().toISOString() })
    .eq("id", userData.user.id);
  if (error) throw new Error(koreanError(error, "표시 정보를 저장하지 못했습니다."));
  return profile();
}

async function sharedState() {
  const { data, error } = await requireClient()
    .from(tableNames.shared)
    .select("data,updated_at")
    .eq("app_id", config.appId || "bugwang-malseum-ssiat")
    .maybeSingle();
  if (error) throw new Error(koreanError(error, "공용 말씀 자료를 불러오지 못했습니다."));
  return data || { data: {}, updated_at: null };
}

async function userState(userId) {
  const { data, error } = await requireClient()
    .from(tableNames.userState)
    .select("progress,history,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(koreanError(error, "개인 암송 기록을 불러오지 못했습니다."));
  return data || { progress: {}, history: [], updated_at: null };
}

async function saveUserState(userId, data) {
  const { error } = await requireClient().from(tableNames.userState).upsert({
    user_id: userId,
    progress: data.progress || {},
    history: Array.isArray(data.history) ? data.history : [],
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (error) throw new Error(koreanError(error, "개인 암송 기록을 저장하지 못했습니다."));
}

async function saveSharedState(data) {
  const { error } = await requireClient().from(tableNames.shared).upsert({
    app_id: config.appId || "bugwang-malseum-ssiat",
    data,
    updated_at: new Date().toISOString()
  }, { onConflict: "app_id" });
  if (error) throw new Error(koreanError(error, "공용 말씀 자료를 저장하지 못했습니다."));
}

async function rankingRows(weekStart) {
  const { data, error } = await requireClient()
    .from(tableNames.rankings)
    .select("user_id,week_start,display_name,department,member_role,weekly_success,weekly_unique,all_time_success,mastered,updated_at")
    .eq("week_start", weekStart);
  if (error) throw new Error(koreanError(error, "주간 순위를 불러오지 못했습니다."));
  return data || [];
}

async function adminProfiles() {
  const { data, error } = await requireClient()
    .from(tableNames.profiles)
    .select("id,username,display_name,department,member_role,created_at")
    .order("display_name", { ascending: true });
  if (error) throw new Error(koreanError(error, "회원 목록을 불러오지 못했습니다."));
  return (data || []).map(item => ({
    id: item.id,
    username: item.username,
    name: item.display_name,
    department: item.department,
    role: item.member_role,
    isGuest: String(item.username || "").startsWith("guest_"),
    createdAt: item.created_at
  }));
}

async function resetMemberPin(userId, pin) {
  const { data, error } = await requireClient().functions.invoke("admin-reset-pin", {
    body: { userId, pin: String(pin) }
  });
  if (error) throw new Error(data?.error || koreanError(error, "비밀번호를 초기화하지 못했습니다."));
  if (data?.error) throw new Error(data.error);
  return true;
}

window.MalseumSecure = {
  configured,
  currentSession,
  startAutomatically,
  signIn,
  resumeAdmin,
  signInAdmin,
  useRegularMode,
  registerAccount,
  signOut,
  profile,
  updateOwnProfile,
  sharedState,
  userState,
  saveUserState,
  saveSharedState,
  rankingRows,
  adminProfiles,
  resetMemberPin,
  normalizeUsername,
  accountEmail
};
