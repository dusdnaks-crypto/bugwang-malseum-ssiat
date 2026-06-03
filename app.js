const STORAGE_KEY = "bugwangMalseumSsiat:v7";
const LEGACY_STORAGE_KEYS = ["bugwangMalseumSsiat:v6", "bugwangMalseumSsiat:v5", "bugwangMalseumSsiat:v4", "bugwangMalseumSsiat:v3", "bugwangMalseumSsiat:v2", "malseumSsiat:v1"];
const ADMIN_PASSWORD = "1369";
const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60];
let state = loadState();
let currentView = "home";
let selectedVerseId = state.todayVerseId || null;
let memStep = 0;
let authenticatedAdminId = null;
let deferredInstallPrompt = null;
let syncReady = false;
let syncSaveTimer = null;
let syncBusy = false;
const serverSync = { enabled: false, message: "로컬 저장 모드", detail: "config.js에서 서버 정보를 입력하면 여러 기기에서 같은 데이터를 사용할 수 있습니다.", lastSyncedAt: "" };


const $ = (id) => document.getElementById(id);
const dateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const today = () => dateKey(new Date());
const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
};

function isStandaloneMode() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInstallableContext() {
  return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function updateInstallGuide() {
  const text = $("installGuideText");
  const btn = $("installAppBtn");
  if (!text || !btn) return;

  if (isStandaloneMode()) {
    text.textContent = "이미 홈 화면 앱처럼 실행 중입니다.";
    btn.textContent = "설치 완료";
    btn.disabled = true;
    return;
  }

  if (location.protocol === "file:") {
    text.textContent = "다운로드한 파일을 바로 열면 기본 사용은 가능하지만, 홈 화면 설치는 웹 주소로 접속해야 안정적입니다.";
    btn.textContent = "설치 방법 보기";
    btn.disabled = false;
    return;
  }

  if (deferredInstallPrompt) {
    text.textContent = "이 기기에서는 바로 설치할 수 있습니다. 버튼을 눌러 홈 화면에 추가해 보세요.";
    btn.textContent = "앱 설치하기";
    btn.disabled = false;
    return;
  }

  if (isIosDevice()) {
    text.textContent = "아이폰은 Safari 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하면 됩니다.";
    btn.textContent = "아이폰 안내";
    btn.disabled = false;
    return;
  }

  text.textContent = "Chrome 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하면 됩니다.";
  btn.textContent = "설치 방법 보기";
  btn.disabled = false;
}

async function showInstallGuide() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    updateInstallGuide();
    return;
  }

  if (isIosDevice()) {
    alert("아이폰/iPad 설치 방법\n\n1. 반드시 Safari로 앱 주소를 엽니다.\n2. 아래쪽 공유 버튼을 누릅니다.\n3. ‘홈 화면에 추가’를 선택합니다.\n4. 이름이 ‘부광 말씀씨앗’인지 확인하고 추가합니다.");
    return;
  }

  alert("안드로이드 설치 방법\n\n1. Chrome으로 앱 주소를 엽니다.\n2. 오른쪽 위 ⋮ 메뉴를 누릅니다.\n3. ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택합니다.\n\n단, index.html 파일을 직접 여는 방식은 홈 화면 설치가 제한될 수 있습니다. 가능하면 Netlify, GitHub Pages 같은 곳에 올린 웹 주소로 접속해 주세요.");
}

function defaultAppText() {
  return {
    topEyebrow: "부광교회 교회학교",
    appTitle: "부광 말씀씨앗",
    heroEyebrow: "오늘 마음에 심을 말씀",
    heroTitle: "부광의 다음세대 마음밭에 말씀을",
    heroSubtext: "{{name}}님, 오늘도 말씀 한 알을 마음밭에 심어 보세요.",
    guestSubtext: "계정을 만들고, 오늘 외우고, 내일 다시 기억하고, 삶 속에 새겨 보세요.",
    heroIcon: "🌱",
    memorizePrompt: "말씀을 덮고, 기억나는 만큼 적어 보세요.",
    nextStepButton: "다음",
    scoreButton: "채점 보기",
    needPracticeButton: "조금 더 연습",
    rememberedButton: "외웠어요",
    scoreTitle: "기억 유사도 {{score}}%",
    scoreHelp: "빨간 글자는 내가 적은 답과 달라서 다시 살펴볼 부분입니다.",
    correctionLabel: "정답 기준 정정 보기",
    userAnswerLabel: "내가 적은 답",
    emptyAnswerText: "아직 입력한 답이 없습니다.",
    needPracticeToast: "괜찮습니다. 내일 다시 물을 줍니다.",
    needPracticeIcon: "🌱",
    successToast: "복습 일정을 다시 심어 두었습니다.",
    successIcon: "🎉"
  };
}


function defaultAppDesign() {
  return {
    background: "seed"
  };
}

function backgroundDesignOptions() {
  return [
    { id: "seed", name: "말씀씨앗", desc: "따뜻한 종이빛과 초록 씨앗 느낌의 기본 배경" },
    { id: "garden", name: "푸른 정원", desc: "연한 초록빛으로 마음밭과 새싹을 떠올리는 배경" },
    { id: "morning", name: "새벽 하늘", desc: "부드러운 하늘빛과 아침빛이 섞인 밝은 배경" },
    { id: "parchment", name: "말씀 종이", desc: "군더더기 없는 양피지 느낌의 차분한 배경" },
    { id: "blossom", name: "은혜 꽃잎", desc: "연한 살구빛과 꽃잎빛이 도는 따뜻한 배경" }
  ];
}

function defaultAdminAccount() {
  return {
    id: "admin-default",
    name: "관리자",
    department: "부광교회",
    role: "admin",
    password: ADMIN_PASSWORD,
    createdAt: "preset"
  };
}

function defaultState() {
  const admin = defaultAdminAccount();
  return {
    appName: "부광 말씀씨앗",
    appText: defaultAppText(),
    appDesign: defaultAppDesign(),
    accounts: [admin],
    activeAccountId: null,
    settings: { userName: "", role: "student" },
    verses: [],
    progress: {},
    progressByAccount: {},
    todayVerseId: null,
    history: []
  };
}

function ensureShape(data) {
  const shaped = { ...defaultState(), ...(data || {}) };
  shaped.accounts = Array.isArray(shaped.accounts) ? shaped.accounts : [];
  shaped.appText = { ...defaultAppText(), ...(shaped.appText || {}) };
  shaped.appDesign = { ...defaultAppDesign(), ...(shaped.appDesign || {}) };
  if (!backgroundDesignOptions().some(option => option.id === shaped.appDesign.background)) {
    shaped.appDesign.background = defaultAppDesign().background;
  }
  shaped.progressByAccount = shaped.progressByAccount && typeof shaped.progressByAccount === "object" ? shaped.progressByAccount : {};
  shaped.history = Array.isArray(shaped.history) ? shaped.history : [];
  shaped.verses = Array.isArray(shaped.verses) ? shaped.verses : [];
  shaped.verses = shaped.verses.map(verse => ({
    ...verse,
    number: verse.number ?? verse.memoryNumber ?? ""
  }));

  if (!shaped.accounts.length && shaped.settings?.userName) {
    const legacyAccount = {
      id: crypto.randomUUID(),
      name: shaped.settings.userName,
      department: "",
      role: shaped.settings.role === "teacher" ? "teacher" : "student",
      createdAt: new Date().toISOString()
    };
    shaped.accounts.push(legacyAccount);
    shaped.activeAccountId = legacyAccount.id;
    if (shaped.progress && Object.keys(shaped.progress).length) {
      shaped.progressByAccount[legacyAccount.id] = shaped.progress;
    }
  }

  if (!shaped.accounts.some(account => account.role === "admin")) {
    shaped.accounts.unshift(defaultAdminAccount());
  }

  shaped.accounts = shaped.accounts.map(account => {
    if (account.role !== "admin") {
      const { password, ...rest } = account;
      return rest;
    }
    return { ...account, password: account.password || ADMIN_PASSWORD };
  });

  if (shaped.activeAccountId && !shaped.accounts.some(account => account.id === shaped.activeAccountId)) {
    shaped.activeAccountId = null;
  }
  if (!shaped.activeAccountId) {
    shaped.activeAccountId = shaped.accounts.find(account => account.role !== "admin")?.id || null;
  }
  return shaped;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return ensureShape(JSON.parse(saved));

    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) {
        const migrated = ensureShape(JSON.parse(legacy));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
    return defaultState();
  } catch (error) {
    console.warn(error);
    return defaultState();
  }
}

function saveLocalStateOnly() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveState(options = {}) {
  saveLocalStateOnly();
  render();
  if (!options.skipServer) scheduleServerSave();
}

function serverConfig() {
  return window.MALSEUM_SSIAT_SERVER || {};
}

function serverModeEnabled() {
  const cfg = serverConfig();
  return cfg.mode === "supabase" && Boolean(cfg.supabaseUrl) && Boolean(cfg.supabaseAnonKey);
}

function remoteTableName() {
  return serverConfig().table || "malseum_ssiat_app_state";
}

function remoteAppId() {
  return serverConfig().appId || "bugwang-malseum-ssiat";
}

function updateSyncStatus(message, detail = "", isEnabled = serverModeEnabled()) {
  serverSync.enabled = isEnabled;
  serverSync.message = message;
  serverSync.detail = detail;
  serverSync.lastSyncedAt = isEnabled ? new Date().toLocaleString("ko-KR") : serverSync.lastSyncedAt;
  renderServerSyncPanel();
}

function supabaseEndpoint(path) {
  const base = String(serverConfig().supabaseUrl || "").replace(/\/+$/, "");
  return `${base}/rest/v1/${path}`;
}

async function supabaseRequest(path, options = {}) {
  const cfg = serverConfig();
  const headers = {
    apikey: cfg.supabaseAnonKey,
    Authorization: `Bearer ${cfg.supabaseAnonKey}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const response = await fetch(supabaseEndpoint(path), { ...options, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `서버 응답 오류 ${response.status}`);
  }
  if (response.status === 204) return null;
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

function prepareStateForServer() {
  return ensureShape(JSON.parse(JSON.stringify(state)));
}

function hasMeaningfulRemoteData(data) {
  if (!data || typeof data !== "object") return false;
  return Boolean((Array.isArray(data.verses) && data.verses.length) || (Array.isArray(data.accounts) && data.accounts.length > 1) || (Array.isArray(data.history) && data.history.length));
}

async function pullStateFromServer({ quiet = false } = {}) {
  if (!serverModeEnabled()) {
    updateSyncStatus("로컬 저장 모드", "config.js에 Supabase 정보를 입력하면 서버 동기화가 켜집니다.", false);
    return null;
  }
  if (syncBusy) return null;
  syncBusy = true;
  try {
    updateSyncStatus("서버에서 데이터를 불러오는 중", "잠시만 기다려 주세요.");
    const table = remoteTableName();
    const appId = encodeURIComponent(remoteAppId());
    const rows = await supabaseRequest(`${table}?app_id=eq.${appId}&select=data,updated_at&limit=1`);
    const remote = Array.isArray(rows) ? rows[0] : null;
    if (remote?.data && hasMeaningfulRemoteData(remote.data)) {
      state = ensureShape(remote.data);
      saveLocalStateOnly();
      selectedVerseId = state.todayVerseId || selectedVerseId;
      updateSyncStatus("서버 데이터 불러오기 완료", `마지막 서버 수정: ${remote.updated_at ? new Date(remote.updated_at).toLocaleString("ko-KR") : "확인 안 됨"}`);
      render();
      if (!quiet) showToast("서버에서 데이터를 불러왔습니다.");
      return state;
    }
    updateSyncStatus("서버에 아직 데이터가 없습니다", "현재 기기의 데이터를 서버에 처음 올립니다.");
    await pushStateToServer({ quiet: true });
    if (!quiet) showToast("현재 데이터를 서버에 처음 저장했습니다.");
    return state;
  } catch (error) {
    console.warn(error);
    updateSyncStatus("서버 연결 실패", "config.js 정보와 Supabase 테이블 설정을 확인해 주세요.");
    if (!quiet) alert("서버에서 데이터를 불러오지 못했습니다. config.js와 Supabase 설정을 확인해 주세요.");
    return null;
  } finally {
    syncBusy = false;
  }
}

async function pushStateToServer({ quiet = false } = {}) {
  if (!serverModeEnabled()) return;
  if (syncBusy) return;
  syncBusy = true;
  try {
    updateSyncStatus("서버에 저장하는 중", "말씀과 계정, 암송 기록을 함께 저장합니다.");
    const table = remoteTableName();
    await supabaseRequest(table, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        app_id: remoteAppId(),
        data: prepareStateForServer(),
        updated_at: new Date().toISOString()
      })
    });
    updateSyncStatus("서버 저장 완료", "다른 기기에서 새로고침하면 같은 내용을 볼 수 있습니다.");
    if (!quiet) showToast("서버에 저장했습니다.");
  } catch (error) {
    console.warn(error);
    updateSyncStatus("서버 저장 실패", "인터넷 연결, config.js, Supabase 정책을 확인해 주세요.");
    if (!quiet) alert("서버에 저장하지 못했습니다. 인터넷 연결과 Supabase 설정을 확인해 주세요.");
  } finally {
    syncBusy = false;
  }
}

function scheduleServerSave() {
  if (!syncReady || !serverModeEnabled()) return;
  clearTimeout(syncSaveTimer);
  syncSaveTimer = setTimeout(() => pushStateToServer({ quiet: true }), 650);
}

async function initServerSync() {
  if (!serverModeEnabled()) {
    updateSyncStatus("로컬 저장 모드", "서버 연결을 원하시면 config.js에 Supabase URL과 anon key를 입력해 주세요.", false);
    syncReady = false;
    return;
  }
  syncReady = true;
  await pullStateFromServer({ quiet: true });
}

function normalize(str = "") {
  return str
    .replace(/[\s\n\r\t]+/g, " ")
    .replace(/[.,!?;:'"“”‘’()\[\]{}<>·…—–-]/g, "")
    .trim()
    .toLowerCase();
}

function similarity(a, b) {
  const s = normalize(a);
  const t = normalize(b);
  if (!s && !t) return 1;
  if (!s || !t) return 0;
  const dp = Array.from({ length: s.length + 1 }, () => Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i++) dp[i][0] = i;
  for (let j = 0; j <= t.length; j++) dp[0][j] = j;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return 1 - dp[s.length][t.length] / Math.max(s.length, t.length);
}

function currentAccount() {
  return state.accounts.find(account => account.id === state.activeAccountId) || null;
}

function accountKey(accountId = state.activeAccountId) {
  return accountId || "guest";
}

function roleLabel(role) {
  if (role === "admin") return "관리자";
  if (role === "minister") return "교역자";
  return role === "teacher" ? "교사" : "학생";
}

function isAdminAccount(account = currentAccount()) {
  return account?.role === "admin";
}

function adminPasswordFor(account) {
  return account?.password || ADMIN_PASSWORD;
}

function isAdmin(account = currentAccount()) {
  return isAdminAccount(account) && authenticatedAdminId === account.id;
}

function requireAdmin(message = "관리자 계정으로 로그인해야 사용할 수 있습니다.") {
  if (isAdmin()) return true;
  alert(message);
  return false;
}

function formatAppText(template = "", account = currentAccount()) {
  return formatTextTemplate(template, {
    name: account?.name || "말씀씨앗",
    department: account?.department || "부광교회",
    role: roleLabel(account?.role || "student")
  });
}

function formatTextTemplate(template = "", values = {}) {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.replaceAll(`{{${key}}}`, value ?? "");
  }, String(template || ""));
}

function appTextValue(key) {
  return ({ ...defaultAppText(), ...(state.appText || {}) })[key];
}


function renderAppDesign() {
  const design = { ...defaultAppDesign(), ...(state.appDesign || {}) };
  if (!backgroundDesignOptions().some(option => option.id === design.background)) {
    design.background = defaultAppDesign().background;
  }
  document.body.dataset.background = design.background;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    const colorMap = {
      seed: "#426B4D",
      garden: "#3F7A4C",
      morning: "#47718A",
      parchment: "#7A5A2E",
      blossom: "#9B5A4B"
    };
    themeMeta.setAttribute("content", colorMap[design.background] || colorMap.seed);
  }
}

function renderAppText() {
  const text = { ...defaultAppText(), ...(state.appText || {}) };
  const account = currentAccount();
  document.title = text.appTitle || "부광 말씀씨앗";
  if ($("topEyebrow")) $("topEyebrow").textContent = text.topEyebrow;
  if ($("appTitle")) $("appTitle").textContent = text.appTitle;
  if ($("heroEyebrow")) $("heroEyebrow").textContent = text.heroEyebrow;
  if ($("homeTitle")) $("homeTitle").textContent = text.heroTitle;
  if ($("homeSubtext")) {
    $("homeSubtext").textContent = account
      ? formatAppText(text.heroSubtext, account)
      : formatAppText(text.guestSubtext, account);
  }
  const seedBadge = document.querySelector(".seed-badge");
  if (seedBadge) seedBadge.textContent = text.heroIcon || defaultAppText().heroIcon;
}

function getProgressMap(accountId = state.activeAccountId) {
  const key = accountKey(accountId);
  if (!state.progressByAccount[key]) {
    state.progressByAccount[key] = key === "guest" && state.progress && Object.keys(state.progress).length
      ? state.progress
      : {};
  }
  return state.progressByAccount[key];
}

function emptyProgress() {
  return {
    level: 0,
    successCount: 0,
    failCount: 0,
    lastPracticed: null,
    nextReview: today(),
    mastered: false
  };
}

function getProgress(verseId, accountId = state.activeAccountId) {
  const map = getProgressMap(accountId);
  if (!map[verseId]) map[verseId] = emptyProgress();
  return map[verseId];
}

function dueVerses(accountId = state.activeAccountId) {
  const t = today();
  return orderedVerses().filter(v => {
    const p = getProgress(v.id, accountId);
    return p.nextReview && p.nextReview <= t;
  });
}

function compareVerseOrder(a, b) {
  const aNumber = String(a.number || "").trim();
  const bNumber = String(b.number || "").trim();
  if (aNumber && bNumber) return aNumber.localeCompare(bNumber, "ko", { numeric: true, sensitivity: "base" });
  if (aNumber) return -1;
  if (bNumber) return 1;
  return (a.createdAt || "").localeCompare(b.createdAt || "") * -1;
}

function orderedVerses(verses = state.verses) {
  return [...verses].sort(compareVerseOrder);
}

function nextVerseNumber() {
  const numeric = state.verses
    .map(verse => String(verse.number || "").trim())
    .map(value => Number.parseInt(value, 10))
    .filter(value => Number.isFinite(value));
  return String((numeric.length ? Math.max(...numeric) : state.verses.length) + 1);
}

function verseNumberText(verse) {
  const raw = String(verse?.number || "").trim();
  if (!raw) return "";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

function verseDisplayReference(verse) {
  const number = verseNumberText(verse);
  return number ? `${number} ${verse.reference}` : verse.reference;
}

function activeTodayVerse() {
  const verses = orderedVerses();
  if (state.todayVerseId) return state.verses.find(v => v.id === state.todayVerseId) || verses[0] || null;
  return verses[0] || null;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1900);
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}

function makeBlanked(text, ratio) {
  const words = text.split(/(\s+)/);
  let wordIndex = 0;
  return words.map(token => {
    if (/^\s+$/.test(token)) return token;
    const clean = token.replace(/[.,!?;:'"“”‘’()\[\]{}<>·…—–-]/g, "");
    if (clean.length <= 1) return escapeHtml(token);
    const shouldBlank = ((wordIndex * 37 + clean.length * 11) % 100) < ratio * 100;
    wordIndex += 1;
    return shouldBlank ? `<span class="blank">${escapeHtml(token)}</span>` : escapeHtml(token);
  }).join("");
}

function resetMemorizeAnswer() {
  if ($("answerInput")) $("answerInput").value = "";
  if ($("compareBox")) {
    $("compareBox").innerHTML = "";
    $("compareBox").classList.add("hidden");
  }
}

function makeCorrectionHtml(userAnswer = "", correctAnswer = "") {
  const userChars = Array.from(String(userAnswer));
  const correctChars = Array.from(String(correctAnswer));

  if (!correctChars.length) return "";

  const dp = Array.from({ length: userChars.length + 1 }, () => Array(correctChars.length + 1).fill(0));
  for (let i = userChars.length - 1; i >= 0; i -= 1) {
    for (let j = correctChars.length - 1; j >= 0; j -= 1) {
      dp[i][j] = userChars[i] === correctChars[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const matchedCorrectIndexes = new Set();
  let i = 0;
  let j = 0;
  while (i < userChars.length && j < correctChars.length) {
    if (userChars[i] === correctChars[j]) {
      matchedCorrectIndexes.add(j);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return correctChars.map((char, index) => {
    const safe = escapeHtml(char);
    if (matchedCorrectIndexes.has(index)) return safe;
    if (/\s/.test(char)) return `<span class="correction-red correction-space">${safe}</span>`;
    return `<span class="correction-red">${safe}</span>`;
  }).join("");
}

function renderScoreComparison(userAnswer, correctAnswer, score) {
  const title = formatTextTemplate(appTextValue("scoreTitle"), { score });
  const correctionLabel = appTextValue("correctionLabel");
  const userAnswerLabel = appTextValue("userAnswerLabel");
  const emptyAnswerText = appTextValue("emptyAnswerText");
  const userText = String(userAnswer || "").trim() ? escapeHtml(userAnswer) : `<span class="muted">${escapeHtml(emptyAnswerText)}</span>`;

  return `
    <div class="score-header">
      <strong>${escapeHtml(title)}</strong>
    </div>
    <p class="score-help">${escapeHtml(appTextValue("scoreHelp"))}</p>
    <div class="correction-block">
      <p class="correction-label">${escapeHtml(correctionLabel)}</p>
      <div class="correction-text">${makeCorrectionHtml(userAnswer, correctAnswer)}</div>
    </div>
    <details class="user-answer-detail">
      <summary>${escapeHtml(userAnswerLabel)}</summary>
      <div class="user-answer-text">${userText}</div>
    </details>
  `;
}

function renderVerseCard(verse, options = {}) {
  const p = getProgress(verse.id);
  const number = verseNumberText(verse);
  const numberBadge = number ? `<span class="verse-number">${escapeHtml(number)}</span>` : "";
  const topic = verse.topic ? `<span class="badge">${escapeHtml(verse.topic)}</span>` : "";
  const mastered = p.mastered ? `<span class="badge gold">익숙한 말씀</span>` : "";
  const version = verse.version ? `<span class="badge">${escapeHtml(verse.version)}</span>` : "";
  const preview = options.full ? verse.text : (verse.text.length > 120 ? `${verse.text.slice(0, 120)}…` : verse.text);
  const adminActions = isAdmin() ? `
        <button class="small ghost" data-action="edit" data-id="${verse.id}" type="button">수정</button>
        <button class="small ghost danger" data-action="delete" data-id="${verse.id}" type="button">삭제</button>` : "";
  return `
    <article class="verse-card">
      <h4>${numberBadge}<span>${escapeHtml(verse.reference)}</span></h4>
      <div>${topic} ${version} ${mastered}</div>
      <blockquote>${escapeHtml(preview)}</blockquote>
      <p class="muted">다음 복습: ${p.nextReview || "오늘"} · 성공 ${p.successCount}회 · 연습 ${p.failCount}회</p>
      <div class="verse-actions">
        <button class="small" data-action="memorize" data-id="${verse.id}" type="button">암송</button>
        <button class="small secondary" data-action="reviewSuccess" data-id="${verse.id}" type="button">복습 완료</button>
        ${adminActions}
      </div>
    </article>
  `;
}

function renderAccountSummary() {
  const account = currentAccount();
  const summary = $("accountSummary");
  const accountButton = $("homeAccountBtn");
  if (!summary || !accountButton) return;

  if (!account) {
    accountButton.textContent = "계정 만들기";
    summary.innerHTML = `
      <div class="empty-state">사용할 계정을 선택하거나 새 계정을 만들어 주세요. 관리자 계정은 비밀번호 입력 후 사용할 수 있습니다.</div>
    `;
    return;
  }

  accountButton.textContent = "계정 변경";
  const adminAuthBadge = isAdminAccount(account)
    ? (isAdmin(account) ? `<span class="badge gold">관리자 인증됨</span>` : `<span class="badge">비밀번호 필요</span>`)
    : `<span class="badge">현재 사용 중</span>`;
  summary.innerHTML = `
    <div class="account-card active-account">
      <div>
        <strong>${escapeHtml(account.name)}</strong>
        <p>${escapeHtml(account.department || "부서 미입력")} · ${roleLabel(account.role)}</p>
      </div>
      ${adminAuthBadge}
    </div>
  `;
}

function renderHome() {
  renderAppText();
  $("statVerses").textContent = state.verses.length;
  $("statDue").textContent = dueVerses().length;
  $("statMastered").textContent = Object.values(getProgressMap()).filter(p => p.mastered).length;
  renderAccountSummary();

  const todayVerse = activeTodayVerse();
  const todayBox = $("todayVerseCard");
  if (!todayVerse) {
    todayBox.innerHTML = isAdmin()
      ? `아직 등록된 말씀이 없습니다. <button class="small" data-open-add type="button">첫 말씀 추가하기</button>`
      : `아직 등록된 말씀이 없습니다. 관리자 계정으로 로그인하면 첫 말씀을 추가할 수 있습니다.`;
  } else {
    todayBox.className = "verse-list";
    todayBox.innerHTML = renderVerseCard(todayVerse, { full: true });
  }

  const due = dueVerses().slice(0, 3);
  const dueList = $("dueVerseList");
  if (!due.length) {
    dueList.innerHTML = `<div class="empty-state">오늘 복습할 말씀은 없습니다. 조용한 밭에도 뿌리는 자국은 남아 있습니다.</div>`;
  } else {
    dueList.innerHTML = due.map(v => renderVerseCard(v)).join("");
  }
}

function renderMemorize() {
  const verse = selectedVerseId ? state.verses.find(v => v.id === selectedVerseId) : activeTodayVerse();
  const empty = $("memorizeEmpty");
  const panel = $("memorizePanel");
  if (!verse) {
    empty.classList.remove("hidden");
    panel.classList.add("hidden");
    empty.innerHTML = isAdmin()
      ? `암송할 말씀이 없습니다. <button class="small" data-open-add type="button">말씀 추가하기</button>`
      : `암송할 말씀이 없습니다. 관리자 계정에서 말씀을 먼저 추가해 주세요.`;
    return;
  }
  empty.classList.add("hidden");
  panel.classList.remove("hidden");
  selectedVerseId = verse.id;

  const text = { ...defaultAppText(), ...(state.appText || {}) };
  const labels = ["1단계 · 천천히 읽기", "2단계 · 몇 단어 가리고 기억하기", "3단계 · 더 많이 가리고 말하기", "4단계 · 안 보고 적어보기"];
  $("memReference").textContent = verseDisplayReference(verse);
  $("memTopic").textContent = verse.topic || "주제 없음";
  $("stageLabel").textContent = labels[memStep];
  $("stepProgress").style.width = `${((memStep + 1) / labels.length) * 100}%`;
  $("answerInput").classList.toggle("hidden", memStep !== 3);
  $("compareBox").classList.add("hidden");
  $("resultButtons").classList.toggle("hidden", memStep !== 3);
  $("nextStepBtn").textContent = memStep === 3 ? text.scoreButton : text.nextStepButton;
  $("needPracticeBtn").textContent = text.needPracticeButton;
  $("rememberedBtn").textContent = text.rememberedButton;
  $("prevStepBtn").disabled = memStep === 0;

  if (memStep === 0) $("scriptureBox").innerHTML = escapeHtml(verse.text);
  if (memStep === 1) $("scriptureBox").innerHTML = makeBlanked(verse.text, 0.28);
  if (memStep === 2) $("scriptureBox").innerHTML = makeBlanked(verse.text, 0.55);
  if (memStep === 3) $("scriptureBox").innerHTML = escapeHtml(text.memorizePrompt);
}

function renderReview() {
  const list = $("reviewList");
  const due = dueVerses();
  if (!state.verses.length) {
    list.innerHTML = `<div class="empty-state">등록된 말씀이 없습니다. 말씀 추가는 관리자 계정에서만 가능합니다.</div>`;
    return;
  }
  if (!due.length) {
    list.innerHTML = `<div class="empty-state">오늘 복습할 말씀은 없습니다. 말씀 목록에서 새로운 씨앗을 심어 보세요.</div>`;
    return;
  }
  list.innerHTML = due.map(v => renderVerseCard(v)).join("");
}

function renderLibrary() {
  const addBtn = $("addVerseBtn");
  if (addBtn) addBtn.classList.toggle("hidden", !isAdmin());
  const query = normalize($("searchInput")?.value || "");
  const topicFilter = $("topicFilter")?.value || "";
  const topics = [...new Set(state.verses.map(v => v.topic).filter(Boolean))].sort();
  const current = $("topicFilter").value;
  $("topicFilter").innerHTML = `<option value="">전체 주제</option>` + topics.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  $("topicFilter").value = topics.includes(current) ? current : topicFilter;

  const filtered = orderedVerses().filter(v => {
    const matchesQuery = !query || normalize(`${v.number} ${v.reference} ${v.text} ${v.topic}`).includes(query);
    const matchesTopic = !$("topicFilter").value || v.topic === $("topicFilter").value;
    return matchesQuery && matchesTopic;
  });
  $("libraryList").innerHTML = filtered.length
    ? filtered.map(v => renderVerseCard(v, { full: true })).join("")
    : `<div class="empty-state">${isAdmin() ? "보이는 말씀이 없습니다. 검색어를 줄이거나 새 말씀을 추가해 보세요." : "보이는 말씀이 없습니다. 새 말씀 추가는 관리자 계정에서만 가능합니다."}</div>`;
}

function progressSummaryForAccount(accountId) {
  const map = getProgressMap(accountId);
  const values = Object.values(map);
  return {
    mastered: values.filter(p => p.mastered).length,
    success: values.reduce((sum, p) => sum + (p.successCount || 0), 0),
    fail: values.reduce((sum, p) => sum + (p.failCount || 0), 0),
    due: dueVerses(accountId).length
  };
}

function weekStart(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return dateKey(d);
}

function formatShortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function successfulHistoryForAccount(accountId, startDate, endDate) {
  return state.history.filter(item =>
    item.success &&
    item.accountId === accountId &&
    item.date >= startDate &&
    item.date <= endDate
  );
}

function rankingRows() {
  const start = weekStart(new Date());
  const end = today();
  return state.accounts.map(account => {
    const weeklyHistory = successfulHistoryForAccount(account.id, start, end);
    const progress = progressSummaryForAccount(account.id);
    return {
      account,
      weeklySuccess: weeklyHistory.length,
      weeklyUnique: new Set(weeklyHistory.map(item => item.verseId)).size,
      allTimeSuccess: progress.success,
      mastered: progress.mastered,
      due: progress.due
    };
  });
}

function renderRanking() {
  const deptFilter = $("rankingDeptFilter");
  const roleFilter = $("rankingRoleFilter");
  const list = $("rankingList");
  if (!deptFilter || !roleFilter || !list) return;

  const departments = [...new Set(state.accounts.map(account => account.department).filter(Boolean))].sort();
  const currentDept = deptFilter.value;
  deptFilter.innerHTML = `<option value="">전체 부서</option>` + departments
    .map(dept => `<option value="${escapeHtml(dept)}">${escapeHtml(dept)}</option>`)
    .join("");
  deptFilter.value = departments.includes(currentDept) ? currentDept : "";

  const start = weekStart(new Date());
  const end = today();
  $("rankingPeriod").textContent = `${formatShortDate(start)}–${formatShortDate(end)}`;

  const role = roleFilter.value || "student";
  const rows = rankingRows()
    .filter(row => !deptFilter.value || row.account.department === deptFilter.value)
    .filter(row => role === "all" || row.account.role === role)
    .sort((a, b) =>
      b.weeklySuccess - a.weeklySuccess ||
      b.weeklyUnique - a.weeklyUnique ||
      b.allTimeSuccess - a.allTimeSuccess ||
      a.account.name.localeCompare(b.account.name, "ko")
    );

  const totalWeekly = rows.reduce((sum, row) => sum + row.weeklySuccess, 0);
  const activeParticipants = rows.filter(row => row.weeklySuccess > 0).length;
  const topScore = rows[0]?.weeklySuccess || 0;
  $("rankingSummary").innerHTML = `
    <div class="ranking-mini-card"><strong>${rows.length}</strong><span>순위 대상</span></div>
    <div class="ranking-mini-card"><strong>${activeParticipants}</strong><span>이번 주 참여</span></div>
    <div class="ranking-mini-card"><strong>${totalWeekly}</strong><span>성공 기록</span></div>
  `;

  if (!state.accounts.length) {
    list.innerHTML = `<div class="empty-state">아직 등록된 계정이 없습니다. 먼저 계정을 만들어 주세요.</div>`;
    return;
  }

  if (!rows.length) {
    list.innerHTML = `<div class="empty-state">선택한 조건에 맞는 계정이 없습니다.</div>`;
    return;
  }

  list.innerHTML = rows.map((row, index) => {
    const rank = index + 1;
    const width = topScore ? Math.max(8, Math.round((row.weeklySuccess / topScore) * 100)) : 0;
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
    return `
      <article class="ranking-card">
        <div class="rank-medal ${rank <= 3 ? "top-rank" : ""}">${medal}</div>
        <div>
          <h4>${escapeHtml(row.account.name)}</h4>
          <p>${escapeHtml(row.account.department || "부서 미입력")} · ${roleLabel(row.account.role)}</p>
          <p>서로 다른 말씀 ${row.weeklyUnique}개 · 전체 성공 ${row.allTimeSuccess}회 · 익숙한 말씀 ${row.mastered}개</p>
          <div class="ranking-progress" aria-hidden="true"><span style="width:${width}%"></span></div>
        </div>
        <div class="ranking-score">
          <strong>${row.weeklySuccess}</strong>
          <span>이번 주 성공</span>
        </div>
      </article>
    `;
  }).join("");
}


function renderServerSyncPanel() {
  const panel = $("serverSyncPanel");
  if (!panel) return;
  const cfg = serverConfig();
  const enabled = serverModeEnabled();
  const urlHint = cfg.supabaseUrl ? cfg.supabaseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "") : "미입력";
  panel.innerHTML = `
    <div class="section-heading compact-heading">
      <div>
        <p class="eyebrow">Cloud sync</p>
        <h3>서버 동기화</h3>
      </div>
      <span class="badge ${enabled ? "" : "soft-badge"}">${enabled ? "서버 사용" : "로컬 사용"}</span>
    </div>
    <div class="admin-stats">
      <div class="admin-row"><strong>상태</strong><span>${escapeHtml(serverSync.message)}</span></div>
      <div class="admin-row"><strong>서버</strong><span>${escapeHtml(enabled ? urlHint : "연결 안 됨")}</span></div>
      <div class="admin-row"><strong>앱 ID</strong><span>${escapeHtml(remoteAppId())}</span></div>
      <div class="admin-row"><strong>마지막 동기화</strong><span>${escapeHtml(serverSync.lastSyncedAt || "아직 없음")}</span></div>
    </div>
    <p class="muted">${escapeHtml(serverSync.detail || "여러 휴대폰에서 같은 말씀 목록과 암송 기록을 사용하려면 서버 동기화를 켜 주세요.")}</p>
    <div class="button-row wrap">
      <button id="pullServerBtn" class="secondary" type="button" ${enabled ? "" : "disabled"}>서버에서 다시 불러오기</button>
      <button id="pushServerBtn" type="button" ${enabled && isAdmin() ? "" : "disabled"}>현재 데이터를 서버에 올리기</button>
    </div>
    <p class="muted tiny-note">서버 설정은 이 폴더의 <code>config.js</code> 파일에서 바꿉니다. 앱에서 바뀐 내용은 자동 저장되고, 수동 업로드는 관리자 계정에서만 가능합니다.</p>
  `;
}

function renderAdminTextSettings() {
  const panel = $("adminTextPanel");
  if (!panel) return;

  if (!isAdmin()) {
    panel.innerHTML = `
      <h3>관리자 설정</h3>
      <p class="muted">앱 문구와 아이콘 변경은 관리자 계정에서만 할 수 있습니다. 상단의 계정 버튼에서 <strong>관리자</strong> 계정으로 전환해 주세요.</p>
    `;
    return;
  }

  const text = { ...defaultAppText(), ...(state.appText || {}) };
  panel.innerHTML = `
    <div class="section-heading compact-heading">
      <div>
        <p class="eyebrow">Admin text</p>
        <h3>앱 문구·아이콘 변경</h3>
      </div>
      <span class="badge">관리자 전용</span>
    </div>
    <p class="muted">홈 화면, 암송 화면, 채점 화면, 결과 알림에 나오는 문구와 아이콘을 바꿀 수 있습니다. 안내 문구에는 <code>{{name}}</code>, <code>{{department}}</code>, <code>{{role}}</code>을 넣어 계정 정보가 자동으로 들어가게 할 수 있고, 점수 문구에는 <code>{{score}}</code>를 사용할 수 있습니다.</p>
    <div class="admin-text-grid">
      <label>상단 작은 문구
        <input id="textTopEyebrow" value="${escapeHtml(text.topEyebrow)}" placeholder="예: 부광교회 교회학교" />
      </label>
      <label>앱 제목
        <input id="textAppTitle" value="${escapeHtml(text.appTitle)}" placeholder="예: 부광 말씀씨앗" />
      </label>
      <label>홈 작은 문구
        <input id="textHeroEyebrow" value="${escapeHtml(text.heroEyebrow)}" placeholder="예: 오늘 마음에 심을 말씀" />
      </label>
      <label>홈 아이콘
        <input id="textHeroIcon" value="${escapeHtml(text.heroIcon)}" placeholder="예: 🌱" />
      </label>
      <label class="full-width">홈 큰 문구
        <input id="textHeroTitle" value="${escapeHtml(text.heroTitle)}" placeholder="예: 부광의 다음세대 마음밭에 말씀을" />
      </label>
      <label class="full-width">계정 사용 중 안내 문구
        <textarea id="textHeroSubtext" rows="3" placeholder="예: {{name}}님, 오늘도 말씀 한 알을 마음밭에 심어 보세요.">${escapeHtml(text.heroSubtext)}</textarea>
      </label>
      <label class="full-width">계정 없을 때 안내 문구
        <textarea id="textGuestSubtext" rows="3" placeholder="예: 계정을 만들고 말씀을 심어 보세요.">${escapeHtml(text.guestSubtext)}</textarea>
      </label>
      <label class="full-width">4단계 암송 안내 문구
        <textarea id="textMemorizePrompt" rows="2" placeholder="예: 말씀을 덮고 기억나는 만큼 적어 보세요.">${escapeHtml(text.memorizePrompt)}</textarea>
      </label>
      <label>다음 단계 버튼
        <input id="textNextStepButton" value="${escapeHtml(text.nextStepButton)}" placeholder="예: 다음" />
      </label>
      <label>채점 버튼
        <input id="textScoreButton" value="${escapeHtml(text.scoreButton)}" placeholder="예: 채점 보기" />
      </label>
      <label>연습 버튼
        <input id="textNeedPracticeButton" value="${escapeHtml(text.needPracticeButton)}" placeholder="예: 조금 더 연습" />
      </label>
      <label>성공 버튼
        <input id="textRememberedButton" value="${escapeHtml(text.rememberedButton)}" placeholder="예: 외웠어요" />
      </label>
      <label>연습 알림 아이콘
        <input id="textNeedPracticeIcon" value="${escapeHtml(text.needPracticeIcon)}" placeholder="예: 🌱" />
      </label>
      <label>성공 알림 아이콘
        <input id="textSuccessIcon" value="${escapeHtml(text.successIcon)}" placeholder="예: 🎉" />
      </label>
      <label class="full-width">연습 알림 문구
        <textarea id="textNeedPracticeToast" rows="2" placeholder="예: 괜찮습니다. 내일 다시 물을 줍니다.">${escapeHtml(text.needPracticeToast)}</textarea>
      </label>
      <label class="full-width">성공 알림 문구
        <textarea id="textSuccessToast" rows="2" placeholder="예: 복습 일정을 다시 심어 두었습니다.">${escapeHtml(text.successToast)}</textarea>
      </label>
      <label>점수 제목
        <input id="textScoreTitle" value="${escapeHtml(text.scoreTitle)}" placeholder="예: 기억 유사도 {{score}}%" />
      </label>
      <label>정정 보기 제목
        <input id="textCorrectionLabel" value="${escapeHtml(text.correctionLabel)}" placeholder="예: 정답 기준 정정 보기" />
      </label>
      <label>내 답 보기 제목
        <input id="textUserAnswerLabel" value="${escapeHtml(text.userAnswerLabel)}" placeholder="예: 내가 적은 답" />
      </label>
      <label>빈 답안 문구
        <input id="textEmptyAnswerText" value="${escapeHtml(text.emptyAnswerText)}" placeholder="예: 아직 입력한 답이 없습니다." />
      </label>
      <label class="full-width">채점 안내 문구
        <textarea id="textScoreHelp" rows="2" placeholder="예: 빨간 글자는 다시 살펴볼 부분입니다.">${escapeHtml(text.scoreHelp)}</textarea>
      </label>
    </div>
    <div class="button-row wrap">
      <button id="saveAppTextBtn" type="button">문구·아이콘 저장</button>
      <button class="secondary" id="resetAppTextBtn" type="button">기본 문구로 되돌리기</button>
    </div>
  `;
}

function saveAppTextSettings() {
  if (!isAdmin()) {
    alert("관리자 계정에서만 문구를 변경할 수 있습니다.");
    return;
  }
  const defaults = defaultAppText();
  state.appText = {
    topEyebrow: $("textTopEyebrow")?.value.trim() || defaults.topEyebrow,
    appTitle: $("textAppTitle")?.value.trim() || defaults.appTitle,
    heroEyebrow: $("textHeroEyebrow")?.value.trim() || defaults.heroEyebrow,
    heroTitle: $("textHeroTitle")?.value.trim() || defaults.heroTitle,
    heroSubtext: $("textHeroSubtext")?.value.trim() || defaults.heroSubtext,
    guestSubtext: $("textGuestSubtext")?.value.trim() || defaults.guestSubtext,
    heroIcon: $("textHeroIcon")?.value.trim() || defaults.heroIcon,
    memorizePrompt: $("textMemorizePrompt")?.value.trim() || defaults.memorizePrompt,
    nextStepButton: $("textNextStepButton")?.value.trim() || defaults.nextStepButton,
    scoreButton: $("textScoreButton")?.value.trim() || defaults.scoreButton,
    needPracticeButton: $("textNeedPracticeButton")?.value.trim() || defaults.needPracticeButton,
    rememberedButton: $("textRememberedButton")?.value.trim() || defaults.rememberedButton,
    scoreTitle: $("textScoreTitle")?.value.trim() || defaults.scoreTitle,
    scoreHelp: $("textScoreHelp")?.value.trim() || defaults.scoreHelp,
    correctionLabel: $("textCorrectionLabel")?.value.trim() || defaults.correctionLabel,
    userAnswerLabel: $("textUserAnswerLabel")?.value.trim() || defaults.userAnswerLabel,
    emptyAnswerText: $("textEmptyAnswerText")?.value.trim() || defaults.emptyAnswerText,
    needPracticeToast: $("textNeedPracticeToast")?.value.trim() || defaults.needPracticeToast,
    needPracticeIcon: $("textNeedPracticeIcon")?.value.trim() || defaults.needPracticeIcon,
    successToast: $("textSuccessToast")?.value.trim() || defaults.successToast,
    successIcon: $("textSuccessIcon")?.value.trim() || defaults.successIcon
  };
  state.appName = state.appText.appTitle;
  saveState();
  showToast("앱 문구와 아이콘을 저장했습니다.");
}

function resetAppTextSettings() {
  if (!isAdmin()) {
    alert("관리자 계정에서만 문구를 변경할 수 있습니다.");
    return;
  }
  if (!confirm("앱 상단 문구를 기본값으로 되돌릴까요?")) return;
  state.appText = defaultAppText();
  state.appName = state.appText.appTitle;
  saveState();
  showToast("기본 문구로 되돌렸습니다.");
}

function renderAdminDesignSettings() {
  const panel = $("adminDesignPanel");
  if (!panel) return;

  if (!isAdmin()) {
    panel.innerHTML = `
      <h3>배경 디자인 설정</h3>
      <p class="muted">앱 배경 디자인 변경은 관리자 계정에서만 할 수 있습니다. 관리자 계정으로 전환한 뒤 비밀번호를 입력해 주세요.</p>
    `;
    return;
  }

  const current = (state.appDesign || defaultAppDesign()).background || defaultAppDesign().background;
  panel.innerHTML = `
    <div class="section-heading compact-heading">
      <div>
        <p class="eyebrow">Admin design</p>
        <h3>앱 배경 디자인 변경</h3>
      </div>
      <span class="badge">관리자 전용</span>
    </div>
    <p class="muted">아이들이 보는 앱의 전체 배경 분위기를 바꿀 수 있습니다. 배경만 바뀌고 말씀, 계정, 암송 기록은 그대로 유지됩니다.</p>
    <div class="design-grid" role="radiogroup" aria-label="앱 배경 디자인 선택">
      ${backgroundDesignOptions().map(option => `
        <label class="design-option ${option.id === current ? "selected" : ""}">
          <input type="radio" name="appBackgroundDesign" value="${option.id}" ${option.id === current ? "checked" : ""} />
          <span class="design-preview preview-${option.id}" aria-hidden="true"></span>
          <strong>${escapeHtml(option.name)}</strong>
          <small>${escapeHtml(option.desc)}</small>
        </label>
      `).join("")}
    </div>
    <div class="button-row wrap">
      <button id="saveAppDesignBtn" type="button">배경 저장</button>
      <button class="secondary" id="resetAppDesignBtn" type="button">기본 배경으로 되돌리기</button>
    </div>
  `;
}

function saveAppDesignSettings() {
  if (!isAdmin()) {
    alert("관리자 계정에서만 배경 디자인을 변경할 수 있습니다.");
    return;
  }
  const selected = document.querySelector('input[name="appBackgroundDesign"]:checked')?.value || defaultAppDesign().background;
  if (!backgroundDesignOptions().some(option => option.id === selected)) {
    alert("선택한 배경 디자인을 찾을 수 없습니다.");
    return;
  }
  state.appDesign = { background: selected };
  saveState();
  showToast("앱 배경 디자인을 저장했습니다.");
}

function resetAppDesignSettings() {
  if (!isAdmin()) {
    alert("관리자 계정에서만 배경 디자인을 변경할 수 있습니다.");
    return;
  }
  if (!confirm("앱 배경 디자인을 기본값으로 되돌릴까요?")) return;
  state.appDesign = defaultAppDesign();
  saveState();
  showToast("기본 배경으로 되돌렸습니다.");
}

function renderAdmin() {
  renderAdminTextSettings();
  renderAdminDesignSettings();
  renderServerSyncPanel();
  const mastered = Object.values(getProgressMap()).filter(p => p.mastered).length;
  const practicedToday = state.history.filter(h => h.date === today() && accountKey(h.accountId) === accountKey()).length;
  const account = currentAccount();
  $("adminStats").innerHTML = `
    <div class="admin-row"><strong>현재 계정</strong><span>${account ? `${escapeHtml(account.name)} · ${roleLabel(account.role)}` : "미등록"}</span></div>
    <div class="admin-row"><strong>관리자 설정 권한</strong><span>${isAdmin(account) ? "문구·배경·말씀·서버 관리 가능" : "관리자 계정 필요"}</span></div>
    <div class="admin-row"><strong>등록 계정</strong><span>${state.accounts.length}개</span></div>
    <div class="admin-row"><strong>등록 말씀</strong><span>${state.verses.length}개</span></div>
    <div class="admin-row"><strong>오늘 복습 예정</strong><span>${dueVerses().length}개</span></div>
    <div class="admin-row"><strong>익숙한 말씀</strong><span>${mastered}개</span></div>
    <div class="admin-row"><strong>오늘 암송 기록</strong><span>${practicedToday}회</span></div>
  `;

  const accountList = $("accountList");
  if (!accountList) return;
  if (!state.accounts.length) {
    accountList.innerHTML = `<div class="empty-state">아직 등록된 계정이 없습니다. 상단의 계정 버튼에서 새 계정을 만들어 주세요.</div>`;
    return;
  }
  accountList.innerHTML = state.accounts.map(accountItem => {
    const summary = progressSummaryForAccount(accountItem.id);
    const active = accountItem.id === state.activeAccountId ? " active-account" : "";
    const adminStatus = accountItem.role === "admin" ? (isAdmin(accountItem) ? " · 인증됨" : " · 비밀번호 필요") : "";
    return `
      <article class="account-card${active}">
        <div>
          <strong>${escapeHtml(accountItem.name)}</strong>
          <p>${escapeHtml(accountItem.department || "부서 미입력")} · ${roleLabel(accountItem.role)}${adminStatus}</p>
          <p class="muted">복습 ${summary.due}개 · 성공 ${summary.success}회 · 익숙한 말씀 ${summary.mastered}개</p>
        </div>
        <button class="small ghost" data-action="switchAccount" data-id="${accountItem.id}" type="button">사용</button>
      </article>
    `;
  }).join("");
}

function render() {
  renderAppDesign();
  renderAppText();
  renderHome();
  renderMemorize();
  renderReview();
  renderLibrary();
  renderRanking();
  renderAdmin();
  document.querySelectorAll(".bottom-nav button").forEach(btn => btn.classList.toggle("active", btn.dataset.nav === currentView));
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === `view-${currentView}`));
}

function navigate(view, verseId = null) {
  currentView = view;
  const previousVerseId = selectedVerseId;
  if (verseId) selectedVerseId = verseId;
  if (view === "memorize") {
    memStep = 0;
    resetMemorizeAnswer();
  } else if (previousVerseId !== selectedVerseId) {
    resetMemorizeAnswer();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function openVerseDialog(verse = null) {
  if (!requireAdmin("말씀 추가와 수정은 관리자 계정으로 로그인해야 사용할 수 있습니다.")) return;
  $("verseForm").reset();
  $("verseId").value = verse?.id || "";
  $("dialogTitle").textContent = verse ? "말씀 수정" : "말씀 추가";
  $("numberInput").value = verse?.number || (verse ? "" : nextVerseNumber());
  $("referenceInput").value = verse?.reference || "";
  $("textInput").value = verse?.text || "";
  $("topicInput").value = verse?.topic || "";
  $("versionInput").value = verse?.version || "";
  $("todayInput").checked = verse ? state.todayVerseId === verse.id : state.verses.length === 0;
  $("verseDialog").showModal();
}

function populateAccountSelect(selectedId = state.activeAccountId || "") {
  const select = $("accountSelect");
  select.innerHTML = `<option value="">새 계정 만들기</option>` + state.accounts
    .map(account => `<option value="${account.id}">${escapeHtml(account.name)} · ${escapeHtml(account.department || "부서 미입력")} · ${roleLabel(account.role)}</option>`)
    .join("");
  select.value = selectedId && state.accounts.some(account => account.id === selectedId) ? selectedId : "";
}

function fillAccountForm(accountId = "") {
  const account = state.accounts.find(item => item.id === accountId);
  $("accountNameInput").value = account?.name || "";
  $("departmentInput").value = account?.department || "";
  $("accountRoleInput").value = account?.role || "student";
  $("adminPasswordInput").value = "";
  $("deleteAccountBtn").disabled = !account;
  updateAdminPasswordBox();
}

function updateAdminPasswordBox() {
  const box = $("adminPasswordBox");
  const hint = $("adminPasswordHint");
  if (!box || !hint) return;
  const selected = state.accounts.find(item => item.id === $("accountSelect")?.value);
  const role = $("accountRoleInput")?.value || "student";
  const needsPassword = selected?.role === "admin" || role === "admin";
  box.classList.toggle("hidden", !needsPassword);

  if (!needsPassword) return;
  if (selected?.role === "admin" && isAdmin(selected)) {
    hint.textContent = "이미 인증된 관리자 계정입니다. 계속 사용할 수 있습니다.";
  } else if (selected?.role === "admin") {
    hint.textContent = "관리자 계정을 사용하려면 비밀번호를 입력해 주세요.";
  } else if (role === "admin") {
    hint.textContent = "새 관리자 계정 생성이나 관리자 전환은 인증된 관리자 계정에서만 가능합니다.";
  }
}

function openAccountDialog() {
  populateAccountSelect(state.activeAccountId || "");
  fillAccountForm($("accountSelect").value);
  $("settingsDialog").showModal();
}

function saveAccountFromForm() {
  const name = $("accountNameInput").value.trim();
  const department = $("departmentInput").value.trim();
  const role = $("accountRoleInput").value;
  const selected = $("accountSelect").value;
  const passwordInput = $("adminPasswordInput")?.value.trim() || "";

  const selectedAccount = state.accounts.find(account => account.id === selected);
  const adminCount = state.accounts.filter(account => account.role === "admin").length;
  const selectedIsAdmin = selectedAccount?.role === "admin";
  const selectedAdminUnlocked = selectedIsAdmin && (isAdmin(selectedAccount) || passwordInput === adminPasswordFor(selectedAccount));

  if (selectedIsAdmin && !selectedAdminUnlocked) {
    alert("관리자 비밀번호가 맞지 않습니다.");
    return;
  }
  if (!selectedIsAdmin && role === "admin" && !isAdmin()) {
    alert("새 관리자 계정을 만들거나 관리자 권한으로 바꾸려면 먼저 관리자 계정으로 로그인해야 합니다.");
    return;
  }
  if (selectedIsAdmin && role !== "admin" && adminCount <= 1) {
    alert("관리자 계정은 최소 1개 이상 필요합니다.");
    return;
  }

  if (!name) {
    alert("이름을 입력해 주세요.");
    return;
  }
  if (!department) {
    alert("부서를 입력해 주세요.");
    return;
  }

  let id = selected;
  if (id) {
    const index = state.accounts.findIndex(account => account.id === id);
    if (index >= 0) {
      const existing = state.accounts[index];
      const updated = { ...existing, name, department, role, updatedAt: new Date().toISOString() };
      if (role === "admin") updated.password = existing.password || ADMIN_PASSWORD;
      else delete updated.password;
      state.accounts[index] = updated;
    }
  } else {
    id = crypto.randomUUID();
    const newAccount = { id, name, department, role, createdAt: new Date().toISOString() };
    if (role === "admin") newAccount.password = ADMIN_PASSWORD;
    state.accounts.push(newAccount);
  }

  if (role === "admin") authenticatedAdminId = id;
  else if (authenticatedAdminId === id) authenticatedAdminId = null;
  state.activeAccountId = id;
  getProgressMap(id);
  $("settingsDialog").close();
  saveState();
  showToast(role === "admin" ? "관리자 계정으로 로그인했습니다." : "계정을 저장하고 선택했습니다.");
}

function deleteSelectedAccount() {
  const id = $("accountSelect").value;
  const account = state.accounts.find(item => item.id === id);
  if (!account) return;
  const passwordInput = $("adminPasswordInput")?.value.trim() || "";
  if (account.role === "admin") {
    if (!isAdmin(account) && passwordInput !== adminPasswordFor(account)) {
      alert("관리자 계정을 삭제하려면 관리자 비밀번호가 필요합니다.");
      return;
    }
    if (state.accounts.filter(item => item.role === "admin").length <= 1) {
      alert("관리자 계정은 최소 1개 이상 필요합니다.");
      return;
    }
  }
  if (!confirm(`${account.name} 계정을 삭제할까요? 해당 계정의 암송 진도도 함께 지워집니다.`)) return;

  state.accounts = state.accounts.filter(item => item.id !== id);
  delete state.progressByAccount[id];
  state.history = state.history.filter(item => item.accountId !== id);
  if (authenticatedAdminId === id) authenticatedAdminId = null;
  if (state.activeAccountId === id) state.activeAccountId = state.accounts.find(item => item.role !== "admin")?.id || null;
  populateAccountSelect(state.activeAccountId || "");
  fillAccountForm($("accountSelect").value);
  saveState();
  showToast("계정을 삭제했습니다.");
}

function practiceResult(verseId, success) {
  const p = getProgress(verseId);
  const t = today();
  if (success) {
    p.level = Math.min(p.level + 1, REVIEW_INTERVALS.length - 1);
    p.successCount += 1;
    p.mastered = p.level >= 4;
    p.nextReview = addDays(t, REVIEW_INTERVALS[p.level]);
  } else {
    p.level = Math.max(0, p.level - 1);
    p.failCount += 1;
    p.mastered = false;
    p.nextReview = addDays(t, 1);
  }
  p.lastPracticed = t;
  state.history.push({ verseId, accountId: state.activeAccountId, success, date: t, at: new Date().toISOString() });
  saveState();
  const message = success
    ? `${appTextValue("successIcon")} ${appTextValue("successToast")}`.trim()
    : `${appTextValue("needPracticeIcon")} ${appTextValue("needPracticeToast")}`.trim();
  showToast(message);
}

function handleVerseAction(target) {
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) return;

  if (action === "switchAccount") {
    const account = state.accounts.find(account => account.id === id);
    if (!account) return;
    if (account.role === "admin" && !isAdmin(account)) {
      const input = prompt("관리자 비밀번호를 입력해 주세요.");
      if (input !== adminPasswordFor(account)) {
        alert("관리자 비밀번호가 맞지 않습니다.");
        return;
      }
      authenticatedAdminId = account.id;
    }
    state.activeAccountId = id;
    saveState();
    showToast(account.role === "admin" ? "관리자 계정으로 로그인했습니다." : "계정을 변경했습니다.");
    return;
  }

  const verse = state.verses.find(v => v.id === id);
  if (!verse) return;
  if (action === "memorize") navigate("memorize", id);
  if (action === "reviewSuccess") practiceResult(id, true);
  if (action === "edit") openVerseDialog(verse);
  if (action === "delete") {
    if (!requireAdmin("말씀 삭제는 관리자 계정으로 로그인해야 사용할 수 있습니다.")) return;
    if (confirm(`${verseDisplayReference(verse)} 말씀을 삭제할까요?`)) {
      state.verses = state.verses.filter(v => v.id !== id);
      Object.values(state.progressByAccount).forEach(progressMap => delete progressMap[id]);
      delete state.progress[id];
      if (state.todayVerseId === id) state.todayVerseId = state.verses[0]?.id || null;
      saveState();
      showToast("말씀을 삭제했습니다.");
    }
  }
}

function setupEvents() {
  document.body.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) navigate(nav.dataset.nav);
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) handleVerseAction(actionButton);
    if (event.target.closest("[data-open-add]")) openVerseDialog();
    if (event.target.closest("#saveAppTextBtn")) saveAppTextSettings();
    if (event.target.closest("#resetAppTextBtn")) resetAppTextSettings();
    if (event.target.closest("#saveAppDesignBtn")) saveAppDesignSettings();
    if (event.target.closest("#resetAppDesignBtn")) resetAppDesignSettings();
    if (event.target.closest("#pullServerBtn")) pullStateFromServer();
    if (event.target.closest("#pushServerBtn")) {
      if (!requireAdmin("서버에 데이터를 올리려면 관리자 계정으로 로그인해야 합니다.")) return;
      pushStateToServer();
    }
  });

  document.body.addEventListener("change", (event) => {
    if (event.target?.name === "appBackgroundDesign") {
      document.querySelectorAll(".design-option").forEach(label => {
        const input = label.querySelector("input");
        label.classList.toggle("selected", input?.checked);
      });
    }
  });

  $("addVerseBtn").addEventListener("click", () => openVerseDialog());
  $("closeVerseDialog").addEventListener("click", () => $("verseDialog").close());
  $("openSettingsBtn").addEventListener("click", openAccountDialog);
  $("homeAccountBtn").addEventListener("click", openAccountDialog);
  $("closeSettingsDialog").addEventListener("click", () => $("settingsDialog").close());
  $("installAppBtn").addEventListener("click", showInstallGuide);
  updateInstallGuide();
  $("accountSelect").addEventListener("change", () => fillAccountForm($("accountSelect").value));
  $("accountRoleInput").addEventListener("change", updateAdminPasswordBox);
  $("newAccountBtn").addEventListener("click", () => {
    $("accountSelect").value = "";
    fillAccountForm("");
    $("accountNameInput").focus();
  });
  $("deleteAccountBtn").addEventListener("click", deleteSelectedAccount);
  $("saveSettingsBtn").addEventListener("click", saveAccountFromForm);

  $("sampleBtn").addEventListener("click", () => {
    $("numberInput").value = $("numberInput").value || nextVerseNumber();
    $("referenceInput").value = "예: 요한복음 3장 16절";
    $("topicInput").value = "구원";
    $("versionInput").value = "직접 입력";
    $("textInput").value = "이곳에 암송할 성경 본문을 직접 입력하세요. 배포용 앱을 만들 때는 번역본 사용 허락을 확인해 주세요.";
  });

  $("verseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requireAdmin("말씀 저장은 관리자 계정으로 로그인해야 사용할 수 있습니다.")) return;
    const id = $("verseId").value || crypto.randomUUID();
    const payload = {
      id,
      number: $("numberInput").value.trim(),
      reference: $("referenceInput").value.trim(),
      text: $("textInput").value.trim(),
      topic: $("topicInput").value.trim(),
      version: $("versionInput").value.trim(),
      createdAt: new Date().toISOString()
    };
    const index = state.verses.findIndex(v => v.id === id);
    if (index >= 0) state.verses[index] = { ...state.verses[index], ...payload };
    else state.verses.unshift(payload);
    getProgress(id);
    if ($("todayInput").checked || !state.todayVerseId) state.todayVerseId = id;
    $("verseDialog").close();
    saveState();
    showToast("말씀을 저장했습니다.");
  });

  $("prevStepBtn").addEventListener("click", () => {
    memStep = Math.max(0, memStep - 1);
    renderMemorize();
  });
  $("nextStepBtn").addEventListener("click", () => {
    const verse = state.verses.find(v => v.id === selectedVerseId);
    if (!verse) return;
    if (memStep < 3) {
      memStep += 1;
      renderMemorize();
      return;
    }
    const answer = $("answerInput").value;
    const score = Math.round(similarity(answer, verse.text) * 100);
    $("compareBox").classList.remove("hidden");
    $("compareBox").innerHTML = renderScoreComparison(answer, verse.text, score);
  });
  $("rememberedBtn").addEventListener("click", () => {
    if (selectedVerseId) practiceResult(selectedVerseId, true);
    navigate("home");
  });
  $("needPracticeBtn").addEventListener("click", () => {
    if (selectedVerseId) practiceResult(selectedVerseId, false);
    memStep = 0;
    renderMemorize();
  });

  $("searchInput").addEventListener("input", renderLibrary);
  $("topicFilter").addEventListener("change", renderLibrary);
  $("rankingDeptFilter").addEventListener("change", renderRanking);
  $("rankingRoleFilter").addEventListener("change", renderRanking);

  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bugwang-malseum-ssiat-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  $("importInput").addEventListener("change", async (event) => {
    if (!requireAdmin("데이터 가져오기는 관리자 계정으로 로그인해야 사용할 수 있습니다.")) {
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      state = ensureShape(imported);
      saveState();
      showToast("데이터를 가져왔습니다.");
    } catch (error) {
      alert("가져오기에 실패했습니다. JSON 백업 파일인지 확인해 주세요.");
    }
    event.target.value = "";
  });
  $("resetBtn").addEventListener("click", () => {
    if (!requireAdmin("초기화는 관리자 계정으로 로그인해야 사용할 수 있습니다.")) return;
    if (confirm("모든 계정, 말씀, 진도 기록을 지울까요? 이 작업은 되돌릴 수 없습니다.")) {
      localStorage.removeItem(STORAGE_KEY);
      Object.assign(state, defaultState());
      selectedVerseId = null;
      saveState();
      showToast("초기화했습니다.");
    }
  });
}

setupEvents();
render();
updateInstallGuide();
initServerSync();

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallGuide();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallGuide();
  showToast("부광 말씀씨앗이 홈 화면에 설치되었습니다.");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
