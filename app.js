const STORAGE_KEY = "bugwangMalseumSsiat:v17";
const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60];
let state = defaultState();
let currentView = "home";
let selectedVerseId = state.todayVerseId || null;
let memStep = 0;
let authProfile = null;
let loginPurpose = "member";
let adminAccounts = [];
let remoteRankingRows = [];
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
  const texts = [
    ...document.querySelectorAll("[data-install-guide-text]"),
    $("installGuideText"),
    $("homeInstallGuideText")
  ].filter(Boolean);
  const buttons = [
    ...document.querySelectorAll("[data-install-app]"),
    $("installAppBtn"),
    $("homeInstallAppBtn")
  ].filter(Boolean);

  const uniqueTexts = [...new Set(texts)];
  const uniqueButtons = [...new Set(buttons)];
  if (!uniqueTexts.length || !uniqueButtons.length) return;

  const apply = (message, buttonText, disabled = false) => {
    uniqueTexts.forEach(text => { text.textContent = message; });
    uniqueButtons.forEach(btn => {
      btn.textContent = buttonText;
      btn.disabled = disabled;
    });
  };

  if (isStandaloneMode()) {
    apply("이미 홈 화면 앱처럼 실행 중입니다.", "설치 완료", true);
    return;
  }

  if (location.protocol === "file:") {
    apply("압축 파일 안의 index.html을 바로 열면 기본 사용은 가능하지만, 홈 화면 설치는 웹 주소로 접속해야 안정적입니다.", "설치 방법 보기");
    return;
  }

  if (deferredInstallPrompt) {
    apply("이 기기에서는 바로 설치할 수 있습니다. 버튼을 누르면 홈 화면 앱으로 추가됩니다.", "앱 설치하기");
    return;
  }

  if (isIosDevice()) {
    apply("아이폰은 Safari 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하면 됩니다.", "아이폰 설치 안내");
    return;
  }

  apply("Chrome 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하면 됩니다.", "설치 방법 보기");
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
    guestSubtext: "가입 없이 바로 시작하고, 오늘 외우고, 내일 다시 기억하고, 삶 속에 새겨 보세요.",
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
    successToast: "오탈자 없이 암송했어요! 내가 암송한 말씀에 저장했습니다.",
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

function defaultState() {
  return {
    appName: "부광 말씀씨앗",
    appText: defaultAppText(),
    appDesign: defaultAppDesign(),
    accounts: [],
    activeAccountId: null,
    verses: [],
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

  if (shaped.activeAccountId && !shaped.accounts.some(account => account.id === shaped.activeAccountId)) {
    shaped.activeAccountId = null;
  }
  return shaped;
}

function storageKeyForUser(userId = authProfile?.id) {
  return userId ? `${STORAGE_KEY}:${userId}` : null;
}

function loadStateForUser(userId) {
  try {
    const key = storageKeyForUser(userId);
    const saved = key ? localStorage.getItem(key) : null;
    if (saved) return ensureShape(JSON.parse(saved));
  } catch (error) {
    console.warn(error);
  }
  return defaultState();
}

function saveLocalStateOnly() {
  const key = storageKeyForUser();
  if (key) localStorage.setItem(key, JSON.stringify(state));
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
  return cfg.mode === "supabase-secure" && Boolean(window.MalseumSecure?.configured);
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

function sharedStateForServer() {
  return {
    appName: state.appName,
    appText: state.appText,
    appDesign: state.appDesign,
    verses: state.verses,
    todayVerseId: state.todayVerseId
  };
}

function userStateForServer() {
  if (!authProfile) return { progress: {}, history: [] };
  return {
    progress: getProgressMap(authProfile.id),
    history: state.history
      .filter(item => !item.accountId || item.accountId === authProfile.id)
      .map(item => ({ ...item, accountId: authProfile.id }))
  };
}

function setAuthStatus(message = "", isError = false) {
  const status = $("authStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function setAuthBusy(busy) {
  ["loginSubmitBtn", "registerSubmitBtn", "showRegisterBtn", "showLoginBtn", "cancelAuthBtn", "cancelRegisterBtn"].forEach(id => {
    const button = $(id);
    if (button) button.disabled = Boolean(busy);
  });
}

function showAuthGate(mode = "loading") {
  $("guestLoadingPanel")?.classList.toggle("hidden", mode !== "loading");
  $("loginPanel")?.classList.toggle("hidden", mode !== "login");
  $("registerPanel")?.classList.toggle("hidden", mode !== "register");
  $("authGate")?.classList.remove("hidden");
  $("app")?.classList.add("hidden");
  document.body.classList.add("auth-locked");
}

function showApp() {
  $("authGate")?.classList.add("hidden");
  $("app")?.classList.remove("hidden");
  document.body.classList.remove("auth-locked");
}

async function pullStateFromServer({ quiet = false } = {}) {
  if (!serverModeEnabled() || !authProfile) {
    updateSyncStatus("사용 준비 중", "기기별 안전한 기록 공간을 준비하고 있습니다.", false);
    return null;
  }
  if (syncBusy) return null;
  syncBusy = true;
  try {
    updateSyncStatus("안전하게 동기화하는 중", "공용 말씀과 내 개인 기록을 따로 불러오고 있습니다.");
    const secure = window.MalseumSecure;
    const [shared, personal, rankings] = await Promise.all([
      secure.sharedState(),
      secure.userState(authProfile.id),
      secure.rankingRows(weekStart(new Date()))
    ]);

    if (isAdmin()) {
      adminAccounts = await secure.adminProfiles();
    } else {
      adminAccounts = [];
    }

    const local = loadStateForUser(authProfile.id);
    const sharedData = shared?.data && typeof shared.data === "object" ? shared.data : {};
    state = ensureShape({
      ...local,
      ...sharedData,
      accounts: [authProfile],
      activeAccountId: authProfile.id,
      progressByAccount: { [authProfile.id]: personal?.progress || {} },
      history: Array.isArray(personal?.history)
        ? personal.history.map(item => ({ ...item, accountId: authProfile.id }))
        : []
    });
    remoteRankingRows = Array.isArray(rankings) ? rankings : [];
    saveLocalStateOnly();
    selectedVerseId = state.todayVerseId || selectedVerseId;
    const updateTimes = [shared?.updated_at, personal?.updated_at].filter(Boolean).sort();
    const updatedAt = updateTimes[updateTimes.length - 1];
    const syncScope = authProfile.isGuest ? "이 기기 전용 기록 연결됨" : "휴대폰·컴퓨터 공용 계정 연결됨";
    updateSyncStatus("보안 동기화 완료", `${syncScope}${updatedAt ? ` · ${new Date(updatedAt).toLocaleString("ko-KR")}` : ""}`);
    render();
    if (!quiet) showToast("내 기록을 안전하게 불러왔습니다.");
    return state;
  } catch (error) {
    console.warn(error);
    updateSyncStatus("서버 연결 실패", "보안 스키마와 서버 설정을 확인해 주세요.");
    if (!quiet) alert(error.message || "서버에서 데이터를 불러오지 못했습니다.");
    return null;
  } finally {
    syncBusy = false;
  }
}

async function pushStateToServer({ quiet = false } = {}) {
  if (!serverModeEnabled() || !authProfile) return false;
  if (syncBusy) return false;
  syncBusy = true;
  try {
    updateSyncStatus("내 기록을 저장하는 중", "다른 사람의 기록과 섞이지 않도록 분리해서 저장합니다.");
    const secure = window.MalseumSecure;
    const personal = userStateForServer();
    await secure.saveUserState(authProfile.id, personal);
    if (isAdmin()) await secure.saveSharedState(sharedStateForServer());
    remoteRankingRows = await secure.rankingRows(weekStart(new Date()));
    updateSyncStatus("서버 저장 완료", authProfile.isGuest
      ? "이 기기 전용 암송 기록이 안전하게 저장되었습니다."
      : "이 계정의 기록이 저장되어 다른 기기에서도 이어집니다.");
    renderRanking();
    if (!quiet) showToast("내 기록을 저장했습니다.");
    return true;
  } catch (error) {
    console.warn(error);
    updateSyncStatus("서버 저장 실패", "인터넷 연결과 보안 정책을 확인해 주세요.");
    if (!quiet) alert(error.message || "서버에 저장하지 못했습니다.");
    return false;
  } finally {
    syncBusy = false;
  }
}

function scheduleServerSave() {
  if (!syncReady || !serverModeEnabled()) return;
  clearTimeout(syncSaveTimer);
  syncSaveTimer = setTimeout(() => pushStateToServer({ quiet: true }), 900);
}

async function initServerSync() {
  showAuthGate("loading");
  if (!serverModeEnabled()) {
    $("authSetupError")?.classList.remove("hidden");
    setAuthStatus("관리자에게 서버 설정 확인을 요청해 주세요.", true);
    updateSyncStatus("서버 설정 필요", "안전한 자동 시작 설정을 완료해야 사용할 수 있습니다.", false);
    syncReady = false;
    return;
  }
  try {
    setAuthStatus("가입 없이 바로 시작할 준비를 하고 있습니다.");
    await window.MalseumSecure.startAutomatically();
    authProfile = await window.MalseumSecure.profile();
    state = loadStateForUser(authProfile.id);
    state.accounts = [authProfile];
    state.activeAccountId = authProfile.id;
    syncReady = true;
    showApp();
    await pullStateFromServer({ quiet: true });
  } catch (error) {
    console.warn(error);
    $("guestLoadingPanel")?.classList.add("hidden");
    $("loginPanel")?.classList.remove("hidden");
    setAuthStatus(error.message || "자동으로 시작하지 못했습니다. 관리자에게 알려 주세요.", true);
  }
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

function isPerfectAnswer(userAnswer, correctAnswer) {
  const user = normalize(userAnswer);
  const correct = normalize(correctAnswer);
  return Boolean(correct) && user === correct;
}

function currentAccount() {
  return authProfile || null;
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

function isAdmin(account = currentAccount()) {
  return Boolean(authProfile?.id) && account?.id === authProfile.id && isAdminAccount(account);
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
    state.progressByAccount[key] = {};
  }
  return state.progressByAccount[key];
}

function emptyProgress() {
  return {
    level: 0,
    successCount: 0,
    failCount: 0,
    lastPracticed: null,
    // 아직 한 번도 외운 적이 없는 말씀은 복습 목록에 올리지 않습니다.
    // 학생이 암송 화면에서 오탈자 없이 "외웠어요"를 눌러 완전 암송 기록이 생긴 뒤부터 복습 일정이 시작됩니다.
    nextReview: null,
    mastered: false,
    perfectCount: 0,
    lastPerfectDate: null,
    lastPerfectAt: null
  };
}

function getProgress(verseId, accountId = state.activeAccountId) {
  const map = getProgressMap(accountId);
  if (!map[verseId]) map[verseId] = emptyProgress();
  else map[verseId] = { ...emptyProgress(), ...map[verseId] };
  return map[verseId];
}

function dueVerses(accountId = state.activeAccountId) {
  const t = today();
  return orderedVerses().filter(v => {
    const p = getProgress(v.id, accountId);
    // 복습 탭에는 한 번이라도 오탈자 없이 암송한 말씀만 보여줍니다.
    // 새로 등록된 말씀이나 "조금 더 연습"만 누른 말씀은 복습 대상에서 제외됩니다.
    return (p.perfectCount || 0) > 0 && p.nextReview && p.nextReview <= t;
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
    ${isPerfectAnswer(userAnswer, correctAnswer) ? `<p class="perfect-help">오탈자 없이 암송했습니다. ‘외웠어요’를 누르면 내가 암송한 말씀에 저장됩니다.</p>` : `<p class="score-help">정정된 빨간 글자가 남아 있으면 ‘내가 암송한 말씀’에는 저장되지 않습니다.</p>`}
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
  const perfectlyMemorized = (p.perfectCount || 0) > 0 ? `<span class="badge gold">암송 완료</span>` : "";
  const version = verse.version ? `<span class="badge">${escapeHtml(verse.version)}</span>` : "";
  const preview = options.full ? verse.text : (verse.text.length > 120 ? `${verse.text.slice(0, 120)}…` : verse.text);
  const adminActions = isAdmin() ? `
        <button class="small ghost" data-action="edit" data-id="${verse.id}" type="button">수정</button>
        <button class="small ghost danger" data-action="delete" data-id="${verse.id}" type="button">삭제</button>` : "";
  return `
    <article class="verse-card">
      <h4>${numberBadge}<span>${escapeHtml(verse.reference)}</span></h4>
      <div>${topic} ${version} ${mastered} ${perfectlyMemorized}</div>
      <blockquote>${escapeHtml(preview)}</blockquote>
      <p class="muted">다음 복습: ${(p.perfectCount || 0) > 0 ? (p.nextReview || "예정 없음") : "암송 시작 전"} · 성공 ${p.successCount}회 · 연습 ${p.failCount}회</p>
      <div class="verse-actions">
        <button class="small" data-action="memorize" data-id="${verse.id}" type="button">암송</button>
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
    accountButton.textContent = "설정";
    summary.innerHTML = `<div class="empty-state">이 기기의 안전한 암송 기록 공간을 준비하고 있습니다.</div>`;
    return;
  }

  accountButton.textContent = "설정";
  const adminAuthBadge = isAdminAccount(account)
    ? `<span class="badge gold">관리자</span>`
    : `<span class="badge">${account.isGuest ? "이 기기에서만 사용" : "여러 기기 동기화"}</span>`;
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


function scrollHomeVerseCarousel(direction = 1) {
  const track = document.querySelector("#todayVerseCard .verse-carousel-track");
  if (!track) return;
  const slide = track.querySelector(".verse-carousel-slide");
  const gap = 14;
  const step = slide ? slide.getBoundingClientRect().width + gap : track.clientWidth;
  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
  const current = track.scrollLeft;
  const nearStart = current <= 8;
  const nearEnd = current >= maxScroll - 8;
  let nextLeft = current + step * direction;

  if (direction > 0 && nearEnd) nextLeft = 0;
  if (direction < 0 && nearStart) nextLeft = maxScroll;

  nextLeft = Math.max(0, Math.min(maxScroll, nextLeft));
  track.scrollTo({ left: nextLeft, behavior: "smooth" });
}

function renderHome() {
  renderAppText();
  $("statVerses").textContent = state.verses.length;
  $("statDue").textContent = dueVerses().length;
  $("statMastered").textContent = Object.values(getProgressMap()).filter(p => p.mastered).length;
  renderAccountSummary();

  const verses = orderedVerses();
  const todayBox = $("todayVerseCard");
  if (!verses.length) {
    todayBox.className = "empty-state";
    todayBox.innerHTML = isAdmin()
      ? `아직 등록된 말씀이 없습니다. <button class="small" data-open-add type="button">첫 말씀 추가하기</button>`
      : `아직 등록된 말씀이 없습니다. 관리자 계정으로 로그인하면 첫 말씀을 추가할 수 있습니다.`;
  } else {
    todayBox.className = "verse-carousel";
    todayBox.innerHTML = `
      <div class="verse-carousel-hint">옆으로 넘기거나 아래 버튼을 누르면 다른 암송구절을 볼 수 있습니다.</div>
      <div class="verse-carousel-track" aria-label="암송구절 목록">
        ${verses.map((verse, index) => `
          <div class="verse-carousel-slide" aria-label="${index + 1}번째 암송구절">
            ${renderVerseCard(verse, { full: true })}
          </div>
        `).join("")}
      </div>
      <div class="verse-carousel-controls" aria-label="암송구절 넘기기">
        <button class="small ghost" data-carousel-dir="-1" type="button">이전 구절</button>
        <button class="small ghost" data-carousel-dir="1" type="button">다음 구절</button>
      </div>
    `;
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

function memorizedVersesForAccount(accountId = state.activeAccountId) {
  const map = getProgressMap(accountId);
  return orderedVerses()
    .filter(verse => (map[verse.id]?.perfectCount || 0) > 0)
    .sort((a, b) => {
      const ap = map[a.id] || {};
      const bp = map[b.id] || {};
      return String(bp.lastPerfectAt || "").localeCompare(String(ap.lastPerfectAt || ""));
    });
}

function renderMemorizedVerseCard(verse) {
  const p = getProgress(verse.id);
  const number = verseNumberText(verse);
  const numberBadge = number ? `<span class="verse-number">${escapeHtml(number)}</span>` : "";
  const topic = verse.topic ? `<span class="badge">${escapeHtml(verse.topic)}</span>` : "";
  const version = verse.version ? `<span class="badge">${escapeHtml(verse.version)}</span>` : "";
  const completedDate = p.lastPerfectDate || "기록됨";
  return `
    <article class="verse-card memorized-card">
      <h4>${numberBadge}<span>${escapeHtml(verse.reference)}</span></h4>
      <div>${topic} ${version} <span class="badge gold">암송 완료</span></div>
      <blockquote>${escapeHtml(verse.text)}</blockquote>
      <p class="muted">암송 완료일: ${escapeHtml(completedDate)} · 완전 암송 ${p.perfectCount || 1}회 · 다음 복습: ${escapeHtml(p.nextReview || "예정 없음")}</p>
      <div class="verse-actions">
        <button class="small" data-action="memorize" data-id="${verse.id}" type="button">다시 암송</button>
      </div>
    </article>
  `;
}

function renderMyVerses() {
  const list = $("myVerseList");
  const summary = $("myVerseSummary");
  if (!list || !summary) return;

  const account = currentAccount();
  if (!account) {
    summary.innerHTML = `<div class="empty-state">계정을 먼저 선택하면 내가 암송한 말씀을 모아 볼 수 있습니다.</div>`;
    list.innerHTML = "";
    return;
  }

  const verses = memorizedVersesForAccount(account.id);
  const progressValues = Object.values(getProgressMap(account.id));
  const perfectTotal = progressValues.reduce((sum, p) => sum + (p.perfectCount || 0), 0);
  const latest = verses[0] ? getProgress(verses[0].id, account.id).lastPerfectDate : "아직 없음";

  summary.innerHTML = `
    <div class="ranking-summary memorized-summary">
      <div class="ranking-mini-card"><strong>${verses.length}</strong><span>암송한 말씀</span></div>
      <div class="ranking-mini-card"><strong>${perfectTotal}</strong><span>완전 암송 횟수</span></div>
      <div class="ranking-mini-card"><strong>${escapeHtml(latest)}</strong><span>최근 암송</span></div>
    </div>
  `;

  if (!verses.length) {
    list.innerHTML = `<div class="empty-state">아직 오탈자 없이 암송한 말씀이 없습니다. 암송 4단계에서 정답과 완전히 일치하면 이곳에 차곡차곡 저장됩니다.</div>`;
    return;
  }

  list.innerHTML = verses.map(verse => renderMemorizedVerseCard(verse)).join("");
}

function progressSummaryForAccount(accountId) {
  const map = getProgressMap(accountId);
  const values = Object.values(map);
  return {
    mastered: values.filter(p => p.mastered).length,
    memorized: values.filter(p => (p.perfectCount || 0) > 0).length,
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
    item.perfect &&
    item.accountId === accountId &&
    item.date >= startDate &&
    item.date <= endDate
  );
}

function rankingRows() {
  return remoteRankingRows.map(row => ({
    account: {
      id: row.user_id,
      name: row.display_name,
      department: row.department,
      role: row.member_role
    },
    weeklySuccess: Number(row.weekly_success) || 0,
    weeklyUnique: Number(row.weekly_unique) || 0,
    allTimeSuccess: Number(row.all_time_success) || 0,
    mastered: Number(row.mastered) || 0,
    due: 0
  }));
}

function renderRanking() {
  const deptFilter = $("rankingDeptFilter");
  const roleFilter = $("rankingRoleFilter");
  const list = $("rankingList");
  if (!deptFilter || !roleFilter || !list) return;

  const availableRows = rankingRows();
  const departments = [...new Set(availableRows.map(row => row.account.department).filter(Boolean))].sort();
  const currentDept = deptFilter.value;
  deptFilter.innerHTML = `<option value="">전체 부서</option>` + departments
    .map(dept => `<option value="${escapeHtml(dept)}">${escapeHtml(dept)}</option>`)
    .join("");
  deptFilter.value = departments.includes(currentDept) ? currentDept : "";

  const start = weekStart(new Date());
  const end = today();
  $("rankingPeriod").textContent = `${formatShortDate(start)}–${formatShortDate(end)}`;

  const role = roleFilter.value || "student";
  const rows = availableRows
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

  if (!availableRows.length) {
    list.innerHTML = `<div class="empty-state">아직 이번 주 순위 기록이 없습니다.</div>`;
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
      <button id="pushServerBtn" type="button" ${enabled && authProfile ? "" : "disabled"}>내 기록 지금 저장</button>
    </div>
    <p class="muted tiny-note">공용 말씀과 개인 기록은 서버에서 서로 분리됩니다. 일반 사용자는 자기 기록만 읽고 저장할 수 있습니다.</p>
  `;
}

function renderAdminTextSettings() {
  const panel = $("adminTextPanel");
  if (!panel) return;

  if (!isAdmin()) {
    panel.innerHTML = `
      <h3>관리자 설정</h3>
      <p class="muted">앱 문구와 아이콘 변경은 서버에서 관리자 권한을 받은 계정만 할 수 있습니다.</p>
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
        <textarea id="textGuestSubtext" rows="3" placeholder="예: 가입 없이 바로 말씀을 심어 보세요.">${escapeHtml(text.guestSubtext)}</textarea>
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
      <p class="muted">앱 배경 디자인 변경은 서버에서 관리자 권한을 받은 계정만 할 수 있습니다.</p>
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
    <div class="admin-row"><strong>사용 기록</strong><span>${isAdmin() ? `${adminAccounts.length}개` : "관리자만 확인"}</span></div>
    <div class="admin-row"><strong>등록 말씀</strong><span>${state.verses.length}개</span></div>
    <div class="admin-row"><strong>오늘 복습 예정</strong><span>${dueVerses().length}개</span></div>
    <div class="admin-row"><strong>익숙한 말씀</strong><span>${mastered}개</span></div>
    <div class="admin-row"><strong>오늘 암송 기록</strong><span>${practicedToday}회</span></div>
  `;

  const accountList = $("accountList");
  if (!accountList) return;
  if (!isAdmin()) {
    accountList.innerHTML = `<div class="empty-state">다른 회원의 계정은 보이지 않습니다. 회원 목록은 관리자만 확인할 수 있습니다.</div>`;
    return;
  }
  if (!adminAccounts.length) {
    accountList.innerHTML = `<div class="empty-state">아직 저장된 사용 기록이 없습니다.</div>`;
    return;
  }
  accountList.innerHTML = adminAccounts.map(accountItem => {
    const active = accountItem.id === authProfile?.id ? " active-account" : "";
    return `
      <article class="account-card${active}">
        <div>
          <strong>${escapeHtml(accountItem.name)}</strong>
          <p>${escapeHtml(accountItem.department || "부서 미입력")} · ${roleLabel(accountItem.role)}</p>
          <p class="muted">${accountItem.isGuest ? "가입 없이 사용하는 기기별 기록" : `아이디 ${escapeHtml(accountItem.username || "-")}`} · 시작 ${escapeHtml(accountItem.createdAt ? new Date(accountItem.createdAt).toLocaleDateString("ko-KR") : "-")}</p>
        </div>
        <div class="button-row wrap">
          ${active ? `<span class="badge gold">내 계정</span>` : `<span class="badge">보호됨</span>`}
          ${accountItem.isGuest ? `<span class="badge">자동 사용자</span>` : `<button class="small ghost" data-action="resetMemberPin" data-id="${accountItem.id}" type="button">비밀번호 초기화</button>`}
        </div>
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
  renderMyVerses();
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

function openAccountDialog() {
  const account = currentAccount();
  if (!account) {
    showAuthGate();
    return;
  }
  if ($("profileUsername")) $("profileUsername").textContent = account.isGuest
    ? "가입 없이 사용 · 이 기기 전용"
    : `${account.username || "-"} · 자동 로그인`;
  if ($("profileName")) $("profileName").textContent = account.name || "-";
  if ($("profileDepartment")) $("profileDepartment").textContent = account.department || "-";
  if ($("profileRole")) $("profileRole").textContent = roleLabel(account.role);
  if ($("profileNameInput")) $("profileNameInput").value = account.name || "";
  if ($("profileDepartmentInput")) $("profileDepartmentInput").value = account.department || "";
  if ($("settingsModeHelp")) {
    $("settingsModeHelp").textContent = isAdminAccount(account)
      ? "관리자 모드입니다. 말씀과 공용 설정을 관리한 뒤 일반 모드로 돌아갈 수 있습니다."
      : account.isGuest
      ? "현재 기록은 이 기기에서만 이어집니다. 계정을 만들면 지금 기록을 그대로 옮겨 휴대폰과 컴퓨터에서 함께 사용할 수 있습니다."
      : "이 계정은 이 기기에 자동 로그인되며, 다른 기기에서도 같은 아이디와 숫자 6자리 번호로 기록을 이어갈 수 있습니다.";
  }
  $("accountCreateBtn")?.classList.toggle("hidden", !account.isGuest);
  $("accountLoginBtn")?.classList.toggle("hidden", !account.isGuest);
  $("logoutBtn")?.classList.toggle("hidden", account.isGuest || isAdminAccount(account));
  $("adminLoginBtn")?.classList.toggle("hidden", isAdminAccount(account));
  $("adminReturnBtn")?.classList.toggle("hidden", !isAdminAccount(account));
  if ($("profileSummary")) {
    $("profileSummary").innerHTML = `
      <div class="account-card active-account">
        <div>
          <strong>${escapeHtml(account.name)}</strong>
          <p>${escapeHtml(account.department)} · ${roleLabel(account.role)}</p>
        </div>
        <span class="badge gold">${account.isGuest ? "이 기기 기록" : (isAdminAccount(account) ? "관리자" : "기기간 동기화")}</span>
      </div>`;
  }
  if (!$("settingsDialog").open) $("settingsDialog").showModal();
}

function toggleAuthPanel(showRegister) {
  $("guestLoadingPanel")?.classList.add("hidden");
  $("loginPanel")?.classList.toggle("hidden", showRegister);
  $("registerPanel")?.classList.toggle("hidden", !showRegister);
  setAuthStatus("");
  setTimeout(() => (showRegister ? $("registerUsername") : $("loginUsername"))?.focus(), 0);
}

async function finishAuthentication() {
  authProfile = await window.MalseumSecure.profile();
  state = loadStateForUser(authProfile.id);
  state.accounts = [authProfile];
  state.activeAccountId = authProfile.id;
  syncReady = true;
  showApp();
  await pullStateFromServer({ quiet: true });
  setAuthStatus("");
}

async function openAccountLogin() {
  await pushStateToServer({ quiet: true }).catch(() => {});
  loginPurpose = "member";
  $("loginEyebrow").textContent = "Login";
  $("loginTitle").textContent = "기존 계정 로그인";
  $("loginHelp").textContent = "다른 기기에서 만들었던 계정으로 로그인하면 같은 기록을 이어갈 수 있습니다.";
  $("showRegisterBtn")?.classList.remove("hidden");
  $("settingsDialog")?.close();
  toggleAuthPanel(false);
  showAuthGate("login");
  setAuthStatus("다른 기기에서 만들었던 계정으로 로그인해 주세요.");
}

async function openAdminLogin() {
  await pushStateToServer({ quiet: true }).catch(() => {});
  $("settingsDialog")?.close();
  setAuthStatus("저장된 관리자 로그인을 확인하고 있습니다.");

  try {
    const session = await window.MalseumSecure.resumeAdmin();
    if (session) {
      await finishAuthentication();
      showToast("관리자 모드로 들어왔습니다.");
      return;
    }
  } catch (error) {
    console.warn(error);
  }

  loginPurpose = "admin";
  $("loginEyebrow").textContent = "Admin";
  $("loginTitle").textContent = "관리자 로그인";
  $("loginHelp").textContent = "Supabase에서 관리자로 지정된 별도 계정의 아이디와 숫자 6자리 번호를 입력해 주세요.";
  $("showRegisterBtn")?.classList.add("hidden");
  toggleAuthPanel(false);
  showAuthGate("login");
  setAuthStatus("관리자 계정으로 로그인해 주세요.");
}

async function handleAdminReturn() {
  clearTimeout(syncSaveTimer);
  await pushStateToServer({ quiet: true }).catch(() => {});
  window.MalseumSecure.useRegularMode();
  authProfile = null;
  adminAccounts = [];
  remoteRankingRows = [];
  syncReady = false;
  state = defaultState();
  selectedVerseId = null;
  $("settingsDialog")?.close();
  await initServerSync();
  showToast("일반 모드로 돌아왔습니다.");
}

async function openAccountCreate() {
  await pushStateToServer({ quiet: true }).catch(() => {});
  loginPurpose = "member";
  if (authProfile) {
    $("registerName").value = authProfile.name?.startsWith("말씀친구 ") ? "" : (authProfile.name || "");
    $("registerDepartment").value = authProfile.department === "부광교회" ? "" : (authProfile.department || "");
    $("registerRole").value = ["student", "teacher", "minister"].includes(authProfile.role) ? authProfile.role : "student";
  }
  $("settingsDialog")?.close();
  toggleAuthPanel(true);
  showAuthGate("register");
  setAuthStatus("현재 기기의 암송 기록도 새 계정으로 함께 옮겨집니다.");
}

function cancelAccountLogin() {
  setAuthStatus("");
  if (authProfile) {
    showApp();
    return;
  }
  initServerSync();
}

async function handleProfileUpdate(event) {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    authProfile = await window.MalseumSecure.updateOwnProfile(
      $("profileNameInput").value,
      $("profileDepartmentInput").value
    );
    state.accounts = [authProfile];
    state.activeAccountId = authProfile.id;
    saveLocalStateOnly();
    render();
    openAccountDialog();
    showToast("이름과 부서를 저장했습니다.");
  } catch (error) {
    alert(error.message || "표시 정보를 저장하지 못했습니다.");
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const username = $("loginUsername").value.trim().toLowerCase();
  const pin = $("loginPin").value;
  setAuthBusy(true);
  setAuthStatus(loginPurpose === "admin" ? "관리자 권한을 확인하고 있습니다." : "로그인하고 있습니다.");
  try {
    if (loginPurpose === "admin") {
      await window.MalseumSecure.signInAdmin(username, pin);
    } else {
      await window.MalseumSecure.signIn(username, pin);
    }
    await finishAuthentication();
    $("loginPin").value = "";
    showToast(loginPurpose === "admin" ? "관리자 모드로 들어왔습니다." : "내 계정으로 로그인했습니다.");
  } catch (error) {
    setAuthStatus(error.message || "로그인하지 못했습니다.", true);
  } finally {
    setAuthBusy(false);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const pin = $("registerPin").value;
  if (pin !== $("registerPinConfirm").value) {
    setAuthStatus("두 비밀번호가 서로 다릅니다.", true);
    return;
  }
  setAuthBusy(true);
  setAuthStatus("현재 기록을 안전한 계정으로 옮기고 있습니다.");
  try {
    const guestRecordSaved = await pushStateToServer({ quiet: true });
    if (!guestRecordSaved) throw new Error("현재 기기 기록을 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    await window.MalseumSecure.registerAccount({
      username: $("registerUsername").value,
      displayName: $("registerName").value,
      department: $("registerDepartment").value,
      memberRole: $("registerRole").value,
      pin
    });
    await finishAuthentication();
    $("registerForm").reset();
    showToast("계정이 만들어졌습니다. 이제 다른 기기에서도 이어갈 수 있습니다.");
  } catch (error) {
    setAuthStatus(error.message || "계정을 만들지 못했습니다.", true);
  } finally {
    setAuthBusy(false);
  }
}

async function handleLogout() {
  if (!confirm("이 계정에서 로그아웃하고 이 기기 전용 모드로 돌아갈까요? 서버에 저장된 계정 기록은 그대로 남습니다.")) return;
  clearTimeout(syncSaveTimer);
  await pushStateToServer({ quiet: true }).catch(() => {});
  try {
    await window.MalseumSecure.signOut();
  } catch (error) {
    alert(error.message || "로그아웃하지 못했습니다.");
    return;
  }
  authProfile = null;
  adminAccounts = [];
  remoteRankingRows = [];
  syncReady = false;
  state = defaultState();
  selectedVerseId = null;
  $("settingsDialog")?.close();
  await initServerSync();
  showToast("이 기기 전용 모드로 돌아왔습니다.");
}

function practiceResult(verseId, success, options = {}) {
  const p = getProgress(verseId);
  const t = today();
  const at = new Date().toISOString();
  const perfect = Boolean(options.perfect);
  if (success) {
    const interval = REVIEW_INTERVALS[Math.min(p.level, REVIEW_INTERVALS.length - 1)];
    p.nextReview = addDays(t, interval);
    p.level = Math.min(p.level + 1, REVIEW_INTERVALS.length - 1);
    p.successCount += 1;
    p.mastered = p.level >= 4;
    if (perfect) {
      p.perfectCount = (p.perfectCount || 0) + 1;
      p.lastPerfectDate = t;
      p.lastPerfectAt = at;
    }
  } else {
    p.level = Math.max(0, p.level - 1);
    p.failCount += 1;
    p.mastered = false;
    // 이미 한 번 이상 외웠던 말씀만 복습 일정에 다시 올립니다.
    p.nextReview = p.successCount > 0 ? addDays(t, 1) : null;
  }
  p.lastPracticed = t;
  state.history.push({
    verseId,
    accountId: state.activeAccountId,
    success,
    perfect,
    score: Number.isFinite(options.score) ? options.score : null,
    date: t,
    at
  });
  saveState();
  const message = success
    ? `${appTextValue("successIcon")} ${appTextValue("successToast")}`.trim()
    : `${appTextValue("needPracticeIcon")} ${appTextValue("needPracticeToast")}`.trim();
  showToast(message);
}

async function handleVerseAction(target) {
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) return;

  if (action === "resetMemberPin") {
    if (!isAdmin()) return;
    const member = adminAccounts.find(account => account.id === id);
    if (!member) return;
    const pin = prompt(`${member.name} 회원의 새 숫자 6자리 비밀번호를 입력해 주세요.`) || "";
    if (!/^\d{6}$/.test(pin)) {
      alert("숫자 6자리로 입력해 주세요.");
      return;
    }
    if (!confirm(`${member.name} 회원의 비밀번호를 새 번호로 초기화할까요?`)) return;
    try {
      await window.MalseumSecure.resetMemberPin(id, pin);
      showToast("회원 비밀번호를 초기화했습니다.");
    } catch (error) {
      alert(error.message || "비밀번호를 초기화하지 못했습니다.");
    }
    return;
  }

  const verse = state.verses.find(v => v.id === id);
  if (!verse) return;
  if (action === "memorize") navigate("memorize", id);
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
    const carouselButton = event.target.closest("[data-carousel-dir]");
    if (carouselButton) {
      event.preventDefault();
      scrollHomeVerseCarousel(Number(carouselButton.dataset.carouselDir) || 1);
      return;
    }

    const installButton = event.target.closest("[data-install-app]");
    if (installButton) {
      event.preventDefault();
      showInstallGuide();
      return;
    }

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
  updateInstallGuide();
  $("loginForm").addEventListener("submit", handleLogin);
  $("registerForm").addEventListener("submit", handleRegister);
  $("showRegisterBtn").addEventListener("click", () => toggleAuthPanel(true));
  $("showLoginBtn").addEventListener("click", () => toggleAuthPanel(false));
  $("cancelAuthBtn").addEventListener("click", cancelAccountLogin);
  $("cancelRegisterBtn").addEventListener("click", cancelAccountLogin);
  $("accountCreateBtn").addEventListener("click", openAccountCreate);
  $("accountLoginBtn").addEventListener("click", openAccountLogin);
  $("adminLoginBtn").addEventListener("click", openAdminLogin);
  $("adminReturnBtn").addEventListener("click", handleAdminReturn);
  $("profileEditForm").addEventListener("submit", handleProfileUpdate);
  $("logoutBtn").addEventListener("click", handleLogout);

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
    if (!selectedVerseId) return;
    const verse = state.verses.find(v => v.id === selectedVerseId);
    if (!verse) return;
    const answer = $("answerInput").value;
    const score = Math.round(similarity(answer, verse.text) * 100);
    if (!isPerfectAnswer(answer, verse.text)) {
      $("compareBox").classList.remove("hidden");
      $("compareBox").innerHTML = renderScoreComparison(answer, verse.text, score);
      showToast("빨간 글자가 남아 있어요. 조금 더 연습해 주세요.");
      return;
    }
    practiceResult(selectedVerseId, true, { perfect: true, score });
    navigate("myverses");
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
    const backup = {
      format: "bugwang-malseum-ssiat-secure-v19",
      exportedAt: new Date().toISOString(),
      profile: {
        username: authProfile.username,
        name: authProfile.name,
        department: authProfile.department,
        role: authProfile.role
      },
      shared: sharedStateForServer(),
      personal: userStateForServer()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bugwang-malseum-ssiat-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  $("importInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      let personal = null;
      let shared = null;

      if (["bugwang-malseum-ssiat-secure-v17", "bugwang-malseum-ssiat-secure-v18", "bugwang-malseum-ssiat-secure-v19"].includes(imported?.format)) {
        if (!authProfile.isGuest && imported.profile?.username !== authProfile.username) {
          throw new Error("이 백업은 현재 사용 중인 기록의 백업이 아닙니다.");
        }
        personal = imported.personal || {};
        shared = imported.shared || null;
      } else {
        const legacyAccounts = Array.isArray(imported?.accounts) ? imported.accounts : [];
        const legacy = legacyAccounts.find(account =>
          account.name === authProfile.name && account.department === authProfile.department
        );
        if (legacy) {
          personal = {
            progress: imported.progressByAccount?.[legacy.id] || {},
            history: (Array.isArray(imported.history) ? imported.history : [])
              .filter(item => item.accountId === legacy.id)
          };
        }
        shared = {
          appName: imported.appName,
          appText: imported.appText,
          appDesign: imported.appDesign,
          verses: imported.verses,
          todayVerseId: imported.todayVerseId
        };
      }

      if (!personal && !isAdmin()) throw new Error("현재 계정과 일치하는 개인 기록을 찾지 못했습니다.");
      if (personal) {
        state.progressByAccount = { [authProfile.id]: personal.progress || {} };
        state.history = (Array.isArray(personal.history) ? personal.history : [])
          .map(item => ({ ...item, accountId: authProfile.id }));
      }
      if (shared && isAdmin()) {
        state = ensureShape({ ...state, ...shared });
      }
      state.accounts = [authProfile];
      state.activeAccountId = authProfile.id;
      saveState();
      showToast(isAdmin() ? "백업 자료를 안전한 구조로 가져왔습니다." : "내 암송 기록을 가져왔습니다.");
    } catch (error) {
      alert(error.message || "가져오기에 실패했습니다. JSON 백업 파일인지 확인해 주세요.");
    }
    event.target.value = "";
  });
  $("resetBtn").addEventListener("click", () => {
    if (confirm("내 암송 진도와 연습 기록만 초기화할까요? 공용 말씀과 다른 회원의 기록은 지워지지 않습니다.")) {
      state.progressByAccount = { [authProfile.id]: {} };
      state.history = [];
      selectedVerseId = state.todayVerseId || null;
      saveState();
      showToast("내 암송 기록을 초기화했습니다.");
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
