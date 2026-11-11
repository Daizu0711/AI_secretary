/* ============================================================================
   AI秘書 v2 — application
   ========================================================================== */
(() => {
"use strict";

/* ---------------------------------------------------------------------------
   0. 設定
--------------------------------------------------------------------------- */
const SUPABASE_URL = "https://pjlccscmpatxyaqcsipy.supabase.co";
const SUPABASE_KEY = "sb_publishable_DQGAX8gvJ-DvSki0OV5qJQ_Wj9MV2av";
const PREVIEW = window.__PREVIEW__ || null;
const CONFIGURED = !!PREVIEW || (!/YOUR-PROJECT/.test(SUPABASE_URL) && !/YOUR-PUBLISHABLE/.test(SUPABASE_KEY) && /^https?:\/\//.test(SUPABASE_URL));

const CHAT_KEY = "sec_chat";
const EMAIL_KEY = "sec_email";
const CACHE_KEY = "sec_cache";
const THEME_KEY = "sec_theme";
const ACCENT_KEY = "sec_accent";
const DENSITY_KEY = "sec_density";
const MOTION_KEY = "sec_motion";
const CAP_KEY = "sec_cap_default";
const FOCUS_KEY = "sec_focus_default";
const COLLAPSE_KEY = "sec_collapsed";
const STALE_KEY = "sec_show_stale";

/* ---------------------------------------------------------------------------
   1. ユーティリティ
--------------------------------------------------------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (name, cls = "ic") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const isWide = () => matchMedia("(min-width:820px)").matches;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches || localStorage.getItem(MOTION_KEY) === "reduce";

const startOfDay = d => { const x = new Date(d || Date.now()); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = d => { const x = new Date(d || Date.now()); x.setHours(23, 59, 59, 999); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pad2 = n => String(n).padStart(2, "0");
const fmtClock = v => new Date(v).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
const fmtMin = m => {
  m = Math.max(0, Math.round(m || 0));
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}時間${r}分` : `${h}時間`;
};
const fmtDateJa = d => new Date(d).toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
function toIso(v) {
  if (!v) return null;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T23:59:00";
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtDue(iso) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const dateOnly = d.getHours() === 23 && d.getMinutes() === 59;
  let date;
  if (sameDay(d, now)) date = "今日";
  else if (sameDay(d, addDays(now, 1))) date = "明日";
  else if (sameDay(d, addDays(now, -1))) date = "昨日";
  else date = d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
  return dateOnly ? date : `${date} ${fmtClock(d)}`;
}
function greetingWord(h = new Date().getHours()) {
  return h < 5 ? "こんばんは" : h < 11 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";
}

/* ---------------------------------------------------------------------------
   2. 状態
--------------------------------------------------------------------------- */
const state = {
  items: [], memory: [], projects: [], userEmail: "",
  projectId: null, projectFilter: "all", projectsMissing: false, projectsError: "",
  view: "today", listView: "today",
  taskFilter: "open", noteQuery: "", taskQuery: "", category: "",
  taskMode: localStorage.getItem("sec_task_mode") === "calendar" ? "calendar" : "list",
  calMonth: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  calSelected: ymd(new Date()), calFilter: "all",
  loaded: false, loading: false, loadError: "", lastSync: 0,
  chat: [], sending: false,
  planning: false, planAt: 0,
  capacity: null, capacityDay: "",
  focusDefault: parseInt(localStorage.getItem(FOCUS_KEY) || "25", 10),
  collapsed: new Set((() => { try { const v = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } })()),
  paletteIndex: 0, paletteItems: [],
  installPrompt: null,
  planUndo: null,
};
state.chat = (() => { try { const v = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } })();

/* 30日以上前の期限切れ(未完了)は既定で隠す。データは削除しない。 */
const STALE_DAYS = 30;
const staleCutoff = () => addDays(startOfDay(), -STALE_DAYS);
const staleHidden = () => localStorage.getItem(STALE_KEY) !== "1";
const isStale = i => i.kind === "task" && !i.done && i.due && startOfDay(i.due) <= staleCutoff();
const visibleItems = () => staleHidden() ? state.items.filter(i => !isStale(i)) : state.items;
const hiddenStaleCount = () => staleHidden() ? state.items.filter(isStale).length : 0;

const view = $("#view");
const app = $("#app");
const msgs = $("#msgs");

/* ---------------------------------------------------------------------------
   3. テーマ
--------------------------------------------------------------------------- */
function applyTheme() {
  const theme = localStorage.getItem(THEME_KEY) || "auto";
  const accent = localStorage.getItem(ACCENT_KEY) || "orange";
  const density = localStorage.getItem(DENSITY_KEY) || "cozy";
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.density = density;
  document.documentElement.dataset.motion = localStorage.getItem(MOTION_KEY) === "reduce" ? "reduce" : "full";
  const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#14110e" : "#f6f2ea");
  const btn = $("#themeBtn");
  if (btn) btn.innerHTML = icon(dark ? "sun" : "moon");
  return { theme, accent, density };
}
function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const cur = localStorage.getItem(THEME_KEY) || "auto";
  const next = order[(order.indexOf(cur) + 1) % order.length];
  localStorage.setItem(THEME_KEY, next);
  applyTheme();
  toast(next === "auto" ? "テーマ: 自動" : next === "light" ? "テーマ: ライト" : "テーマ: ダーク");
  if (state.view === "settings") renderSettings();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if ((localStorage.getItem(THEME_KEY) || "auto") === "auto") applyTheme(); });

/* ---------------------------------------------------------------------------
   4. Supabase / 認証
--------------------------------------------------------------------------- */
const sb = PREVIEW
  ? PREVIEW.client
  : supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const $lock = $("#lock"), $box = $("#lockBox"), $field = $("#lockField"), $dots = $("#lockDots"),
      $state = $("#lockState"), $hint = $("#lockHint"), $label = $("#lockLabel"), $who = $("#lockWho"),
      $curtain = $("#curtain"), $lockId = $("#lockId");

let lockMode = "password";
let pendingEmail = localStorage.getItem(EMAIL_KEY) || "";
let authFlow = false;
let dotCache = -1;
let hintTimer = 0;

const maskEmail = e => e.replace(/^(.{1,2})[^@]*(@.*)$/, "$1***$2");

function updateHint() {
  if (!CONFIGURED) {
    $hint.textContent = "PREVIEW — SUPABASE NOT CONFIGURED";
    $hint.classList.add("on");
    $hint.classList.remove("bad");
    return;
  }
  if ($hint.classList.contains("bad")) return;
  $hint.textContent = lockMode === "email" ? "PRESS ENTER TO CONTINUE" : "PRESS ENTER TO AUTHENTICATE";
  $hint.classList.toggle("on", $field.value.length > 0);
}
function errorHint(text) {
  clearTimeout(hintTimer);
  $hint.textContent = text;
  $hint.classList.remove("on");
  $hint.classList.add("bad");
  hintTimer = setTimeout(() => { $hint.classList.remove("bad"); updateHint(); }, 4500);
}
function renderDots() {
  if (lockMode !== "password") { $dots.textContent = ""; dotCache = 0; return; }
  const n = $field.value.length;
  if (n === dotCache) return;
  dotCache = n;
  $dots.textContent = "";
  for (let i = 0; i < n; i++) $dots.append("*");
  const caret = document.createElement("i");
  if (!n) caret.style.marginLeft = "0";
  $dots.append(caret);
}
function setMode(m) {
  lockMode = m;
  const email = m === "email";
  $lock.classList.remove("working");
  $box.classList.remove("busy", "ok", "bad");
  $box.classList.toggle("email", email);
  $state.textContent = "";
  $label.textContent = email ? "IDENTITY" : "PASSWORD";
  $field.type = email ? "text" : "password";
  $field.autocomplete = email ? "username" : "current-password";
  $field.inputMode = email ? "email" : "text";
  $field.value = email ? (pendingEmail || "") : "";
  $field.placeholder = email ? "you@example.com" : "";
  $field.setAttribute("aria-label", email ? "Email" : "Password");
  $who.classList.toggle("hide", email || !pendingEmail);
  $who.textContent = pendingEmail ? `ID  ${maskEmail(pendingEmail)}` : "";
  $lockId.value = pendingEmail;
  dotCache = -1;
  renderDots();
  updateHint();
  setTimeout(() => {
    if (!$lock.classList.contains("show")) return;
    try { $field.focus({ preventScroll: true }); } catch { $field.focus(); }
  }, 40);
}
function showLock() {
  authFlow = false;
  $lock.classList.add("show");
  $lock.classList.remove("curtain");
  app.classList.remove("ready");
  setMode(CONFIGURED && !pendingEmail ? "email" : "password");
}
function hideLock() { $lock.classList.remove("show", "curtain", "working"); }
async function unlock(animate) {
  if (animate) { hideLock(); }
  else hideLock();
  app.classList.add("ready");
  loadAll().then(greet);
  subscribe();
}
async function deny(reason) {
  $box.classList.remove("busy", "ok");
  $box.classList.add("bad");
  $state.textContent = "DENIED";
  await wait(reducedMotion() ? 200 : 1200);
  $box.classList.remove("bad");
  $lock.classList.remove("working");
  $state.textContent = "";
  $field.value = "";
  dotCache = -1;
  renderDots();
  authFlow = false;
  lockMode = "password";
  $who.classList.toggle("hide", !pendingEmail);
  errorHint(reason);
  try { $field.focus({ preventScroll: true }); } catch {}
}
async function grant() {
  $box.classList.remove("busy", "bad");
  $box.classList.add("ok");
  $state.textContent = "ACCESS GRANTED";
  await wait(reducedMotion() ? 120 : 700);
  if (reducedMotion()) { authFlow = false; unlock(); return; }
  $lock.classList.add("curtain");
  $curtain.classList.add("show");
  await wait(30);
  $curtain.classList.add("grow");
  await wait(450);
  $curtain.classList.add("open");
  await wait(460);
  $curtain.classList.add("light");
  await wait(620);
  unlock();
  $curtain.classList.add("fade");
  await wait(520);
  $curtain.classList.remove("show", "grow", "open", "light", "fade");
  authFlow = false;
}
function withTimeout(p, ms) {
  let t;
  const timer = new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" })), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}
function errText(msg = "") {
  if (!navigator.onLine) return "NO CONNECTION";
  if (/invalid login credentials/i.test(msg)) return "INVALID CREDENTIALS";
  if (/email not confirmed/i.test(msg)) return "EMAIL NOT CONFIRMED";
  if (/rate limit|too many/i.test(msg)) return "TOO MANY ATTEMPTS";
  if (/fetch|network|timeout/i.test(msg)) return "CONNECTION FAILED";
  return "ACCESS DENIED";
}
async function submitLock() {
  if (authFlow || $box.classList.contains("busy")) return;
  const value = $field.value;
  if (!CONFIGURED) { errorHint("SUPABASE NOT CONFIGURED — set SUPABASE_KEY first"); return; }
  if (lockMode === "email") {
    const email = value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errorHint("INVALID IDENTITY"); return; }
    pendingEmail = email;
    setMode("password");
    return;
  }
  if (!value) { errorHint("ENTER PASSWORD"); return; }
  if (!pendingEmail) { setMode("email"); return; }
  authFlow = true;
  $lock.classList.add("working");
  $box.classList.remove("email", "ok", "bad");
  $box.classList.add("busy");
  $who.classList.add("hide");
  $hint.textContent = "";
  $hint.classList.remove("on", "bad");
  try {
    const { error } = await withTimeout(sb.auth.signInWithPassword({ email: pendingEmail, password: value }), 25000);
    if (error) { await deny(errText(error.message)); return; }
    localStorage.setItem(EMAIL_KEY, pendingEmail);
    await grant();
  } catch (e) {
    console.error(e);
    await deny(e && e.name === "TimeoutError" ? "CONNECTION TIME-OUT" : "CONNECTION FAILED");
  }
}
$("#lockForm").addEventListener("submit", e => { e.preventDefault(); submitLock(); });
$field.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); submitLock(); } });
$field.addEventListener("input", () => { if (lockMode === "password") renderDots(); updateHint(); });
$field.addEventListener("change", () => { if (lockMode === "password") renderDots(); });
$who.addEventListener("click", () => { if (!authFlow) setMode("email"); });
setInterval(() => {
  if (lockMode !== "password" || !$lock.classList.contains("show")) return;
  if ($field.value.length !== dotCache) { renderDots(); updateHint(); }
}, 300);

if (PREVIEW) {
  setMode("password");
  hideLock();
  app.classList.add("ready");
  state.userEmail = "sota@example.com";
  setTimeout(() => { loadAll(); }, 0);
} else {
  setMode(CONFIGURED && pendingEmail ? "password" : CONFIGURED ? "email" : "password");
  sb.auth.onAuthStateChange((event, session) => {
    if (session) {
      state.userEmail = session.user?.email || pendingEmail;
      if (state.userEmail) { pendingEmail = state.userEmail; localStorage.setItem(EMAIL_KEY, state.userEmail); }
      updateIdentity();
      if (authFlow) return;
      app.classList.add("ready");
      hideLock();
      loadAll().then(greet);
      subscribe();
    } else {
      state.userEmail = "";
      if (chan) { sb.removeChannel(chan); chan = null; }
      state.items = []; state.memory = []; state.projects = []; state.projectId = null;
      if (authFlow) return;
      showLock();
    }
  });
}

/* ---------------------------------------------------------------------------
   5. データ
--------------------------------------------------------------------------- */
let chan = null;

function cacheSave() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      at: Date.now(),
      items: state.items.filter(i => !i.mb),
      memory: state.memory,
      projects: state.projects,
    }));
  } catch {}
}
function cacheLoad() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!c || !Array.isArray(c.items)) return false;
    state.items = c.items; state.memory = c.memory || [];
    state.projects = Array.isArray(c.projects) ? c.projects : [];
    state.lastSync = c.at; state.loaded = true;
    return true;
  } catch { return false; }
}

async function loadItems() {
  if (!state.loaded) { state.loading = true; if (state.view !== "settings") renderList(); }
  const [r1, r2] = await Promise.all([
    sb.from("sec_items").select("*").order("created_at", { ascending: false }),
    sb.from("managebac_tasks").select("*").order("due_iso", { ascending: true, nullsFirst: false }),
  ]);
  const { data, error } = r1;
  state.loading = false;
  if (error) {
    if (state.loaded) { toast("同期できませんでした", 2500); return; }
    if (cacheLoad()) { state.loadError = ""; renderApp(); toast("オフラインのキャッシュを表示中", 3000); return; }
    state.loadError = error.message;
    renderList();
    return;
  }
  state.loadError = "";
  state.loaded = true;
  state.lastSync = Date.now();
  const mbRows = (r2.data || []).map(t => ({
    id: "mb_" + t.task_id, mb_id: t.task_id, mb: true, kind: "task", title: t.title,
    due: t.due_iso, category: t.class_name || "ManageBac",
    est_minutes: t.est_minutes ?? null,
    done: ["Submitted", "Complete", "Excused"].includes(t.status),
    body: t.detail || "", url: t.url, mb_status: t.status || "", submittable: !!t.submittable,
    difficulty: t.difficulty ?? null, importance: t.importance ?? null,
    ai_score: t.ai_score ?? null, scored_at: t.scored_at ?? null,
    plan_day: t.plan_day ?? null,
    scheduled_start: t.scheduled_start ?? null, scheduled_end: t.scheduled_end ?? null,
    created_at: t.fetched_at, updated_at: t.fetched_at,
  }));
  const mbSample = (r2.data || [])[0] || null;
  state.mbRaw = mbSample;
  state.mbHasScoreCols = !!mbSample && ("plan_day" in mbSample) && ("scored_at" in mbSample);
  state.items = [...(data || []), ...mbRows];
  cacheSave();
  renderApp();
  updateIdentity();
  const open = visibleItems().filter(i => i.kind === "task" && !i.done);
  if (open.length && localStorage.getItem("sec_autoplan") !== "0") {
    setTimeout(() => autoPlan({ silent: true }), 600);
  }
  // AI推定が未実施/古いタスクがあれば、自動でスコアリングする
  if (open.length && localStorage.getItem("sec_autoscore") !== "0" && unscoredCount()) {
    setTimeout(() => scoreTasks({ limit: 25 }), 1600);
  }
}
async function loadMemory() {
  const { data } = await sb.from("sec_memory").select("*").order("created_at");
  state.memory = data || [];
  if (state.view === "settings") refreshMemList();
}
async function loadProjects() {
  const [rp, rm] = await Promise.all([
    sb.from("sec_projects").select("*").order("created_at", { ascending: false }),
    sb.from("sec_milestones").select("*").order("sort", { ascending: true }),
  ]);
  if (rp.error) {
    state.projectsError = rp.error.message || "unknown";
    state.projectsMissing = /relation|does not exist|schema cache|42P01/i.test(state.projectsError);
    if (!state.projectsMissing) console.warn("projects:", state.projectsError);
    return;
  }
  state.projectsError = "";
  state.projectsMissing = false;
  const ms = rm.data || [];
  state.projects = (rp.data || []).map(p => ({
    ...p,
    milestones: ms.filter(m => m.project_id === p.id).sort((a, b) => (a.sort || 0) - (b.sort || 0)),
  }));
}
async function loadAll() { await Promise.all([loadItems(), loadMemory(), loadProjects()]); }

function subscribe() {
  if (chan || PREVIEW) return;
  chan = sb.channel("sec")
    .on("postgres_changes", { event: "*", schema: "public", table: "sec_items" }, () => loadItems())
    .on("postgres_changes", { event: "*", schema: "public", table: "sec_memory" }, () => loadMemory())
    .on("postgres_changes", { event: "*", schema: "public", table: "managebac_tasks" }, () => loadItems())
    .on("postgres_changes", { event: "*", schema: "public", table: "sec_projects" }, () => loadProjects())
    .on("postgres_changes", { event: "*", schema: "public", table: "sec_milestones" }, () => loadProjects())
    .subscribe();
}

/* ---------------------------------------------------------------------------
   6. 計画エンジン
--------------------------------------------------------------------------- */
const PLAN_DAYS = 10;
const BREAK_MIN = 10;
const MIN_BLOCK = 15;

function defaultCap() {
  const v = parseInt(localStorage.getItem(CAP_KEY) || "180", 10);
  return Number.isFinite(v) ? v : 180;
}
function todayCapacity() {
  if (state.capacity != null && state.capacityDay === ymd(new Date())) return state.capacity;
  const stored = parseInt(localStorage.getItem("sec_cap_" + ymd(new Date())) || "", 10);
  return Number.isFinite(stored) ? stored : defaultCap();
}
function setCapacity(min) {
  state.capacity = min;
  state.capacityDay = ymd(new Date());
  localStorage.setItem("sec_cap_" + ymd(new Date()), String(min));
  renderList();
  autoPlan({ manual: true });
}
function planWindows(day) {
  const w = day.getDay();
  return (w === 0 || w === 6) ? [[9 * 60, 12 * 60], [13 * 60, 18 * 60], [19 * 60, 22 * 60]] : [[16 * 60, 22 * 60]];
}
function planCap(day) {
  const w = day.getDay();
  const base = (w === 0 || w === 6) ? 300 : 240;
  if (sameDay(day, new Date())) return Math.min(base, todayCapacity());
  return base;
}
function slotIn(blocks, est, from, to) {
  const sorted = [...blocks].sort((a, b) => a.s - b.s);
  let s = from;
  for (const b of sorted) {
    if (s + est <= b.s) return s;
    if (s < b.e) s = b.e + BREAK_MIN;
  }
  return s + est <= to ? s : null;
}
function plannedToday() {
  const s = startOfDay(), e = endOfDay();
  return visibleItems()
    .filter(i => i.kind === "task" && i.scheduled_start)
    .filter(i => { const d = new Date(i.scheduled_start); return d >= s && d <= e; })
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
}
function estFactorMap() {
  const map = new Map();
  state.items.filter(i => i.kind === "task" && !i.mb && i.est_minutes && i.actual_min).forEach(i => {
    const k = (i.category || "").trim();
    const arr = map.get(k) || [];
    arr.push(i.actual_min / i.est_minutes);
    map.set(k, arr);
  });
  const out = {};
  map.forEach((arr, k) => {
    if (arr.length >= 2) {
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      out[k] = clamp(avg, 0.5, 2);
    }
  });
  return out;
}

const estMinutes = i => Math.max(5, Math.round(i.est_minutes || 30));
function dueDays(iso, now = new Date()) {
  if (!iso) return null;
  return Math.round((startOfDay(iso) - startOfDay(now)) / 864e5);
}
function projectForTask(i) {
  return state.projects.find(p => !p.archived && (
    (p.subject && i.category && p.subject === i.category) ||
    (i.body && p.title && i.body.includes(p.title))
  ));
}
function taskScore(i, { now = new Date(), free = null } = {}) {
  if (!i || i.done || isStale(i)) return -Infinity;
  let score = 0;
  const days = dueDays(i.due, now);
  if (days == null) score += 8;
  else if (days < 0) score += 80 + Math.max(-15, days + 3); // 1日前=82, 30日前=65
  else if (days === 0) score += 95;
  else if (days === 1) score += 75;
  else if (days <= 3) score += 60;
  else if (days <= 7) score += 45;
  else if (days <= 30) score += 25;
  else score += 10;
  score += (i.priority || 0) * 10;
  const est = estMinutes(i);
  if (free != null && free > 0) {
    if (est <= free) score += 12;
    else score -= 15;
  }
  if (est <= 15) score += 5;
  else if (est <= 25) score += 3;
  else if (est >= 90) score -= 3;
  const pj = projectForTask(i);
  if (pj) {
    score += 6;
    const pd = dueDays(pj.due, now);
    if (pd != null && pd >= 0 && pd <= 7) score += 10;
    else if (pd != null && pd < 0) score += 8;
    if (projectProgress(pj) < 50) score += 4;
  }
  return score;
}
function taskReasons(i, free = null, now = new Date()) {
  const out = [];
  const days = dueDays(i.due, now);
  if (days != null) {
    if (days < 0) out.push(`期限切れ${-days}日`);
    else if (days === 0) out.push("今日が期限");
    else if (days <= 2) out.push(`あと${days}日`);
  }
  if ((i.priority || 0) >= 2) out.push("優先度高");
  else if ((i.priority || 0) === 1) out.push("優先度中");
  const pj = projectForTask(i);
  if (pj) out.push(`${pj.kind}の続き`);
  const est = estMinutes(i);
  if (free != null && free >= 15) {
    if (est <= free) out.push(`空き${fmtMin(free)}に合う`);
    else out.push(`空き${fmtMin(free)}では足りない`);
  }
  if (est <= 20) out.push(`${est}分`);
  return out.slice(0, 3);
}
function isLateScheduled(i) {
  if (!i || !i.due || !i.scheduled_start) return false;
  const s = new Date(i.scheduled_start);
  const e = i.scheduled_end ? new Date(i.scheduled_end) : new Date(s.getTime() + estMinutes(i) * 60000);
  return e.getTime() > new Date(i.due).getTime() + 60000;
}

function freeMinutesNow(now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const win = planWindows(now).find(([s, e]) => mins >= s && mins < e);
  if (!win) return 0;
  const blocks = plannedToday().filter(i => !i.done).map(i => {
    const s = new Date(i.scheduled_start);
    const sm = s.getHours() * 60 + s.getMinutes();
    const e = i.scheduled_end ? new Date(i.scheduled_end) : new Date(s.getTime() + estMinutes(i) * 60000);
    const em = e.getHours() * 60 + e.getMinutes();
    return { s: sm, e: em };
  }).sort((a, b) => a.s - b.s);
  if (blocks.some(b => b.s <= mins && mins < b.e)) return 0;
  const next = blocks.find(b => b.s > mins);
  const end = next ? Math.min(next.s, win[1]) : win[1];
  return Math.max(0, end - mins - 5);
}
function todayCandidates(limit = 4, { now = new Date(), free } = {}) {
  const f = free === undefined ? freeMinutesNow(now) : free;
  const s = startOfDay(now), e = endOfDay(now);
  const pool = visibleItems().filter(i => {
    if (i.kind !== "task" || i.done) return false;
    if (i.scheduled_start) {
      const d = new Date(i.scheduled_start);
      if (d > e && !(i.due && new Date(i.due) <= e)) return false;
    }
    return true;
  });
  return pool.map(item => ({ item, score: taskScore(item, { now, free: f }) }))
    .filter(x => Number.isFinite(x.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function autoPlan({ manual = false, silent = false } = {}) {
  if (state.planning || !state.loaded) return;
  if (!manual && Date.now() - state.planAt < 10 * 60 * 1000) return;
  const open = visibleItems().filter(i => i.kind === "task" && !i.done);
  if (!open.length) { if (manual) toast("計画するタスクがありません(タスクを追加するか、ManageBacを取り込んでください)"); return; }
  if (!open.some(i => !i.mb) && state.items.length && !("scheduled_start" in state.items[0])) {
    if (manual) toast("先に supabase/phase3.sql を再実行してください", 5000);
    return;
  }
  if (state.items.length && !("scheduled_start" in state.items[0])) {
    if (manual) toast("先に supabase/phase2.sql を実行してください", 4500);
    return;
  }
  state.planning = true;
  state.planAt = Date.now();
  const factors = estFactorMap();
  const today = startOfDay();
  const now = new Date();
  const ordered = [...open].sort((a, b) => {
    const sa = taskScore(a, { now }), sb = taskScore(b, { now });
    if (sa !== sb) return sb - sa;
    const ad = a.due ? +new Date(a.due) : Infinity, bd = b.due ? +new Date(b.due) : Infinity;
    if (ad !== bd) return ad - bd;
    return estMinutes(b) - estMinutes(a);
  });

  const days = new Map();
  const plan = [];

  for (const t of ordered) {
    const f = factors[(t.category || "").trim()] || 1;
    const est = clamp(Math.round((t.est_minutes || 30) * f), 10, 240);
    const due = t.due ? new Date(t.due) : null;
    const duePast = due && due < now;
    // 期限切れ・今日締切は今日〜2日以内に寄せる。未来の期限は期限日まで、期限なしは1週間以内。
    const dueDay = due ? startOfDay(due) : null;
    const lastDay = duePast ? addDays(today, 2)
      : dueDay && dueDay > today ? dueDay
      : addDays(today, 2);
    let placed = null;
    for (let d = 0; d < PLAN_DAYS; d++) {
      const day = addDays(today, d);
      if (day > lastDay) break;
      const key = ymd(day);
      let st = days.get(key);
      if (!st) { st = { used: 0, blocks: [] }; days.set(key, st); }
      if (st.used + est > planCap(day) || st.blocks.length >= 5) continue;
      for (const [ws, we] of planWindows(day)) {
        let from = ws, to = we;
        if (sameDay(day, now)) from = Math.max(from, now.getHours() * 60 + now.getMinutes() + 10);
        if (due && !duePast && sameDay(day, due)) to = Math.min(to, due.getHours() * 60 + due.getMinutes() - 5);
        if (to - from < Math.max(MIN_BLOCK, Math.min(est, 20))) continue;
        const start = slotIn(st.blocks, est, from, to);
        if (start != null) { placed = { day, start, end: start + est, key }; break; }
      }
      if (placed) break;
    }
    if (!placed) continue;
    const st = days.get(placed.key);
    st.blocks.push({ s: placed.start, e: placed.end });
    st.used += est;
    plan.push({ id: t.id, start: atMinutes(placed.day, placed.start), end: atMinutes(placed.day, placed.end), est });
  }

  const changed = [];
  for (const p of plan) {
    const it = state.items.find(x => x.id === p.id);
    if (!it) continue;
    const sIso = p.start.toISOString(), eIso = p.end.toISOString();
    const same = it.scheduled_start && it.scheduled_end &&
      Math.abs(new Date(it.scheduled_start) - p.start) < 60000 &&
      Math.abs(new Date(it.scheduled_end) - p.end) < 60000;
    if (!same) {
      changed.push({
        id: it.id, kind: it.kind, title: it.title, body: it.body || "",
        due: it.due, category: it.category || "", est_minutes: it.est_minutes,
        ai_hidden: !!it.ai_hidden, priority: it.priority || 0,
        scheduled_start: sIso, scheduled_end: eIso,
      });
    }
    it.scheduled_start = sIso;
    it.scheduled_end = eIso;
  }
  for (const t of open) {
    if (!plan.some(p => p.id === t.id) && t.scheduled_start) {
      changed.push({
        id: t.id, kind: t.kind, title: t.title, body: t.body || "",
        due: t.due, category: t.category || "", est_minutes: t.est_minutes,
        ai_hidden: !!t.ai_hidden, priority: t.priority || 0,
        scheduled_start: null, scheduled_end: null,
      });
      t.scheduled_start = null;
      t.scheduled_end = null;
    }
  }
  if (changed.length) {
    const { error } = await sb.from("sec_items").upsert(changed);
    if (error) {
      console.error(error);
      toast("計画を保存できませんでした", 3500);
      state.planning = false;
      return;
    }
  }
  state.planning = false;
  renderList();
  if (manual) toast(changed.length ? "計画を組み直しました" : "計画は最新です");
}
const atMinutes = (day, m) => { const x = new Date(day); x.setHours(0, 0, 0, 0); x.setMinutes(m); return x; };

/* ---------------------------------------------------------------------------
   6.5 AIスコアリング(所要時間・難易度・重要度)と日別の自動割り当て
--------------------------------------------------------------------------- */
const SCORE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const scoring = { running: false, at: 0, lastError: "", summary: "" };

const needScore = i => i.kind === "task" && !i.done && (!i.scored_at || (Date.now() - new Date(i.scored_at).getTime()) > SCORE_STALE_MS);
const scoredTasks = () => visibleItems().filter(i => i.kind === "task" && !i.done && i.ai_score);
const unscoredCount = () => visibleItems().filter(needScore).length;

function taskPayload(i) {
  const pj = projectForTask(i);
  return {
    id: i.id,
    title: i.title,
    category: i.category || "",
    due: i.due || null,
    est_minutes: i.est_minutes ?? null,
    priority: i.priority ?? 0,
    body: (i.body || "").slice(0, 200),
    project: pj ? { kind: pj.kind, title: pj.title, stage: pj.stage, due: pj.due } : null,
  };
}
function scoreBadge(i) {
  if (!i.ai_score) return "";
  const d = i.difficulty, im = i.importance;
  if (!d && !im) return "";
  const bars = n => "●".repeat(n) + "○".repeat(5 - n);
  return `<span class="pill gray" title="難易度 / 重要度">難${bars(d || 0)} 重${bars(im || 0)}</span>`;
}
function scoreReason(i) {
  const s = i.ai_score;
  if (!s) return "";
  return `<span class="pill gray" title="${esc(s.reason || "")}">AI推定</span>`;
}

async function scoreTasks({ manual = false, limit = 40 } = {}) {
  if (scoring.running) return;
  if (!state.loaded) return;
  const targets = visibleItems().filter(needScore).slice(0, limit);
  if (!targets.length) { if (manual) toast("推定が必要なタスクはありません"); return; }
  const mbTasks = targets.filter(i => i.mb);
  const missing = [];
  if (!state.items.length || !("ai_score" in state.items[0])) missing.push("sec_items");
  // ManageBac行はスクレイパーが返す列に ai_score が無い場合があるため、取得結果で判定する
  if (mbTasks.length && !state.mbHasScoreCols) missing.push("managebac_tasks");
  if (missing.length) {
    if (manual) toast(`先に supabase/phase3.sql を再実行してください (${missing.join(" / ")})`, 6000);
    return;
  }
  scoring.running = true;
  scoring.at = Date.now();
  scoring.lastError = "";
  if (manual) toast(`${targets.length}件をAIが推定中…`, 4000);
  renderList();
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { data, error } = await withTimeout(sb.functions.invoke("ai", {
      body: {
        purpose: "score_tasks",
        tasks: targets.map(taskPayload),
        tz,
        now: new Date().toLocaleString("ja-JP", { dateStyle: "full", timeStyle: "short", timeZone: tz }),
      },
    }), 90000);
    if (error) {
      let m = error.message;
      try { const j = await error.context.json(); m = j.error || m; } catch {}
      throw new Error(m);
    }
    const res = data?.scoring;
    if (!res || !res.items?.length) throw new Error("AIが推定結果を返しませんでした");
    scoring.summary = res.summary || "";
    await applyScoring(res.items);
    toast(`${res.items.length}件の所要時間・難易度・重要度を推定しました`, 4000);
  } catch (e) {
    scoring.lastError = e.message || String(e);
    console.warn("scoreTasks:", e);
    if (manual) toast("AI推定に失敗: " + scoring.lastError.slice(0, 120), 6000);
  } finally {
    scoring.running = false;
    renderList();
  }
}

async function applyScoring(items) {
  const now = new Date().toISOString();
  const today = startOfDay();
  const patch = [];
  const scored = [];
  for (const s of items) {
    const it = state.items.find(x => x.id === s.id);
    if (!it) continue;
    const dayOffset = Number.isFinite(s.day_offset) ? clamp(s.day_offset, 0, 7) : null;
    const planDay = dayOffset == null ? null : ymd(addDays(today, dayOffset));
      // ユーザーが手で入れた見積りは尊重し、無い場合だけAI値を使う
    const est = it.est_minutes ?? s.est_minutes ?? null;
    const aiScore = {
      est_minutes: s.est_minutes ?? null, difficulty: s.difficulty ?? null,
      importance: s.importance ?? null, reason: s.reason || "",
    };
    const rec = it.mb
      ? { task_id: it.mb_id, est_minutes: est, difficulty: s.difficulty ?? null,
          importance: s.importance ?? null, ai_score: aiScore, scored_at: now, plan_day: planDay }
      : { id: it.id, kind: it.kind, title: it.title, body: it.body || "",
          due: it.due, category: it.category || "", est_minutes: est,
          ai_hidden: !!it.ai_hidden, priority: it.priority || 0,
          difficulty: s.difficulty ?? null, importance: s.importance ?? null,
          ai_score: aiScore, scored_at: now, ai_score_at: now, plan_day: planDay };
    patch.push(rec);
    scored.push({ it, s, planDay, dayOffset });
  }
  if (!patch.length) return;
  const own = patch.filter(r => r.id);
  const mbPatch = patch.filter(r => r.task_id);
  if (own.length) {
    const { error } = await sb.from("sec_items").upsert(own);
    if (error) throw new Error(error.message);
  }
  if (mbPatch.length) {
    const { error } = await sb.from("managebac_tasks").upsert(mbPatch);
    if (error) throw new Error(error.message);
  }
  for (const { it, s, planDay } of scored) {
    it.est_minutes = it.est_minutes ?? s.est_minutes ?? null;
    it.difficulty = s.difficulty ?? null;
    it.importance = s.importance ?? null;
    it.ai_score = { est_minutes: s.est_minutes ?? null, difficulty: s.difficulty ?? null, importance: s.importance ?? null, reason: s.reason || "" };
    it.scored_at = now;
    it.ai_score_at = now;
    it.plan_day = planDay;
  }
  cacheSave();
  await assignDays(scored);
}

/* 予定を書き戻すレコード(sec_items と managebac_tasks で列が違うので分ける) */
function schedRec(it, planDay, startISO, endISO) {
  const common = {
    est_minutes: it.est_minutes ?? null,
    difficulty: it.difficulty ?? null, importance: it.importance ?? null,
    ai_score: it.ai_score ?? null, scored_at: it.scored_at, plan_day: planDay,
    scheduled_start: startISO, scheduled_end: endISO,
  };
  if (it.mb) return { task_id: it.mb_id, ...common };
  return {
    id: it.id, kind: it.kind, title: it.title, body: it.body || "",
    due: it.due, category: it.category || "", ai_hidden: !!it.ai_hidden,
    priority: it.priority || 0, ai_score_at: it.ai_score_at, ...common,
  };
}

/* plan_day に沿って scheduled_start を組み、今日の分をタイムラインへ置く */
async function assignDays(scored) {
  const today = startOfDay();
  const byDay = new Map();
  for (const { it, planDay } of scored) {
    if (!planDay) continue;
    const arr = byDay.get(planDay) || [];
    arr.push(it);
    byDay.set(planDay, arr);
  }
  const todayKey = ymd(today);
  const others = new Map();
  const upserts = [];

  // 今日以外: その日の窓に順番に積むだけ(タイムライン表示はされない)
  for (const [dayKey, list] of byDay) {
    if (dayKey === todayKey) continue;
    const day = dayFromKey(dayKey);
    others.set(dayKey, list);
  }

  // 今日の分: 現在時刻以降の窓に、難易度の高い順→締切順で配置
  const todayItems = (byDay.get(todayKey) || []).slice();
  if (todayItems.length) {
    const now = new Date();
    const cap = todayCapacity();
    const ordered = todayItems.sort((a, b) => {
      const ai = taskScore(a, { now }), bi = taskScore(b, { now });
      return bi - ai;
    });
    const blocks = plannedToday()
      .filter(i => !todayItems.some(t => t.id === i.id))
      .map(i => {
        const s = new Date(i.scheduled_start);
        const e = i.scheduled_end ? new Date(i.scheduled_end) : new Date(s.getTime() + estMinutes(i) * 60000);
        return { s: s.getHours() * 60 + s.getMinutes(), e: e.getHours() * 60 + e.getMinutes() };
      });
    let used = 0;
    for (const it of ordered) {
      const est = estMinutes(it);
      const maxToday = Math.min(planCap(today), Math.max(cap, est));
      if (used + est > maxToday) continue;
      let placed = null;
      for (const [ws, we] of planWindows(now)) {
        const from = Math.max(ws, now.getHours() * 60 + now.getMinutes() + 10);
        if (we - from < Math.min(est, 20)) continue;
        const start = slotIn(blocks, est, from, we);
        if (start != null) { placed = start; break; }
      }
      if (placed == null) continue;
      const startDate = atMinutes(today, placed);
      const endDate = new Date(startDate.getTime() + est * 60000);
      blocks.push({ s: placed, e: placed + est });
      blocks.sort((a, b) => a.s - b.s);
      used += est;
      upserts.push(schedRec(it, ymd(startDate), startDate.toISOString(), endDate.toISOString()));
      it.scheduled_start = startDate.toISOString();
      it.scheduled_end = endDate.toISOString();
      it.plan_day = ymd(startDate);
    }
  }

  // 今日以外: plan_day を確定し、今日の予定として残っている時刻は外す
  // (翌日以降の時刻は自動計画 autoPlan が別途入れる)
  for (const [dayKey, list] of others) {
    for (const it of list) {
      const schedDay = it.scheduled_start ? ymd(new Date(it.scheduled_start)) : "";
      const keepSchedule = schedDay === dayKey;
      upserts.push(schedRec(it, dayKey, keepSchedule ? it.scheduled_start : null, keepSchedule ? (it.scheduled_end ?? null) : null));
      it.plan_day = dayKey;
      if (!keepSchedule) { it.scheduled_start = null; it.scheduled_end = null; }
    }
  }

  const ownUp = upserts.filter(r => r.id);
  const mbUp = upserts.filter(r => r.task_id);
  if (ownUp.length) {
    const { error } = await sb.from("sec_items").upsert(ownUp);
    if (error) console.warn("assignDays:", error.message);
  }
  if (mbUp.length) {
    const { error } = await sb.from("managebac_tasks").upsert(mbUp);
    if (error) console.warn("assignDays(mb):", error.message);
  }
  cacheSave();
  renderList();
}

/* その日にやる予定のタスク(AIの plan_day + scheduled_start) */
function plannedForDay(day) {
  const key = ymd(day);
  return visibleItems()
    .filter(i => i.kind === "task" && !i.done)
    // plan_day があればそれを正とし、scheduled_start は plan_day 未設定のときだけ使う
    .filter(i => i.plan_day ? i.plan_day === key : (i.scheduled_start && sameDay(new Date(i.scheduled_start), day)))
    .sort((a, b) => {
      const as = a.scheduled_start ? +new Date(a.scheduled_start) : Infinity;
      const bs = b.scheduled_start ? +new Date(b.scheduled_start) : Infinity;
      if (as !== bs) return as - bs;
      return (b.importance || 0) - (a.importance || 0);
    });
}

/* ---------------------------------------------------------------------------
   7. 共通 UI
--------------------------------------------------------------------------- */
function toast(msg, ms = 2600, action = null) {
  const t = $("#toast"), act = $("#toastAct");
  $("#toastMsg").textContent = msg;
  clearTimeout(toast._t);
  if (action) {
    act.textContent = action.label;
    act.classList.add("on");
    act.onclick = async () => {
      t.classList.remove("on");
      try { await action.fn(); } catch { toast("失敗しました", 3000); }
    };
  } else {
    act.classList.remove("on");
    act.onclick = null;
  }
  t.classList.add("on");
  toast._t = setTimeout(() => t.classList.remove("on"), ms);
}
let cfResolve = null;
function confirmAsk(title, msg, okLabel = "OK") {
  if ($("#confirm").open) return Promise.resolve(false);
  $("#cfTitle").textContent = title;
  $("#cfMsg").textContent = msg;
  $("#cfYes").textContent = okLabel;
  return new Promise(res => { cfResolve = res; $("#confirm").showModal(); });
}
$("#cfYes").onclick = () => $("#confirm").close("ok");
$("#cfNo").onclick = () => $("#confirm").close("cancel");
$("#confirm").addEventListener("close", () => {
  const ok = $("#confirm").returnValue === "ok";
  $("#confirm").returnValue = "";
  const fn = cfResolve; cfResolve = null;
  if (fn) fn(ok);
});

function emptyHTML(title, desc, cta = "", iconName = "check") {
  return `<div class="empty"><div class="ico">${icon(iconName)}</div><h3>${esc(title)}</h3><p>${desc}</p>${cta}</div>`;
}
function skeletonHTML(n = 4) {
  return Array.from({ length: n }, (_, i) => `<div class="sk" style="height:${[58, 74, 58, 66][i % 4]}px"></div>`).join("");
}

/* ---------------------------------------------------------------------------
   8. ナビゲーション / シェル
--------------------------------------------------------------------------- */
const NAV = [
  { v: "today", label: "今日", icon: "today" },
  { v: "tasks", label: "タスク", icon: "tasks" },
  { v: "projects", label: "プロジェクト", short: "PJ", icon: "grid" },
  { v: "notes", label: "メモ", icon: "notes" },
  { v: "chat", label: "秘書", icon: "chat" },
  { v: "settings", label: "設定", icon: "settings" },
];
function renderNav() {
  const active = v => state.view === v ? "on" : "";
  $("#sideNav").innerHTML = NAV.map(n => `
    <button type="button" data-view="${n.v}" class="${active(n.v)}" title="${n.label}">
      ${icon(n.icon)}<span class="lbl">${n.label}</span>
      ${["today", "tasks"].includes(n.v) ? `<i class="badge" data-badge="${n.v}"></i>` : ""}
    </button>`).join("");
  $("#tabbar").innerHTML = NAV.map(n => `
    <button type="button" data-view="${n.v}" class="${active(n.v)}" aria-label="${n.label}">
      ${icon(n.icon)}<span>${n.short || n.label}</span>
      ${["today", "tasks"].includes(n.v) ? `<i class="badge" data-badge="${n.v}" hidden></i>` : ""}
    </button>`).join("");
  $$("[data-view]").forEach(b => {
    if (b.closest("#sideNav") || b.closest("#tabbar")) b.onclick = () => setView(b.dataset.view);
  });
  updateBadges();
}
function updateBadges() {
  const open = visibleItems().filter(i => i.kind === "task" && !i.done);
  const s = startOfDay(), e = endOfDay();
  const today = open.filter(i => i.due && new Date(i.due) >= s && new Date(i.due) <= e).length;
  const over = open.filter(i => i.due && new Date(i.due) < s).length;
  const counts = { today: today + over, tasks: open.length };
  $$("[data-badge]").forEach(el => {
    const n = counts[el.dataset.badge] || 0;
    el.textContent = n > 99 ? "99+" : String(n);
    el.hidden = n <= 0;
    el.classList.toggle("on", n > 0);
    if (el.tagName === "I") el.hidden = n <= 0;
  });
}
function updateIdentity() {
  const email = state.userEmail || "";
  const initial = (email.split("@")[0] || "S").slice(0, 1).toUpperCase();
  $("#sideAvatar").textContent = initial || "S";
  $("#sideMail").textContent = email || "未ログイン";
  const open = visibleItems().filter(i => i.kind === "task" && !i.done).length;
  const notes = state.items.filter(i => i.kind === "note").length;
  $("#sideStat").innerHTML = `<b>${open}</b>件 未完了 · <b>${notes}</b>件 メモ<br>${state.lastSync ? "最終同期 " + new Date(state.lastSync).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "未同期"}`;
}
function setView(v) {
  if (v === "chat") {
    if (isWide()) {
      app.dataset.chat = app.dataset.chat === "off" ? "on" : "on";
      $("#q").focus();
      return;
    }
    state.view = "chat";
  } else {
    if (v === "projects" && state.view === "projects" && state.projectId) state.projectId = null;
    if (v !== "projects") state.projectId = null;
    state.view = v;
    if (v !== "settings") state.listView = v;
  }
  app.dataset.view = state.view;
  app.dataset.chat = "on";
  renderList._last = null;
  renderSettings._last = false;
  renderApp();
  if (state.view === "chat") setTimeout(() => $("#q").focus(), 80);
}
function renderApp() {
  app.dataset.view = state.view;
  renderNav();
  const st = todayStat();
  const todaySub = st.total
    ? `${st.leftMin ? `残り ${fmtMin(st.leftMin)}` : "今日の分は完了"}${st.overdue ? ` · 期限切れ ${st.overdue}` : ""}`
    : (st.overdue ? `期限切れ ${st.overdue}` : "予定なし");
  const activePj = state.projects.filter(p => !p.archived).length;
  const titles = {
    today: ["今日", todaySub],
    tasks: ["タスク", `${visibleItems().filter(i => i.kind === "task" && !i.done).length}件 未完了`],
    projects: ["プロジェクト", `${activePj}件 進行中`],
    notes: ["メモ", `${state.items.filter(i => i.kind === "note").length}件`],
    settings: ["設定", "表示と動作の設定"],
    chat: ["秘書", "承認制アシスタント"],
  };
  const detailPj = state.view === "projects" && state.projectId
    ? state.projects.find(p => p.id === state.projectId) : null;
  const t = detailPj
    ? [detailPj.title, `${kindLabel(detailPj.kind)} · ${STAGES[stageIndex(detailPj.stage)].label}`]
    : (titles[state.view] || titles.today);
  $("#pageTitle").textContent = t[0];
  $("#pageSub").textContent = t[1];
  $("#backBtn").hidden = !detailPj;
  document.title = `${t[0]} — AI秘書`;
  if (state.view === "settings") renderSettings();
  else renderList();
  updateBadges();
  updateIdentity();
}
function renderList() {
  const keepScroll = renderList._last === state.view ? view.scrollTop : 0;
  const active = document.activeElement;
  const focusSnap = active && view.contains(active) && active.id
    ? { id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd }
    : null;
  view.classList.toggle("narrow", false);
  if (state.loading && !state.loaded) { view.innerHTML = skeletonHTML(); return; }
  if (state.loadError) {
    view.innerHTML = `<div class="errbox"><span>読み込めませんでした<br><span class="sub">${esc(state.loadError)}</span></span><button class="btn btn-ghost btn-sm" data-act="retry">再試行</button></div>`;
    return;
  }
  if (state.view === "today") view.innerHTML = todayHTML();
  else if (state.view === "tasks") view.innerHTML = tasksHTML();
  else if (state.view === "projects") view.innerHTML = state.projectId ? projectDetailHTML() : projectsHTML();
  else if (state.view === "notes") view.innerHTML = notesHTML();
  else if (state.view === "chat") view.innerHTML = "";
  bindList();
  updateBadges();
  renderList._last = state.view;
  view.scrollTop = keepScroll;
  if (focusSnap) {
    const el = document.getElementById(focusSnap.id);
    if (el) {
      if ("value" in el && el.value !== focusSnap.value) el.value = focusSnap.value;
      try { el.focus({ preventScroll: true }); } catch {}
      if (el.setSelectionRange && focusSnap.start != null) {
        try { el.setSelectionRange(focusSnap.start, focusSnap.end); } catch {}
      }
      if (el.id === "quick") updateQuickHint(el.value);
    }
  }
}

/* ---------------------------------------------------------------------------
   9. 今日ビュー
--------------------------------------------------------------------------- */
function todayStat() {
  const s = startOfDay(), e = endOfDay();
  const tasks = visibleItems().filter(i => i.kind === "task");
  const due = tasks.filter(i => i.due && new Date(i.due) >= s && new Date(i.due) <= e);
  const done = due.filter(i => i.done).length;
  const overdue = tasks.filter(i => !i.done && i.due && new Date(i.due) < s).length;
  const leftMin = due.filter(i => !i.done).reduce((a, i) => a + (i.est_minutes || 0), 0);
  return { done, total: due.length, overdue, leftMin, pct: due.length ? Math.round(done / due.length * 100) : 0 };
}
function nextTask() {
  const now = new Date();
  const planned = plannedToday().filter(i => !i.done);
  const free = freeMinutesNow(now);
  const live = planned.find(i => {
    const s = new Date(i.scheduled_start);
    const e = i.scheduled_end ? new Date(i.scheduled_end) : new Date(s.getTime() + estMinutes(i) * 60000);
    return s <= now && now < e;
  });
  if (live) return { item: live, live: true, free, reasons: ["進行中", ...taskReasons(live, free, now)].slice(0, 3), alts: [] };
  const missed = planned.filter(i => new Date(i.scheduled_start) < now)
    .sort((a, b) => new Date(b.scheduled_start) - new Date(a.scheduled_start))[0];
  if (missed) {
    return {
      item: missed, free, missed: true,
      reasons: ["予定を過ぎています", ...taskReasons(missed, free, now)].slice(0, 3),
      alts: [],
    };
  }
  const next = planned.find(i => new Date(i.scheduled_start) > now);
  const minsTo = next ? Math.round((new Date(next.scheduled_start) - now) / 60000) : null;
  const cands = todayCandidates(5, { now, free });
  // 今日の予定は「次の予定」として尊重。今日以外の予定(明日以降)は前倒し候補にする。
  const notToday = cands.filter(c => {
    const s = c.item.scheduled_start ? new Date(c.item.scheduled_start) : null;
    return !s || !sameDay(s, now);
  });
  const bestEntry = notToday[0] || null;
  const best = bestEntry?.item || null;
  const bestScore = bestEntry?.score ?? -Infinity;
  const nextScore = next ? taskScore(next, { now, free }) : -Infinity;
  const alts = (list, exclude) => list.filter(c => c.item.id !== exclude?.id).slice(0, 2).map(c => c.item);

  // 45分以内に始まる予定は尊重。遠い場合は、今の空きに合う未配置タスクを優先する。
  if (next && (minsTo <= 45 || !best || bestScore < nextScore - 5)) {
    return {
      item: next, free, next: true,
      reasons: ["次の予定", ...taskReasons(next, free, now)].slice(0, 3),
      alts: alts(cands, next),
    };
  }
  if (best) {
    const future = best.scheduled_start && new Date(best.scheduled_start) > now;
    const reasons = [future ? "予定を前倒し" : "", ...taskReasons(best, free, now)].filter(Boolean).slice(0, 3);
    return { item: best, unscheduled: !best.scheduled_start, preponed: future, free, reasons, alts: alts(cands, best) };
  }
  if (next) return { item: next, free, next: true, reasons: ["次の予定"], alts: [] };
  const fallback = cands[0]?.item;
  if (fallback) {
    return {
      item: fallback, free, missed: true,
      reasons: ["予定を過ぎています", ...taskReasons(fallback, free, now)].slice(0, 3),
      alts: alts(cands, fallback),
    };
  }
  return { item: null, free };
}
function nextHTML() {
  const n = nextTask();
  if (!n.item) {
    const pj = sortProjects(activeProjects())[0];
    if (pj) {
      const ms = nextMilestone(pj);
      return `<section class="next">
        <div class="next-top"><span class="next-label"><i></i>PROJECT</span><span class="next-count num">${projectProgress(pj)}%</span></div>
        <div class="next-main">
          <div class="next-time" style="font-size:34px">${esc(kindLabel(pj.kind))}</div>
          <div class="next-info"><h2>${esc(pj.title)}</h2><p>${esc(STAGES[stageIndex(pj.stage)].label)}${ms ? ` · 次: ${esc(ms.title)}` : ""}${pj.due ? ` · ${esc(fmtDue(pj.due))}` : ""}</p></div>
        </div>
        <div class="next-acts">
          <button class="btn btn-primary" data-act="pj-do" data-id="${pj.id}">${icon("play")}45分進める</button>
          <button class="btn btn-ghost" data-act="open-project" data-id="${pj.id}">${icon("arrow-right")}開く</button>
        </div>
      </section>`;
    }
    return `<section class="next"><div class="next-top"><span class="next-label"><i></i>NEXT UP</span></div>
      <div class="next-empty"><div><h2>${visibleItems().some(i => i.kind === "task" && !i.done) ? "今日はここまで" : "今日の予定はまだありません"}</h2><p>${visibleItems().some(i => i.kind === "task" && !i.done) ? "残りのタスクはありません。おつかれさまでした。" : "下の入力から追加するか、秘書に相談してみてください。"}</p></div></div>
      <div class="next-acts"><button class="btn btn-ghost btn-block" data-act="new-note">メモを残す</button></div></section>`;
  }
  const it = n.item;
  const start = it.scheduled_start ? new Date(it.scheduled_start) : null;
  const end = it.scheduled_end ? new Date(it.scheduled_end) : start ? new Date(start.getTime() + (it.est_minutes || 30) * 60000) : null;
  const minsTo = start ? Math.round((start - new Date()) / 60000) : null;
  let count = "";
  if (n.live) count = "進行中";
  else if (n.preponed) count = "前倒し";
  else if (n.missed) count = "予定超過";
  else if (minsTo != null && minsTo > 0) count = minsTo < 60 ? `あと${minsTo}分` : `あと${fmtMin(minsTo)}`;
  else if (n.unscheduled) count = "今日やる";
  else count = "次の予定";
  const sub = [it.category, `${estMinutes(it)}分`, it.mb ? "ManageBac" : ""].filter(Boolean).map(esc).join(" · ");
  const alts = n.alts || [];
  return `<section class="next">
    <div class="next-top"><span class="next-label"><i></i>NEXT UP</span><span class="next-count num">${esc(count)}</span></div>
    <div class="next-main">
      <div class="next-time"${start ? "" : ' style="font-size:30px"'}">${start ? fmtClock(start).replace(":", "<small>:</small>") : "未定"}</div>
      <div class="next-info"><h2>${esc(it.title)}</h2><p>${[start ? `${fmtClock(start)} – ${fmtClock(end)}` : "今日中", sub].filter(Boolean).join(" · ")}</p></div>
    </div>
    ${(n.reasons || []).length ? `<div class="next-reasons">${n.reasons.map(r => `<span class="pill">${esc(r)}</span>`).join("")}</div>` : ""}
    ${alts.length ? `<div class="next-alts"><span>次点</span>${alts.map(a => `<button type="button" class="next-alt" data-act="focus" data-id="${a.id}" title="${esc(a.title)} を開始"><b>${esc(a.title)}</b><small>${a.scheduled_start ? (() => { const d = new Date(a.scheduled_start); return sameDay(d, new Date()) ? `${fmtClock(d)}〜` : `${d.getMonth() + 1}/${d.getDate()} ${fmtClock(d)}〜`; })() : `${estMinutes(a)}分`}</small></button>`).join("")}</div>` : ""}
    <div class="next-acts">
      <button class="btn btn-primary" data-act="focus" data-id="${it.id}">${icon("play")}集中をはじめる</button>
      <button class="btn btn-ghost" data-act="edit" data-id="${it.id}">${icon("edit")}詳細</button>
    </div>
  </section>`;
}
function timelineHTML() {
  const list = plannedToday();
  const now = new Date();
  let rows = "", marked = false, prevEnd = null;
  for (const it of list) {
    const s = new Date(it.scheduled_start);
    const e = it.scheduled_end ? new Date(it.scheduled_end) : new Date(s.getTime() + (it.est_minutes || 30) * 60000);
    if (prevEnd) {
      const gap = Math.round((s - prevEnd) / 60000);
      if (gap >= 25) rows += `<div class="tl-gap">${fmtMin(gap)}の空き</div>`;
    }
    if (!marked && s > now) { rows += nowRow(); marked = true; }
    const live = !it.done && s <= now && now < e;
    const dur = Math.max(1, Math.round((e - s) / 60000));
    const late = !it.done && isLateScheduled(it);
    const meta = [it.category, `${dur}分`];
    if (live) meta.push("進行中");
    if (late) meta.push("期限超過");
    rows += `<div class="tl-row ${it.done ? "done" : ""} ${live ? "live" : ""}" data-id="${it.id}">
      <div class="tl-time"><b>${fmtClock(s)}</b>${fmtClock(e)}</div>
      <div class="tl-rail"><i></i></div>
      <button class="tl-card" data-act="edit" data-id="${it.id}">
        <b>${esc(it.title)}</b>
        <span>${meta.filter(Boolean).map(esc).join(" · ")}</span>
        ${live ? `<span class="pill" style="margin-top:4px">${icon("play")}進行中</span>` : ""}
      </button>
    </div>`;
    prevEnd = e;
  }
  if (list.length && !marked) rows += nowRow();
  const openList = list.filter(i => !i.done);
  const doneCount = list.length - openList.length;
  const total = openList.reduce((a, i) => {
    const s0 = new Date(i.scheduled_start);
    const e0 = i.scheduled_end ? new Date(i.scheduled_end) : new Date(s0.getTime() + (i.est_minutes || 30) * 60000);
    return a + Math.round((e0 - s0) / 60000);
  }, 0);
  const summary = [openList.length ? `${openList.length}件 · ${fmtMin(total)}` : "", doneCount ? `完了${doneCount}` : ""].filter(Boolean).join(" · ");
  return `<section class="timeline">
    <div class="tl-head"><b>タイムライン</b><span>${summary || "未計画"}</span>
      <button class="icon-btn" data-act="replan" title="自動で組み直す" aria-label="計画を組み直す">${icon("refresh")}</button></div>
    ${rows || `<div class="tl-empty">まだ計画がありません<button class="chip" data-act="replan">組み直す</button></div>`}
  </section>`;
}
function nowRow() {
  return `<div class="tl-now"><div class="t">${fmtClock(new Date())}</div><div class="r"><i></i></div><div class="l">NOW</div></div>`;
}
function capacityHTML() {
  const cap = todayCapacity();
  const opts = [[30, "30分"], [60, "1時間"], [120, "2時間"], [180, "3時間"], [240, "4時間+"]];
  const planned = plannedToday().filter(i => !i.done).reduce((a, i) => {
    const s0 = new Date(i.scheduled_start);
    const e0 = i.scheduled_end ? new Date(i.scheduled_end) : new Date(s0.getTime() + (i.est_minutes || 30) * 60000);
    return a + Math.round((e0 - s0) / 60000);
  }, 0);
  return `<section class="capacity">
    <div class="capacity-head"><b>今日使える時間</b><span>${planned ? `計画 ${fmtMin(planned)}` : "選ぶと自動で割り当てます"}</span></div>
    <div class="chip-row">${opts.map(([m, l]) => `<button type="button" class="chip ${cap === m ? "on" : ""}" data-act="cap" data-cap="${m}">${l}</button>`).join("")}</div>
  </section>`;
}
function rowHTML(i) {
  const over = i.due && !i.done && new Date(i.due) < new Date();
  const chips = [];
  if (i.due) chips.push(`<span class="pill ${over ? "over" : ""}">${esc(fmtDue(i.due))}</span>`);
  if (i.category) chips.push(`<span class="pill gray">${esc(i.category)}</span>`);
  if (i.est_minutes) chips.push(`<span class="pill gray">${i.est_minutes}分</span>`);
  if (i.priority > 0) chips.push(`<span class="pill warn">${i.priority >= 2 ? "高" : "中"}</span>`);
  if (i.ai_hidden) chips.push(`<span class="pill gray">AI非公開</span>`);
  if (i.difficulty || i.importance) chips.push(scoreBadge(i));
  if (i.mb) chips.push(`<span class="pill ok">MB${i.mb_status ? " · " + esc(i.mb_status) : ""}</span>`);
  const note = !i.mb && i.kind === "note" && i.body ? `<div class="row-note">${esc(i.body.slice(0, 140))}</div>` : "";
  const check = i.kind === "task" && !i.mb
    ? `<button class="check" type="button" data-act="toggle" aria-label="${i.done ? "未完了に戻す" : "完了にする"}" aria-pressed="${i.done}"></button>`
    : `<span class="check" style="visibility:hidden"></span>`;
  return `<div class="row ${i.done ? "done" : ""} ${over ? "overdue" : ""}" data-id="${i.id}" data-kind="${i.kind}" data-act="${i.mb ? "open-mb" : "edit"}">
    ${check}
    <button class="row-main" type="button" data-act="${i.mb ? "open-mb" : "edit"}" data-id="${i.id}">
      <div class="row-title">${esc(i.title)}</div>
      <div class="row-meta">${chips.join("")}</div>${note}
    </button>
    ${icon("chevron-right", "ic row-go")}
  </div>`;
}
function groupHead(label, n, key, cls = "") {
  const collapsed = state.collapsed.has(key);
  return `<div class="section-head ${cls} ${collapsed ? "collapsed" : ""}" data-act="toggle-group" data-g="${key}">
    <span>${esc(label)}</span><span class="n">${n}</span>
    <button type="button" class="toggle-all" aria-label="${collapsed ? "開く" : "閉じる"}">${icon("chevron-down")}</button></div>`;
}
function groupsHTML(items) {
  let html = "";
  const s = startOfDay(), e = endOfDay();
  const open = items.filter(i => i.kind === "task" && !i.done);
  const plannedIds = new Set(plannedToday().map(p => p.id));
  const over = open.filter(i => i.due && new Date(i.due) < s && !plannedIds.has(i.id)).sort((a, b) => new Date(a.due) - new Date(b.due));
  const todays = open.filter(i => i.due && new Date(i.due) >= s && new Date(i.due) <= e && !plannedIds.has(i.id)).sort((a, b) => new Date(a.due) - new Date(b.due));
  const none = open.filter(i => !i.due && !plannedIds.has(i.id)).sort((a, b) => (a.created_at || "") < (b.created_at || "") ? 1 : -1);
  const later = open.filter(i => i.due && new Date(i.due) > e && new Date(i.due) <= new Date(e.getTime() + 7 * 864e5) && !plannedIds.has(i.id))
    .sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 8);
  const doneToday = items.filter(i => i.kind === "task" && i.done && (
    (i.done_at && new Date(i.done_at) >= s && new Date(i.done_at) <= e) ||
    (i.due && new Date(i.due) >= s && new Date(i.due) <= e)
  )).slice(0, 10);

  if (over.length) {
    html += groupHead("期限切れ", over.length, "overdue", "over");
    if (!state.collapsed.has("overdue")) html += over.map(rowHTML).join("");
  }
  if (todays.length) {
    html += groupHead("今日", todays.length, "today");
    if (!state.collapsed.has("today")) html += todays.map(rowHTML).join("");
  }
  if (none.length) {
    html += groupHead("期限なし", none.length, "none");
    if (!state.collapsed.has("none")) html += none.map(rowHTML).join("");
  }
  if (later.length) {
    html += groupHead("今後7日", later.length, "later");
    if (!state.collapsed.has("later")) html += later.map(rowHTML).join("");
  }
  if (doneToday.length) {
    html += groupHead("今日の完了", doneToday.length, "done");
    if (!state.collapsed.has("done")) html += doneToday.map(rowHTML).join("");
  }
  return html;
}
function weekHTML() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(startOfDay(), -i);
    const e = endOfDay(d);
    const done = state.items.filter(x => x.kind === "task" && x.done && x.done_at && new Date(x.done_at) >= d && new Date(x.done_at) <= e).length;
    const focusMin = state.items.filter(x => x.kind === "task" && !x.mb && x.done && x.actual_min && x.done_at && new Date(x.done_at) >= d && new Date(x.done_at) <= e)
      .reduce((a, x) => a + x.actual_min, 0);
    days.push({ d, done, focusMin });
  }
  const max = Math.max(1, ...days.map(d => d.done));
  const totalDone = days.reduce((a, d) => a + d.done, 0);
  const totalFocus = days.reduce((a, d) => a + d.focusMin, 0);
  return `<section class="card" style="margin-top:18px">
    <div class="set-row" style="padding-top:0"><div class="set-label"><b>今週の振り返り</b><small>直近7日 · 完了 ${totalDone}件 · 集中 ${fmtMin(totalFocus)}</small></div></div>
    <div class="bars">${days.map(d => `<div><i class="${sameDay(d.d, new Date()) ? "today" : ""}" style="height:${Math.max(4, d.done / max * 100)}%"></i><span>${d.d.toLocaleDateString("ja-JP", { weekday: "narrow" })}</span></div>`).join("")}</div>
  </section>`;
}
function todayHTML() {
  const st = todayStat();
  const greet = greetingWord();
  const now = new Date();
  return `<div class="hero">
      <div>
        <div class="eyebrow">${esc(now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" }))}</div>
        <h1>${greet}</h1>
        <div class="hero-meta">
          ${st.total ? `<span class="pill gray">${st.done}/${st.total} 完了</span>` : `<span class="pill gray">予定なし</span>`}
          ${st.overdue ? `<span class="pill over">期限切れ ${st.overdue}</span>` : ""}
        </div>
      </div>
      <div class="ring" style="--p:${st.pct}%" title="今日の達成率"><span>${st.pct}%</span></div>
    </div>
    ${nextHTML()}
    ${todayProjectsHTML()}
    ${capacityHTML()}
    ${timelineHTML()}
    ${aiPlanSectionHTML()}
    ${groupsHTML(visibleItems())}
    ${!visibleItems().length ? emptyHTML("今日はまだ何もありません", "下の入力からタスクを追加するか、秘書に話しかけてください。", `<button class="btn btn-primary" data-act="focus-quick">${icon("plus")}タスクを追加</button>`, "sun") : ""}
    ${weekHTML()}
    <div class="quick-add" style="margin-top:18px">
      ${icon("plus")}<input id="quick" placeholder="タスクを追加" enterkeyhint="done" autocomplete="off">
      <kbd>N</kbd>
    </div>
    <div class="quick-hint" id="quickHint"></div>`;
}

/* ---------------------------------------------------------------------------
   10. タスク / メモ ビュー
--------------------------------------------------------------------------- */
function taskListItems() {
  let rows = visibleItems().filter(i => i.kind === "task" && matchQuery(i, state.taskQuery));
  if (state.taskFilter === "open") rows = rows.filter(i => !i.done);
  else if (state.taskFilter === "done") rows = rows.filter(i => i.done);
  if (state.category) rows = rows.filter(i => (i.category || "") === state.category);
  return rows.sort((a, b) => (a.done - b.done) || ((a.due || "9") > (b.due || "9") ? 1 : -1));
}
function matchQuery(i, q) {
  q = (q || "").trim().toLowerCase();
  if (!q) return true;
  return [i.title, i.body, i.category].some(v => (v || "").toLowerCase().includes(q));
}
function tasksHTML() {
  const mode = state.taskMode;
  return `<div class="toolbar">
      <div class="seg" id="taskModeSeg">
        <button type="button" data-m="list" class="${mode === "list" ? "on" : ""}">リスト</button>
        <button type="button" data-m="calendar" class="${mode === "calendar" ? "on" : ""}">カレンダー</button>
      </div>
      <div class="grow"></div>
      ${mode === "calendar" ? `<button type="button" class="btn btn-ghost btn-sm" data-act="ai-plan" data-date="${state.calSelected}">${icon("spark")}AIに相談</button>` : ""}
    </div>
    ${mode === "calendar" ? calendarHTML() : taskListHTML()}`;
}
function taskListHTML() {
  const cats = [...new Set(visibleItems().filter(i => i.kind === "task").map(i => i.category).filter(Boolean))].slice(0, 12);
  return `<div class="toolbar">
      <div class="searchbox">${icon("search")}<input id="taskSearch" type="search" placeholder="タスクを検索" value="${esc(state.taskQuery)}" aria-label="タスクを検索"><button class="clear" data-act="clear-search" aria-label="検索をクリア">${icon("close")}</button></div>
      <div class="seg" id="taskFilter">${[["open", "未完了"], ["done", "完了"], ["all", "すべて"]].map(([k, l]) => `<button type="button" data-f="${k}" class="${state.taskFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
    </div>
    ${cats.length ? `<div class="filter-row" style="margin-bottom:12px"><button class="chip ${!state.category ? "on" : ""}" data-act="cat" data-cat="">すべて</button>${cats.map(c => `<button class="chip ${state.category === c ? "on" : ""}" data-act="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
    ${hiddenStaleCount() ? `<div class="filter-row" style="margin-bottom:12px"><button class="chip" data-act="show-stale">1ヶ月以上前の期限切れ ${hiddenStaleCount()}件を表示</button></div>` : ""}
    <div class="quick-add">${icon("plus")}<input id="quick" placeholder="タスクを追加" enterkeyhint="done" autocomplete="off"><kbd>N</kbd></div>
    <div class="quick-hint" id="quickHint"></div>
    <div id="listArea"></div>`;
}
function notesHTML() {
  return `<div class="toolbar">
      <div class="searchbox">${icon("search")}<input id="noteSearch" type="search" placeholder="メモを検索" value="${esc(state.noteQuery)}" aria-label="メモを検索"><button class="clear" data-act="clear-search" aria-label="検索をクリア">${icon("close")}</button></div>
      <button class="btn btn-primary" data-act="new-note">${icon("plus")}新規メモ</button>
    </div>
    <div id="listArea"></div>`;
}
function noteCardHTML(i) {
  return `<button class="note-card" type="button" data-act="edit" data-id="${i.id}">
    <h3>${esc(i.title)}</h3>
    ${i.body ? `<p>${esc(i.body)}</p>` : `<p style="opacity:.5">本文なし</p>`}
    <div class="note-foot">${i.category ? `<span class="pill gray">${esc(i.category)}</span>` : ""}${i.ai_hidden ? `<span class="pill gray">AI非公開</span>` : ""}<time>${new Date(i.updated_at || i.created_at || Date.now()).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</time></div>
  </button>`;
}
function renderListArea() {
  const area = $("#listArea");
  if (!area) return;
  if (state.view === "tasks") {
    const rows = taskListItems();
    const staleN = hiddenStaleCount();
    if (rows.length) {
      area.innerHTML = rows.map(rowHTML).join("");
    } else if (staleN && !state.taskQuery.trim() && state.taskFilter === "open") {
      area.innerHTML = emptyHTML(
        "1ヶ月以上前の期限切れを非表示中",
        `${staleN}件の古い未完了タスクがあります。表示して整理するか、完了・削除してください。`,
        `<button class="btn btn-ghost" data-act="show-stale">表示する</button>`,
        "clock");
    } else {
      area.innerHTML = emptyHTML(
        state.taskQuery.trim() ? "見つかりません" : state.taskFilter === "done" ? "完了したタスクはありません" : "タスクはありません",
        state.taskQuery.trim() ? `「${esc(state.taskQuery.trim())}」に一致するタスクはありません。` : "上の入力から追加できます。",
        state.taskQuery.trim() ? `<button class="btn btn-ghost" data-act="clear-search">検索をクリア</button>` : `<button class="btn btn-ghost" data-act="focus-quick">タスクを追加</button>`,
        state.taskQuery.trim() ? "search" : "check");
    }
  } else if (state.view === "notes") {
    const q = state.noteQuery;
    const rows = state.items.filter(i => i.kind === "note" && matchQuery(i, q))
      .sort((a, b) => (a.updated_at || a.created_at || "") < (b.updated_at || b.created_at || "") ? 1 : -1);
    area.innerHTML = rows.length
      ? `<div class="notes-grid">${rows.map(noteCardHTML).join("")}</div>`
      : emptyHTML(q.trim() ? "見つかりません" : "メモはまだありません",
          q.trim() ? `「${esc(q.trim())}」に一致するメモはありません。` : "考えたことや調べたことを、秘書と一緒に残しておけます。",
          q.trim() ? `<button class="btn btn-ghost" data-act="clear-search">検索をクリア</button>` : `<button class="btn btn-primary" data-act="new-note">${icon("plus")}メモを作成</button>`,
          q.trim() ? "search" : "notes");
  }
}

/* ---------------------------------------------------------------------------
   10.5 プロジェクト (EE / IA / TOK) — 仕様書 §4.8
--------------------------------------------------------------------------- */
const STAGES = [
  { k: "theme", label: "テーマ" },
  { k: "research", label: "リサーチ" },
  { k: "outline", label: "構成" },
  { k: "draft", label: "初稿" },
  { k: "feedback", label: "FB" },
  { k: "revise", label: "改稿" },
  { k: "final", label: "最終" },
];
const PJ_KINDS = ["EE", "IA", "TOK", "OTHER"];
const kindLabel = k => k === "OTHER" ? "その他" : (k || "EE");
const stageIndex = s => { const i = STAGES.findIndex(x => x.k === s); return i < 0 ? 0 : i; };
const activeProjects = () => state.projects.filter(p => !p.archived);

function projectProgress(p) {
  const si = stageIndex(p.stage);
  const stagePct = STAGES.length > 1 ? si / (STAGES.length - 1) : 0;
  const wordsPct = p.target_words ? clamp((p.current_words || 0) / p.target_words, 0, 1) : 0;
  const ms = p.milestones || [];
  const msPct = ms.length ? ms.filter(m => m.done).length / ms.length : stagePct;
  return clamp(Math.round((stagePct * 0.45 + wordsPct * 0.35 + msPct * 0.2) * 100), 0, 100);
}
function nextMilestone(p) {
  return (p.milestones || []).filter(m => !m.done)
    .sort((a, b) => (a.due || "9") > (b.due || "9") ? 1 : -1)[0] || null;
}
function sortProjects(list) {
  return [...list].sort((a, b) => {
    const ad = a.due ? +new Date(a.due) : Infinity;
    const bd = b.due ? +new Date(b.due) : Infinity;
    return ad - bd || projectProgress(a) - projectProgress(b);
  });
}
function projectCardHTML(p) {
  const prog = projectProgress(p);
  const ms = nextMilestone(p);
  const due = p.due ? new Date(p.due) : null;
  const over = due && due < new Date();
  return `<button class="project-card" type="button" data-act="open-project" data-id="${p.id}">
    <div class="pj-top">
      <span class="pj-kind ${p.kind === "OTHER" ? "other" : ""}">${esc(kindLabel(p.kind))}</span>
      ${p.subject && p.subject !== kindLabel(p.kind) ? `<span class="pill gray">${esc(p.subject)}</span>` : ""}
      <span class="pj-due ${over ? "over" : ""}">${due ? esc(fmtDue(p.due)) : "期限なし"}</span>
    </div>
    <div class="pj-title">${esc(p.title)}</div>
    <div class="pj-sub">${esc(STAGES[stageIndex(p.stage)].label)}${p.target_words ? ` · ${p.current_words || 0} / ${p.target_words}語` : ""}</div>
    <div class="pj-bar"><i style="width:${prog}%"></i></div>
    <div class="pj-foot"><span>${ms ? `次: ${esc(ms.title)}` : "マイルストーンなし"}</span><b>${prog}%</b></div>
    <div class="pj-next">${icon("arrow-right")}<span>${ms && ms.due ? `${fmtDue(ms.due)} まで` : "開いて進める"}</span></div>
  </button>`;
}
function projectsHTML() {
  const f = state.projectFilter;
  const all = state.projects;
  const list = all.filter(p => f === "archived" ? p.archived : (!p.archived && (f === "all" || p.kind === f)));
  const filters = [["all", "すべて"], ["EE", "EE"], ["IA", "IA"], ["TOK", "TOK"], ["archived", "アーカイブ"]];
  const chips = filters.map(([k, l]) =>
    `<button class="chip ${f === k ? "on" : ""}" data-act="pj-filter" data-f="${k}">${l}</button>`).join("");

  let body;
  if (state.projectsMissing) {
    body = `<div class="card pj-missing">
      <h2 style="font-size:15px;margin-bottom:6px">プロジェクト管理を有効にする</h2>
      <p class="desc" style="margin:0">Supabase の SQL Editor で <code>supabase/phase3.sql</code> を実行してください。
      EE / IA / TOK のステージ・語数・マイルストーン・フィードバックが端末間で同期されます。</p>
      <div class="addrow" style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-ghost btn-sm" data-act="pj-retry">再読み込み</button></div>
    </div>`;
  } else if (state.projectsError) {
    body = `<div class="errbox"><span>プロジェクトを読み込めませんでした<br><span class="sub">${esc(state.projectsError)}</span></span><button class="btn btn-ghost btn-sm" data-act="pj-retry">再試行</button></div>`;
  } else if (!list.length) {
    body = emptyHTML(
      f === "archived" ? "アーカイブはありません" : "プロジェクトはまだありません",
      f === "archived" ? "完了したプロジェクトはここに残せます。" : "EE・IA・TOK の進捗、語数、マイルストーン、指導者フィードバックを1か所で管理できます。",
      `<div class="chip-row" style="justify-content:center">
        <button class="btn btn-ghost" data-act="new-project" data-kind="EE">EE をはじめる</button>
        <button class="btn btn-ghost" data-act="new-project" data-kind="IA">IA をはじめる</button>
        <button class="btn btn-ghost" data-act="new-project" data-kind="TOK">TOK をはじめる</button>
      </div>`,
      "grid");
  } else {
    body = `<div class="pj-grid">${sortProjects(list).map(projectCardHTML).join("")}</div>`;
  }
  return `<div class="pj-toolbar">
      <div class="filter-row" style="flex:1">${chips}</div>
    </div>${body}`;
}
function projectDetailHTML() {
  const p = state.projects.find(x => x.id === state.projectId);
  if (!p) return emptyHTML("プロジェクトが見つかりません", "一覧から選び直してください。", `<button class="btn btn-ghost" data-act="open-projects">一覧へ</button>`, "grid");
  const prog = projectProgress(p);
  const si = stageIndex(p.stage);
  const ms = [...(p.milestones || [])].sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const doneCount = ms.filter(m => m.done).length;
  const wordsPct = p.target_words ? clamp((p.current_words || 0) / p.target_words, 0, 1) * 100 : 0;
  const due = p.due ? new Date(p.due) : null;
  const over = due && due < new Date();
  const stages = STAGES.map((s, i) =>
    `<button type="button" class="stage-step ${i < si ? "done" : ""} ${i === si ? "on" : ""}" data-act="pj-stage" data-id="${p.id}" data-stage="${s.k}">${i < si ? "✓ " : ""}${s.label}</button>`).join("");
  const msRows = ms.map(m => {
    const mod = m.due && new Date(m.due) < new Date() && !m.done;
    return `<div class="msrow ${m.done ? "done" : ""}">
      <button type="button" class="ms-check" data-act="ms-toggle" data-id="${m.id}" data-done="${m.done ? 0 : 1}" aria-label="${m.done ? "未完了に戻す" : "完了にする"}" aria-pressed="${m.done}"></button>
      <span class="ms-title">${esc(m.title)}</span>
      ${m.due ? `<span class="ms-due ${mod ? "over" : ""}">${esc(fmtDue(m.due))}</span>` : ""}
      <button type="button" class="ms-del" data-act="ms-del" data-id="${m.id}" aria-label="マイルストーンを削除">${icon("trash")}</button>
    </div>`;
  }).join("") || `<div class="sub" style="padding:4px 0 2px">マイルストーンはまだありません。次の締切を小さく刻みましょう。</div>`;

  return `<div class="pj-hero">
      <div>
        <div class="pj-kicker">
          <span class="pj-kind ${p.kind === "OTHER" ? "other" : ""}">${esc(kindLabel(p.kind))}</span>
          ${p.subject && p.subject !== kindLabel(p.kind) ? `<span>${esc(p.subject)}</span>` : ""}
          ${due ? `<span class="${over ? "danger" : ""}">${over ? "期限切れ" : "期限"} ${esc(fmtDue(p.due))}</span>` : ""}
        </div>
        <h1>${esc(p.title)}</h1>
        <div class="hero-meta">
          <span class="pill gray">${esc(STAGES[si].label)}</span>
          ${p.supervisor ? `<span class="pill gray">指導者 ${esc(p.supervisor)}</span>` : ""}
          ${doneCount ? `<span class="pill ok">MS ${doneCount}/${ms.length}</span>` : ""}
        </div>
      </div>
      <div class="ring" style="--p:${prog}%" title="進捗"><span>${prog}%</span></div>
    </div>

    ${aiReviewHTML(p)}

    <section class="card pj-section">
      <h2>${icon("flag")}ステージ <span class="stage-count">${si + 1} / ${STAGES.length}</span></h2>
      <div class="stage-track">${stages}</div>
    </section>

    <section class="card pj-section">
      <h2>${icon("edit")}語数 <span class="stage-count">${p.target_words ? `${Math.round(wordsPct)}%` : "目標未設定"}</span></h2>
      <div class="pj-words"><b id="pjWordsNow">${p.current_words || 0}</b><span>/ ${p.target_words ? p.target_words : "—"} 語</span></div>
      <div class="pj-bar" style="margin-top:10px"><i style="width:${wordsPct}%"></i></div>
      <div class="word-input">
        <input class="field" id="pjWordsInput" type="number" min="0" step="50" inputmode="numeric" value="${p.current_words || 0}" aria-label="現在の語数">
        <button type="button" class="btn btn-ghost btn-sm" data-act="pj-save-words" data-id="${p.id}">更新</button>
        <button type="button" class="btn btn-quiet btn-sm" data-act="pj-words-add" data-id="${p.id}" data-n="100">+100</button>
        <button type="button" class="btn btn-quiet btn-sm" data-act="pj-words-add" data-id="${p.id}" data-n="500">+500</button>
      </div>
    </section>

    <section class="card pj-section">
      <h2>${icon("check")}マイルストーン <span class="stage-count">${doneCount} / ${ms.length}</span></h2>
      <div>${msRows}</div>
      <div class="ms-add">
        <input class="field" id="msTitle" placeholder="例: 実験計画を書く" autocomplete="off" aria-label="マイルストーン">
        <input class="field" id="msDue" type="date" aria-label="期限">
        <button type="button" class="btn btn-ghost btn-sm" data-act="ms-add" data-id="${p.id}">追加</button>
      </div>
    </section>

    <section class="card pj-section">
      <h2>${icon("chat")}フィードバック</h2>
      <textarea class="pj-feedback" id="pjFeedback" placeholder="指導者からのコメント、次に直すこと、引用メモ">${esc(p.feedback || "")}</textarea>
      <div class="pj-actions" style="margin-top:8px">
        <button type="button" class="btn btn-ghost btn-sm" data-act="pj-save-feedback" data-id="${p.id}">保存</button>
      </div>
    </section>

    <div class="pj-actions">
      <button type="button" class="btn btn-primary" data-act="pj-do" data-id="${p.id}">${icon("play")}今日やる(45分)</button>
      <button type="button" class="btn btn-ghost" data-act="pji-open" data-id="${p.id}">${icon("spark")}AIヒアリング</button>
      <button type="button" class="btn btn-ghost" data-act="pj-edit" data-id="${p.id}">${icon("edit")}編集</button>
      <button type="button" class="btn btn-danger-ghost" data-act="pj-delete" data-id="${p.id}">削除</button>
    </div>
    <div class="sub" style="text-align:center;margin-top:14px">作成 ${new Date(p.created_at || Date.now()).toLocaleDateString("ja-JP")}${p.updated_at ? ` · 更新 ${new Date(p.updated_at).toLocaleDateString("ja-JP")}` : ""}</div>`;
}
function aiPlanSectionHTML() {
  const today = new Date();
  const days = [];
  for (let d = 0; d < 5; d++) {
    const day = addDays(startOfDay(today), d);
    const list = plannedForDay(day).filter(i => i.kind === "task");
    if (!list.length) continue;
    const total = list.reduce((a, i) => a + estMinutes(i), 0);
    days.push({ day, list, total });
  }
  if (!days.length) return "";
  const busy = scoring.running;
  return `<section class="card aiplan" style="margin-bottom:16px">
    <div class="tl-head">
      <b>${icon("spark")}AIの日別プラン</b>
      <span>${busy ? "推定中…" : `${scoredTasks().length}件を推定済み`}</span>
      <button class="qbtn" data-act="ai-score" ${busy ? "disabled" : ""}>${busy ? "推定中…" : "再推定"}</button>
    </div>
    ${scoring.summary ? `<p class="sub" style="margin:2px 2px 8px">${esc(scoring.summary)}</p>` : ""}
    ${days.map(({ day, list, total }, idx) => `
      <div class="aiplan-day">
        <div class="aiplan-head">
          <b>${idx === 0 ? "今日" : day.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" })}</b>
          <span>${list.length}件 · ${fmtMin(total)}</span>
        </div>
        ${list.slice(0, 5).map(i => `<button type="button" class="aiplan-row" data-act="edit" data-id="${i.id}">
          <span class="aiplan-dot" data-d="${i.difficulty || 0}"></span>
          <span class="aiplan-title">${esc(i.title)}</span>
          ${i.scheduled_start ? `<span class="aiplan-time">${fmtClock(i.scheduled_start)}</span>` : `<span class="aiplan-time dim">未定</span>`}
        </button>`).join("")}
        ${list.length > 5 ? `<div class="sub" style="padding:2px 8px">他 ${list.length - 5}件</div>` : ""}
      </div>`).join("")}
    ${scoring.lastError ? `<div class="sub" style="padding:6px 2px 0;color:var(--danger)">AI推定に失敗: ${esc(scoring.lastError.slice(0, 100))}</div>` : ""}
  </section>`;
}

function todayProjectsHTML() {
  if (state.projectsMissing) return "";
  const list = sortProjects(activeProjects()).slice(0, 3);
  if (!list.length) return "";
  return `<section class="card pj-today" style="margin-bottom:16px">
    <div class="tl-head"><b>プロジェクト</b><span>${activeProjects().length}件</span><button class="qbtn" data-act="open-projects">すべて</button></div>
    ${list.map(p => {
      const prog = projectProgress(p);
      const ms = nextMilestone(p);
      return `<button type="button" class="pj-mini" data-act="open-project" data-id="${p.id}">
        <div class="pj-mini-top">
          <span class="pj-kind ${p.kind === "OTHER" ? "other" : ""}">${esc(kindLabel(p.kind))}</span>
          <span class="pj-mini-title">${esc(p.title)}</span>
          <span class="pj-mini-pct">${prog}%</span>
        </div>
        <div class="pj-bar"><i style="width:${prog}%"></i></div>
        <div class="pj-mini-meta"><span>${esc(STAGES[stageIndex(p.stage)].label)}</span>${ms ? `<span>· 次: ${esc(ms.title)}</span>` : ""}${p.due ? `<span>· ${esc(fmtDue(p.due))}</span>` : ""}</div>
      </button>`;
    }).join("")}
  </section>`;
}

/* ---------- プロジェクト編集シート ---------- */
let pjEditState = null;
function openProjectEditor(p = {}) {
  if ($("#pjEditor").open) return;
  pjEditState = { ...p };
  $("#pjTitleLabel").textContent = p.id ? "プロジェクトを編集" : "新規プロジェクト";
  $("#pjTitle").value = p.title || "";
  $("#pjSubject").value = p.subject || "";
  $("#pjDue").value = p.due ? toLocalInput(p.due).slice(0, 10) : "";
  $("#pjTarget").value = p.target_words ?? "";
  $("#pjSupervisor").value = p.supervisor || "";
  $("#pjArchived").checked = !!p.archived;
  $$("#pjKind [data-k]").forEach(b => b.classList.toggle("on", (b.dataset.k) === (p.kind || "EE")));
  $("#pjEditor").showModal();
  setTimeout(() => { try { $("#pjTitle").focus(); } catch {} }, 80);
}
async function saveProjectEditor() {
  if (!pjEditState) return;
  const title = $("#pjTitle").value.trim();
  if (!title) { toast("タイトルを入力してください"); $("#pjTitle").focus(); return; }
  const kind = $("#pjKind [data-k].on")?.dataset.k || "EE";
  const rec = {
    title, kind,
    subject: $("#pjSubject").value.trim(),
    due: toIso($("#pjDue").value),
    target_words: $("#pjTarget").value ? parseInt($("#pjTarget").value, 10) : null,
    supervisor: $("#pjSupervisor").value.trim(),
    archived: $("#pjArchived").checked,
  };
  const editing = pjEditState.id;
  let newId = null;
  if (editing) {
    const { error } = await sb.from("sec_projects").update(rec).eq("id", editing);
    if (error) { toast(error.message, 3500); return; }
  } else {
    const { data, error } = await sb.from("sec_projects").insert({ ...rec, stage: "theme", current_words: 0 }).select().single();
    if (error) { toast(error.message, 3500); return; }
    newId = data.id;
  }
  $("#pjEditor").close();
  await loadProjects();
  if (newId) {
    state.projectId = newId;
    state.view = "projects";
  }
  renderApp();
  view.scrollTop = 0;
  toast(editing ? "保存しました" : "プロジェクトを作成しました");
}
$$("#pjKind [data-k]").forEach(b => b.onclick = () => {
  $$("#pjKind [data-k]").forEach(x => x.classList.toggle("on", x === b));
});
$("#pjForm").addEventListener("submit", e => { e.preventDefault(); saveProjectEditor(); });
$("#pjCancel").onclick = () => $("#pjEditor").close();
$("#pjClose").onclick = () => $("#pjEditor").close();
$("#pjEditor").addEventListener("close", () => { pjEditState = null; });

/* ---------- 今日やる ---------- */
async function projectDo(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  const ms = nextMilestone(p);
  const title = `${kindLabel(p.kind)}: ${ms ? ms.title : p.title}`.slice(0, 90);
  const { data, error } = await sb.from("sec_items").insert({
    kind: "task", title,
    category: p.subject || kindLabel(p.kind),
    est_minutes: 45,
    due: endOfDay().toISOString(),
    body: `${p.title} を進める${ms ? ` / 次のマイルストーン: ${ms.title}` : ""}`,
  }).select().single();
  if (error) { toast(error.message, 3500); return; }
  await loadItems();
  const it = state.items.find(x => x.id === data.id);
  if (it) startFocus(it, 45);
}

/* ---------- AIヒアリング / 診断 ---------- */
let pjiProject = null, pjiReview = null, pjiBusy = false;

function interviewQuestions(p) {
  const k = p.kind;
  return [
    { key: "rq", label: k === "TOK" ? "知識の問い(または主張)を一文で書いてください。" : "リサーチクエスチョン(または主張)を一文で書いてください。", ph: "例: 温度が酵素の反応速度に与える影響" },
    { key: "method", label: k === "TOK" ? "その問いにどう答えますか。具体例と論点を書いてください。" : "方法・実験・数学的プロセスで、具体的に何をするかを書いてください。" },
    { key: "evidence", label: "根拠にできるデータ・結果・引用は何がありますか?", ph: "まだなら「なし」で構いません" },
    { key: "limits", label: "反対意見・限界・まだ検証できていない点は?" },
    { key: "feedback", label: "指導者や先生に言われたこと、直したことは?" },
    { key: "blocker", label: "今いちばん詰まっていることと、今週使える時間は?" },
  ];
}
function urgencyLabel(u) {
  return u === "now" ? `<span class="pill over">今すぐ</span>`
    : u === "soon" ? `<span class="pill warn">今週</span>`
    : `<span class="pill gray">余裕</span>`;
}
function aiReviewHTML(p) {
  const rev = p.ai_review;
  if (!rev) {
    return `<section class="card pj-section pj-ai">
      <h2>${icon("spark")}AI診断</h2>
      <p class="desc">6つの質問に答えると、AIが「提出までの深度」と弱点、今週やることを診断します。</p>
      <button class="btn btn-primary btn-sm" style="margin-top:10px" data-act="pji-open" data-id="${p.id}">${icon("spark")}AIヒアリングをはじめる</button>
    </section>`;
  }
  const depth = rev.depth;
  const actions = (rev.actions || []).map((a, i) => `<div class="ai-action">
      <div class="t"><b>${esc(a.title)}</b><small>${esc(a.why || "")}${a.minutes ? ` · <span style="white-space:nowrap">${a.minutes}分</span>` : ""}</small></div>
      ${urgencyLabel(a.urgency)}
      <button type="button" class="btn btn-ghost btn-sm" data-act="pji-add-action" data-id="${p.id}" data-idx="${i}">追加</button>
    </div>`).join("");
  return `<section class="card pj-section pj-ai">
    <h2>${icon("spark")}AI診断 ${depth != null ? `<span class="stage-count">${depth}/100</span>` : ""}</h2>
    <p class="pj-verdict">${esc(rev.verdict || "")}</p>
    <div class="ai-cols">
      <div class="pji-sec" style="margin-top:0"><h4>強み</h4><ul>${(rev.strengths || []).map(x => `<li>${esc(x)}</li>`).join("") || "<li>—</li>"}</ul></div>
      <div class="pji-sec" style="margin-top:0"><h4>伸びしろ</h4><ul>${(rev.gaps || []).map(x => `<li>${esc(x)}</li>`).join("") || "<li>—</li>"}</ul></div>
    </div>
    ${actions ? `<div class="pji-sec"><h4>次にやること</h4><div class="ai-actions">${actions}</div></div>` : ""}
    ${(rev.questions || []).length ? `<div class="pji-sec"><h4>指導者に聞くこと</h4><ul>${rev.questions.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    <div class="pj-ai-foot">
      <span class="sub">${p.ai_review_at ? new Date(p.ai_review_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-act="pji-open" data-id="${p.id}">${icon("refresh")}再診断</button>
    </div>
  </section>`;
}
function openInterview(p) {
  if (!p) return;
  pjiProject = p; pjiReview = null; pjiBusy = false;
  $("#pjiTitle").textContent = `AIヒアリング — ${kindLabel(p.kind)}`;
  $("#pjiSub").textContent = `${p.title} · ${STAGES[stageIndex(p.stage)].label}${p.due ? ` · 期限 ${fmtDue(p.due)}` : ""}`;
  $("#pjiQuestions").innerHTML = interviewQuestions(p).map((q, i) => `<div class="pji-q">
      <label for="pji-${q.key}">${i + 1}. ${esc(q.label)}</label>
      <textarea id="pji-${q.key}" data-q="${q.key}" placeholder="${esc(q.ph || "")}">${q.key === "feedback" ? esc(p.feedback || "") : ""}</textarea>
    </div>`).join("");
  $("#pjiIntro").hidden = false;
  $("#pjiResult").hidden = true;
  $("#pjiResult").innerHTML = "";
  $("#pjiSubmit").hidden = false;
  $("#pjiSubmit").disabled = false;
  $("#pjiSubmit").textContent = "AIに診断してもらう";
  $("#pjiClose").textContent = "キャンセル";
  $("#pjiStatus").textContent = "";
  $("#pji").showModal();
}
function renderInterviewResult(p, review, text) {
  const depth = review?.depth;
  const actions = (review?.actions || []).map((a, i) => `<div class="ai-action">
      <div class="t"><b>${esc(a.title)}</b><small>${esc(a.why || "")}${a.minutes ? ` · <span style="white-space:nowrap">${a.minutes}分</span>` : ""}</small></div>
      ${urgencyLabel(a.urgency)}
      <button type="button" class="btn btn-ghost btn-sm" data-act="pji-add-action" data-idx="${i}">追加</button>
    </div>`).join("");
  const body = review
    ? `<div class="ai-cols">
        <div class="pji-sec" style="margin-top:0"><h4>強み</h4><ul>${(review.strengths || []).map(x => `<li>${esc(x)}</li>`).join("") || "<li>—</li>"}</ul></div>
        <div class="pji-sec" style="margin-top:0"><h4>伸びしろ</h4><ul>${(review.gaps || []).map(x => `<li>${esc(x)}</li>`).join("") || "<li>—</li>"}</ul></div>
      </div>
      ${actions ? `<div class="pji-sec"><h4>次にやること</h4><div class="ai-actions">${actions}</div></div>` : ""}
      ${(review.questions || []).length ? `<div class="pji-sec"><h4>指導者に聞くこと</h4><ul>${review.questions.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}`
    : `<div class="pji-sec"><h4>AIの回答</h4><p style="white-space:pre-wrap;font-size:12.5px;line-height:1.75">${esc(text || "")}</p></div>`;
  $("#pjiResult").innerHTML = `
    <div class="pji-depth">
      ${depth != null ? `<div class="ring" style="--p:${depth}%"><span>${depth}</span></div>` : ""}
      <div><h3>${depth != null ? `深度 ${depth}/100` : "AIの診断"}</h3>
        <p class="pji-verdict">${esc(review?.verdict || (text || "").slice(0, 700))}</p></div>
    </div>
    ${body}`;
}
async function submitInterview() {
  if (pjiBusy || !pjiProject) return;
  const answers = {};
  $$("#pjiQuestions [data-q]").forEach(t => { answers[t.dataset.q] = t.value.trim(); });
  if (!Object.values(answers).some(Boolean)) { toast("1つ以上入力してください"); return; }
  const p = pjiProject;
  pjiBusy = true;
  $("#pjiSubmit").disabled = true;
  $("#pjiSubmit").textContent = "診断中…";
  $("#pjiIntro").hidden = true;
  $("#pjiResult").hidden = false;
  $("#pjiResult").innerHTML = `<div class="pji-loading"><div class="spinner"></div><b>AIが回答を読んでいます</b><span>深度・弱点・今週やることを整理しています。</span></div>`;
  $("#pjiStatus").textContent = "";
  try {
    const project = {
      title: p.title, kind: p.kind, subject: p.subject,
      stage: STAGES[stageIndex(p.stage)].label,
      target_words: p.target_words, current_words: p.current_words,
      due: p.due, supervisor: p.supervisor, feedback: p.feedback,
      milestones: (p.milestones || []).map(m => ({ title: m.title, due: m.due, done: m.done })),
    };
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { data, error } = await sb.functions.invoke("ai", {
      body: { purpose: "project_review", project, answers, tz, now: new Date().toLocaleString("ja-JP", { dateStyle: "full", timeStyle: "short", timeZone: tz }) },
    });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || msg; } catch {}
      throw new Error(msg);
    }
    if (!pjiProject) { pjiBusy = false; return; }
    const review = data?.review || null;
    pjiReview = review;
    renderInterviewResult(p, review, data?.text || "");
    if (review) {
      const at = new Date().toISOString();
      const { error: saveErr } = await sb.from("sec_projects").update({ ai_review: review, ai_review_at: at }).eq("id", p.id);
      if (saveErr) toast("診断は表示しましたが保存できません(phase3.sql を再実行)", 5500);
      else { pjiProject = { ...p, ai_review: review, ai_review_at: at }; await loadProjects(); }
    }
    $("#pjiSubmit").hidden = true;
    $("#pjiClose").textContent = "閉じる";
    $("#pjiStatus").textContent = `${data?.provider || "AI"} · ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (e) {
    $("#pjiResult").innerHTML = `<div class="errbox" style="margin:0"><span>診断できませんでした<br><span class="sub">${esc(e.message || String(e))}</span></span></div>
      <div class="pji-sec"><p class="sub">AI Edge Function を再デプロイしているか、ログイン状態を確認してください。</p></div>`;
    $("#pjiSubmit").hidden = false;
    $("#pjiSubmit").disabled = false;
    $("#pjiSubmit").textContent = "もう一度";
    $("#pjiClose").textContent = "閉じる";
  }
  pjiBusy = false;
}
async function addAiAction(p, action, btn) {
  if (!p || !action) return;
  const days = action.urgency === "now" ? 0 : action.urgency === "soon" ? 3 : 7;
  const due = endOfDay(addDays(new Date(), days));
  const { data, error } = await sb.from("sec_items").insert({
    kind: "task", title: action.title,
    category: p.subject || kindLabel(p.kind),
    est_minutes: action.minutes || 30,
    due: due.toISOString(),
    body: `${p.title} / AI診断のアクション`,
  }).select().single();
  if (error) { toast(error.message, 3500); return; }
  if (btn) { btn.disabled = true; btn.textContent = "追加済み"; }
  await loadItems();
  toast("タスクに追加しました", 5000, {
    label: "集中する",
    fn: () => { const it = state.items.find(x => x.id === data.id); if (it) startFocus(it, action.minutes || 30); },
  });
}
$("#pjiForm").addEventListener("submit", e => { e.preventDefault(); submitInterview(); });
$("#pjiCancel").onclick = () => $("#pji").close();
$("#pjiClose").onclick = () => $("#pji").close();
$("#pji").addEventListener("click", e => { if (e.target === $("#pji")) $("#pji").close(); });
$("#pji").addEventListener("close", () => {
  const wasBusy = pjiBusy;
  pjiProject = null; pjiReview = null; pjiBusy = false;
  if (!wasBusy && state.view === "projects") renderApp();
});
$("#pjiResult").addEventListener("click", async e => {
  const b = e.target.closest("[data-act='pji-add-action']");
  if (!b || !pjiProject) return;
  const action = (pjiReview?.actions || [])[parseInt(b.dataset.idx, 10)];
  if (action) await addAiAction(pjiProject, action, b);
});

/* ---------- プロジェクト操作 ---------- */
async function handleProjectAction(act, el) {
  const id = el.dataset.id || state.projectId;
  const p = state.projects.find(x => x.id === id);
  switch (act) {
    case "open-projects": setView("projects"); return;
    case "new-project": openProjectEditor({ kind: el.dataset.kind || "EE" }); return;
    case "open-project":
      state.view = "projects"; state.projectId = id; app.dataset.view = "projects";
      renderApp(); view.scrollTop = 0; return;
    case "pj-filter": state.projectFilter = el.dataset.f || "all"; renderList(); return;
    case "pj-retry": await loadProjects(); renderApp(); return;
    case "pj-edit": if (p) openProjectEditor(p); return;
    case "pji-open": if (p) openInterview(p); return;
    case "pji-add-action": {
      const a = (p?.ai_review?.actions || [])[parseInt(el.dataset.idx, 10)];
      if (a) await addAiAction(p, a, el);
      return;
    }
    case "pj-stage": {
      if (!p) return;
      const stage = el.dataset.stage;
      const { error } = await sb.from("sec_projects").update({ stage }).eq("id", p.id);
      if (error) { toast(error.message, 3000); return; }
      await loadProjects(); renderApp();
      const now = STAGES[stageIndex(stage)].label;
      toast(`ステージを「${now}」にしました`, 2000);
      return;
    }
    case "pj-save-words": {
      if (!p) return;
      const v = Math.max(0, parseInt($("#pjWordsInput")?.value || "0", 10) || 0);
      const { error } = await sb.from("sec_projects").update({ current_words: v }).eq("id", p.id);
      if (error) { toast(error.message, 3000); return; }
      await loadProjects(); renderApp();
      toast("語数を更新しました", 2000);
      return;
    }
    case "pj-words-add": {
      if (!p) return;
      const n = parseInt(el.dataset.n || "0", 10) || 0;
      const typed = parseInt($("#pjWordsInput")?.value || "", 10);
      const base = Number.isFinite(typed) ? typed : (p.current_words || 0);
      const v = Math.max(0, base + n);
      const { error } = await sb.from("sec_projects").update({ current_words: v }).eq("id", p.id);
      if (error) { toast(error.message, 3000); return; }
      await loadProjects(); renderApp();
      return;
    }
    case "ms-add": {
      if (!p) return;
      const title = ($("#msTitle")?.value || "").trim();
      if (!title) { $("#msTitle")?.focus(); return; }
      const due = toIso($("#msDue")?.value || "");
      const sort = (p.milestones || []).reduce((a, m) => Math.max(a, m.sort || 0), 0) + 1;
      const { error } = await sb.from("sec_milestones").insert({ project_id: p.id, title, due, sort }).select().single();
      if (error) { toast(error.message, 3000); return; }
      await loadProjects(); renderApp();
      return;
    }
    case "ms-toggle": {
      const done = el.dataset.done === "1";
      const { error } = await sb.from("sec_milestones").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", el.dataset.id);
      if (error) { toast(error.message, 3000); return; }
      await loadProjects(); renderApp();
      return;
    }
    case "ms-del": {
      const m = (p?.milestones || []).find(x => x.id === el.dataset.id);
      const { error } = await sb.from("sec_milestones").delete().eq("id", el.dataset.id);
      if (error) { toast(error.message, 3000); return; }
      await loadProjects(); renderApp();
      if (m) toast("マイルストーンを削除しました", 5000, {
        label: "元に戻す",
        fn: async () => {
          const { created_at, ...rest } = m;
          await sb.from("sec_milestones").insert(rest);
          await loadProjects(); renderApp();
        },
      });
      return;
    }
    case "pj-save-feedback": {
      if (!p) return;
      const feedback = $("#pjFeedback")?.value || "";
      const { error } = await sb.from("sec_projects").update({ feedback }).eq("id", p.id);
      if (error) { toast(error.message, 3000); return; }
      await loadProjects();
      toast("フィードバックを保存しました", 2000);
      return;
    }
    case "pj-do": if (p) await projectDo(p.id); return;
    case "pj-delete": {
      if (!p) return;
      const ok = await confirmAsk("プロジェクトを削除しますか?", `「${p.title}」とマイルストーンを削除します。`, "削除");
      if (!ok) return;
      await sb.from("sec_milestones").delete().eq("project_id", p.id);
      const { error } = await sb.from("sec_projects").delete().eq("id", p.id);
      if (error) { toast(error.message, 3500); return; }
      state.projectId = null;
      await loadProjects(); renderApp();
      toast("削除しました");
      return;
    }
    default: return;
  }
}

/* ---------------------------------------------------------------------------
   10.6 カレンダー(締切の俯瞰)
--------------------------------------------------------------------------- */
const dayFromKey = k => { const [y, m, d] = String(k).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const isAllDayDue = iso => { const d = new Date(iso); return d.getHours() === 23 && d.getMinutes() === 59; };

function dayCapacity(day) {
  if (sameDay(day, new Date())) return todayCapacity();
  const w = day.getDay();
  return (w === 0 || w === 6) ? 300 : 240;
}
function dayLoad(day) {
  const planned = visibleItems()
    .filter(i => i.kind === "task" && !i.done && i.scheduled_start && sameDay(new Date(i.scheduled_start), day))
    .reduce((a, i) => {
      const s = new Date(i.scheduled_start);
      const e = i.scheduled_end ? new Date(i.scheduled_end) : new Date(s.getTime() + (i.est_minutes || 30) * 60000);
      return a + Math.round((e - s) / 60000);
    }, 0);
  const cap = dayCapacity(day);
  return { planned, cap, free: Math.max(0, cap - planned) };
}
function calendarEvents() {
  const out = [];
  visibleItems().filter(i => i.kind === "task" && i.due).forEach(i => {
    out.push({
      type: i.mb ? "mb" : "task", at: i.due, title: i.title, id: i.id,
      item: i, done: !!i.done, allDay: isAllDayDue(i.due),
    });
  });
  activeProjects().forEach(p => {
    if (p.due) out.push({ type: "project", at: p.due, title: p.title, id: p.id, project: p, allDay: true });
    (p.milestones || []).forEach(m => {
      if (m.due && !m.done) out.push({ type: "milestone", at: m.due, title: m.title, id: p.id, project: p, milestone: m, allDay: true });
    });
  });
  return out;
}
function calendarFilterMatch(e) {
  const f = state.calFilter;
  if (f === "all") return true;
  if (f === "project") return e.type === "project" || e.type === "milestone";
  return e.type === f;
}
function calendarByDay() {
  const map = new Map();
  for (const e of calendarEvents()) {
    const k = ymd(new Date(e.at));
    const arr = map.get(k);
    if (arr) arr.push(e); else map.set(k, [e]);
  }
  map.forEach(arr => arr.sort((a, b) => new Date(a.at) - new Date(b.at)));
  return map;
}
function urgencyInfo(iso, done) {
  if (done) return { k: "done", label: "完了" };
  const days = Math.round((startOfDay(iso) - startOfDay()) / 864e5);
  if (days < 0) return { k: "over", label: `${-days}日超過` };
  if (days === 0) return { k: "today", label: "今日" };
  if (days <= 3) return { k: "soon", label: `あと${days}日` };
  return { k: "later", label: `あと${days}日` };
}
function urgencyPill(iso, done) {
  if (done) return `<span class="pill ok">完了</span>`;
  const u = urgencyInfo(iso, done);
  const cls = u.k === "over" ? "over" : u.k === "later" ? "gray" : "warn";
  return `<span class="pill ${cls}">${u.label}</span>`;
}
function calendarHTML() {
  const y = state.calMonth.getFullYear(), m = state.calMonth.getMonth();
  const first = new Date(y, m, 1);
  const start = addDays(first, -first.getDay());
  const byDay = calendarByDay();
  const todayKey = ymd(new Date());
  const filters = [["all", "すべて"], ["task", "タスク"], ["mb", "MB"], ["project", "PJ"]];
  const chips = filters.map(([k, l]) =>
    `<button type="button" class="chip ${state.calFilter === k ? "on" : ""}" data-act="cal-filter" data-f="${k}">${l}</button>`).join("");
  const cells = [];
  const cellCount = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7) * 7;
  for (let i = 0; i < cellCount; i++) {
    const d = addDays(start, i);
    const key = ymd(d);
    const evs = (byDay.get(key) || []).filter(calendarFilterMatch);
    const out = d.getMonth() !== m;
    const cls = [out ? "out" : "", key === todayKey ? "today" : "", key === state.calSelected ? "sel" : ""].filter(Boolean).join(" ");
    const dots = evs.slice(0, 3).map(e => `<i class="${e.type}"></i>`).join("");
    const mini = evs.slice(0, 2).map((e, idx) => `<span class="cal-mini ${idx ? "dim" : ""}">${esc(e.title)}</span>`).join("");
    cells.push(`<button type="button" class="cal-cell ${cls}" data-act="cal-select" data-date="${key}" aria-label="${d.getMonth() + 1}月${d.getDate()}日 ${evs.length}件の締切">
      <span class="cal-num">${d.getDate()}</span>
      <span class="cal-dots">${dots}</span>${mini}
    </button>`);
  }
  return `<div class="cal-nav">
      <button class="icon-btn" type="button" data-act="cal-prev" aria-label="前の月">${icon("arrow-left")}</button>
      <b>${y}年${m + 1}月</b>
      <button class="icon-btn" type="button" data-act="cal-next" aria-label="次の月">${icon("arrow-right")}</button>
      <button class="btn btn-ghost btn-sm" type="button" data-act="cal-today">今日</button>
    </div>
    <div class="filter-row" style="margin-bottom:10px">${chips}</div>
    <div class="cal-week">${["日", "月", "火", "水", "木", "金", "土"].map(w => `<span>${w}</span>`).join("")}</div>
    <div class="cal-grid">${cells.join("")}</div>
    ${calDayHTML(byDay)}`;
}
function calDayHTML(byDay) {
  const key = state.calSelected;
  const day = dayFromKey(key);
  const evs = (byDay.get(key) || []).filter(calendarFilterMatch);
  const isToday = key === ymd(new Date());
  const load = dayLoad(day);
  const dateLabel = `${day.getMonth() + 1}月${day.getDate()}日(${"日月火水木金土"[day.getDay()]})`;
  const typeLabel = { task: "タスク", mb: "ManageBac", project: "プロジェクト", milestone: "マイルストーン" };
  const rows = evs.map(e => {
    const act = (e.type === "project" || e.type === "milestone") ? "open-project" : e.type === "mb" ? "open-mb" : "edit";
    return `<button type="button" class="cal-ev ${e.done ? "done" : ""}" data-act="${act}" data-id="${e.id}">
      <span class="cal-ev-dot ${e.type}"></span>
      <span class="cal-ev-main"><b>${esc(e.title)}</b><span>${typeLabel[e.type]} · ${e.allDay ? "終日" : fmtClock(e.at)}</span></span>
      ${urgencyPill(e.at, e.done)}
    </button>`;
  }).join("");
  return `<section class="cal-day" id="calDay">
    <div class="cal-day-head">
      <b>${dateLabel}</b>
      ${isToday ? `<span class="pill">今日</span>` : ""}
      <span class="sub">${evs.length}件の締切</span>
      <span class="pill ${load.free < 30 ? "warn" : "gray"}">空き 約${fmtMin(load.free)}</span>
      <button class="btn btn-ghost btn-sm" type="button" data-act="ai-plan" data-date="${key}">${icon("spark")}AIに相談</button>
    </div>
    ${rows || `<div class="cal-empty">この日の締切はありません。${load.free >= 60 ? "余白の日です。" : ""}</div>`}
  </section>`;
}
function calMove(delta) {
  const next = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + delta, 1);
  state.calMonth = next;
  const now = new Date();
  state.calSelected = (next.getFullYear() === now.getFullYear() && next.getMonth() === now.getMonth())
    ? ymd(now) : ymd(next);
  renderList();
}
function calToday() {
  const now = new Date();
  state.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  state.calSelected = ymd(now);
  renderList();
}
function askAiPlan(dateKey) {
  const key = dateKey || state.calSelected || ymd(new Date());
  const day = dayFromKey(key);
  const load = dayLoad(day);
  const when = sameDay(day, new Date())
    ? "今日"
    : day.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
  const deadlines = (calendarByDay().get(key) || []).filter(calendarFilterMatch).slice(0, 6)
    .map(e => `${e.title}(${urgencyInfo(e.at, e.done).label})`).join("、");
  const msg = `${when}の空き時間は約${fmtMin(load.free)}です。${deadlines ? `この日の締切: ${deadlines}。` : ""}EE/IA/TOKの進度も見て、この日にやるべきタスクを3つ、理由と所要時間つきで提案して。`;
  if (!isWide()) setView("chat");
  else {
    app.dataset.chat = "on";
    setTimeout(() => $("#q").focus(), 80);
  }
  setTimeout(() => sendChat(msg), 150);
}
function handleCalAction(act, el) {
  if (act === "cal-prev") { calMove(-1); return; }
  if (act === "cal-next") { calMove(1); return; }
  if (act === "cal-today") { calToday(); return; }
  if (act === "cal-select") {
    const key = el.dataset.date;
    state.calSelected = key;
    const d = dayFromKey(key);
    if (d.getMonth() !== state.calMonth.getMonth() || d.getFullYear() !== state.calMonth.getFullYear()) {
      state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    renderList();
    if (!isWide()) {
      setTimeout(() => {
        const el = document.getElementById("calDay");
        if (el) el.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
      }, 60);
    }
    return;
  }
  if (act === "cal-filter") { state.calFilter = el.dataset.f || "all"; renderList(); return; }
  if (act === "ai-plan") { askAiPlan(el.dataset.date); return; }
}

/* ---------------------------------------------------------------------------
   11. リストのイベント
--------------------------------------------------------------------------- */
function bindList() {
  if (state.view === "today" || state.view === "tasks") {
    const q = $("#quick");
    if (q) {
      q.addEventListener("keydown", quickAddKey);
      q.addEventListener("input", () => updateQuickHint(q.value));
    }
    const qh = $("#quickHint");
    if (qh && !qh.innerHTML) qh.innerHTML = `<span>「明日15時 #化学 45分」のように書けます</span>`;
  }
  if (state.view === "tasks") {
    $$("#taskModeSeg [data-m]").forEach(b => b.onclick = () => {
      state.taskMode = b.dataset.m;
      localStorage.setItem("sec_task_mode", state.taskMode);
      renderList._last = null;
      renderList();
    });
    if (state.taskMode === "list") {
      const s = $("#taskSearch");
      if (s) s.addEventListener("input", () => { state.taskQuery = s.value; renderListArea(); });
      $$("#taskFilter [data-f]").forEach(b => b.onclick = () => {
        state.taskFilter = b.dataset.f;
        $$("#taskFilter [data-f]").forEach(x => x.classList.toggle("on", x === b));
        renderListArea();
      });
      renderListArea();
    }
  }
  if (state.view === "notes") {
    const s = $("#noteSearch");
    if (s) s.addEventListener("input", () => { state.noteQuery = s.value; renderListArea(); });
    renderListArea();
  }
  if (state.view === "projects" && state.projectId) {
    const activeStage = document.querySelector(".stage-step.on");
    if (activeStage) {
      const track = activeStage.parentElement;
      const left = activeStage.offsetLeft;
      const right = left + activeStage.offsetWidth;
      if (left - 8 < track.scrollLeft) track.scrollLeft = Math.max(0, left - 8);
      else if (right + 8 > track.scrollLeft + track.clientWidth) track.scrollLeft = right + 8 - track.clientWidth;
    }
    const msTitle = $("#msTitle");
    if (msTitle) msTitle.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        const btn = document.querySelector('[data-act="ms-add"]');
        if (btn) handleProjectAction("ms-add", btn);
      }
    });
  }
}
view.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "ai-score") { scoreTasks({ manual: true }); return; }
  if (act === "show-stale") {
    localStorage.setItem(STALE_KEY, "1");
    renderApp();
    toast("1ヶ月以上前の期限切れを表示します", 3000);
    return;
  }
  if (act.startsWith("cal-") || act === "ai-plan") {
    e.preventDefault();
    handleCalAction(act, el);
    return;
  }
  if (act.startsWith("pj-") || act.startsWith("ms-") || act === "pji-open" || act === "pji-add-action" || act === "open-project" || act === "open-projects" || act === "new-project") {
    e.preventDefault();
    handleProjectAction(act, el);
    return;
  }
  if (act === "retry") { state.loadError = ""; state.loaded = false; loadItems(); return; }
  if (act === "focus-quick") { const q = $("#quick"); if (q) q.focus(); return; }
  if (act === "new-note") { openEditor({ kind: "note" }); return; }
  if (act === "clear-search") {
    if (state.view === "tasks") { state.taskQuery = ""; const s = $("#taskSearch"); if (s) s.value = ""; }
    else { state.noteQuery = ""; const s = $("#noteSearch"); if (s) s.value = ""; }
    renderListArea(); return;
  }
  if (act === "replan") { autoPlan({ manual: true }); return; }
  if (act === "cap") { setCapacity(parseInt(el.dataset.cap, 10)); return; }
  if (act === "toggle-group") {
    const g = el.dataset.g;
    if (state.collapsed.has(g)) state.collapsed.delete(g); else state.collapsed.add(g);
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...state.collapsed]));
    renderList(); return;
  }
  if (act === "cat") { state.category = el.dataset.cat || ""; renderList(); return; }
  const id = el.dataset.id;
  const it = state.items.find(x => x.id === id);
  if (!it) return;
  if (act === "toggle") { e.stopPropagation(); setDone(it.id, !it.done); return; }
  if (act === "open-mb") { if (it.url) window.open(it.url, "_blank", "noopener"); else toast("ManageBacで開いてください"); return; }
  if (act === "focus") { startFocus(it); return; }
  if (act === "edit") { openEditor(it); return; }
});

/* ---------------------------------------------------------------------------
   12. クイック追加 + 自然言語パース
--------------------------------------------------------------------------- */
const JP_DAYS = { "日": 0, "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6 };
function parseQuick(raw) {
  let s = String(raw || "").trim();
  const out = { title: "", due: null, est_minutes: null, category: "", priority: 0 };
  if (!s) return out;

  s = s.replace(/#([^\s#]+)/g, (_, c) => { out.category = c; return " "; });
  if (/!!|！！/.test(s)) { out.priority = 2; s = s.replace(/!!|！！/g, " "); }
  else if (/[!！]/.test(s)) { out.priority = 1; s = s.replace(/[!！]/g, " "); }

  s = s.replace(/(\d+)\s*(分|min)(?![a-zA-Z])/gi, (_, n) => { out.est_minutes = parseInt(n, 10); return " "; });
  if (!out.est_minutes) s = s.replace(/(\d+(?:\.\d+)?)\s*(時間|h\b|hr)/gi, (_, n) => { out.est_minutes = Math.round(parseFloat(n) * 60); return " "; });

  const now = new Date();
  let date = null;
  const wd = s.match(/(来週)?([月火水木金土日])曜(?:日)?/);
  if (wd) {
    const target = JP_DAYS[wd[2]];
    const base = startOfDay(now);
    let diff = (target - base.getDay() + 7) % 7;
    if (wd[1] === "来週") diff += 7;
    date = addDays(base, diff);
    s = s.replace(wd[0], " ");
  } else {
    const rel = s.match(/(今日|きょう|明日|あした|あす|明後日|あさって|週末)/);
    if (rel) {
      const k = rel[1];
      if (k === "今日" || k === "きょう") date = startOfDay(now);
      else if (k === "明日" || k === "あした" || k === "あす") date = addDays(startOfDay(now), 1);
      else if (k === "明後日" || k === "あさって") date = addDays(startOfDay(now), 2);
      else if (k === "週末") {
        const d = startOfDay(now);
        date = addDays(d, ((6 - d.getDay()) + 7) % 7 || 7);
      }
      s = s.replace(k, " ");
    }
  }

  let hour = null, minute = 0;
  const hm = s.match(/(\d{1,2}):(\d{2})/);
  if (hm) {
    hour = parseInt(hm[1], 10); minute = parseInt(hm[2], 10);
    s = s.replace(hm[0], " ");
  } else {
    const h = s.match(/(午前|午後)?\s*(\d{1,2})\s*時(?:\s*(半|(\d{1,2})\s*分))?/);
    if (h) {
      hour = parseInt(h[2], 10);
      if (h[1] === "午後" && hour < 12) hour += 12;
      if (h[1] === "午前" && hour === 12) hour = 0;
      if (h[3] === "半") minute = 30;
      else if (h[4]) minute = parseInt(h[4], 10);
      s = s.replace(h[0], " ");
    }
  }

  if (date || hour != null) {
    const d = date ? new Date(date) : startOfDay(now);
    if (hour == null) {
      d.setHours(23, 59, 0, 0);
    } else {
      d.setHours(hour, minute, 0, 0);
      if (!date && d < now) d.setDate(d.getDate() + 1);
    }
    out.due = d.toISOString();
  }
  out.title = s.replace(/\s+/g, " ").trim()
    .replace(/[、,。]+$/, "")
    .replace(/[をにでへがは]\s*$/, "")
    .trim() || String(raw).trim();
  return out;
}
function updateQuickHint(text) {
  const el = $("#quickHint");
  if (!el) return;
  if (!text.trim()) { el.innerHTML = ""; return; }
  const p = parseQuick(text);
  const bits = [];
  if (p.due) bits.push(`<span class="pill">${esc(fmtDue(p.due))}</span>`);
  if (p.est_minutes) bits.push(`<span class="pill gray">${fmtMin(p.est_minutes)}</span>`);
  if (p.category) bits.push(`<span class="pill gray">#${esc(p.category)}</span>`);
  if (p.priority) bits.push(`<span class="pill warn">${p.priority >= 2 ? "優先度高" : "優先度中"}</span>`);
  el.innerHTML = bits.length ? bits.join("") : `<span>Enterで追加</span>`;
}
async function quickAddKey(e) {
  if (e.key !== "Enter" || e.isComposing) return;
  const q = e.currentTarget;
  const parsed = parseQuick(q.value);
  if (!parsed.title) return;
  q.value = "";
  updateQuickHint("");
  const rec = {
    kind: "task", title: parsed.title, due: parsed.due,
    est_minutes: parsed.est_minutes || null, category: parsed.category || "",
    priority: parsed.priority || 0,
  };
  const { data, error } = await sb.from("sec_items").insert(rec).select().single();
  if (error) { toast(error.message, 3500); q.value = rec.title; return; }
  await loadItems();
  toast(rec.due ? `追加しました — ${fmtDue(rec.due)}` : "追加しました", 5000, {
    label: "元に戻す",
    fn: async () => { await sb.from("sec_items").delete().eq("id", data.id); await loadItems(); },
  });
}

/* ---------------------------------------------------------------------------
   13. 完了 / 編集
--------------------------------------------------------------------------- */
async function setDone(id, done, opts = {}) {
  const it = state.items.find(x => x.id === id);
  if (!it) return;
  const before = { done: it.done, done_at: it.done_at, actual_min: it.actual_min };
  it.done = done;
  it.done_at = done ? new Date().toISOString() : null;
  renderList();
  const { error } = await sb.from("sec_items").update({ done, done_at: it.done_at }).eq("id", id);
  if (error) {
    Object.assign(it, before);
    renderList();
    toast("保存できませんでした", 3000);
    return;
  }
  if (done && !opts.silent) toast("完了にしました", 5000, { label: "元に戻す", fn: () => setDone(id, false) });
}

let edState = null;
function openEditor(it) {
  if ($("#editor").open) return;
  edState = { ...(it || { kind: "task" }) };
  const isNote = edState.kind === "note" || !edState.kind;
  $("#editor").dataset.kind = isNote ? "note" : "task";
  $("#edTitle").textContent = edState.id
    ? (isNote ? "メモを編集" : "タスクを編集")
    : (isNote ? "新規メモ" : "新規タスク");
  $("#edT").value = edState.title || "";
  $("#edB").value = edState.body || "";
  $("#edD").value = toLocalInput(edState.due);
  $("#edC").value = edState.category || "";
  $("#edE").value = edState.est_minutes ?? "";
  $("#edH").checked = !!edState.ai_hidden;
  $$("#edP [data-p]").forEach(b => b.classList.toggle("on", parseInt(b.dataset.p, 10) === (edState.priority || 0)));
  const cats = [...new Set(state.items.map(x => x.category).filter(Boolean))].slice(0, 24);
  $("#catList").innerHTML = cats.map(c => `<option value="${esc(c)}">`).join("");
  $("#edDel").style.display = edState.id ? "" : "none";
  $("#editor").showModal();
  setTimeout(() => { try { $("#edT").focus(); } catch {} }, 80);
}
$("#editor").addEventListener("close", () => { edState = null; });
$("#edCancel").onclick = () => $("#editor").close();
$("#edClose").onclick = () => $("#editor").close();
$$("#editor [data-d]").forEach(b => b.onclick = () => {
  const k = b.dataset.d;
  if (k === "none") { $("#edD").value = ""; return; }
  const d = new Date();
  if (k === "tomorrow") d.setDate(d.getDate() + 1);
  if (k === "week") d.setDate(d.getDate() + 7);
  if (k === "weekend") d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(23, 59, 0, 0);
  $("#edD").value = toLocalInput(d.toISOString());
});
$$("#editor [data-e]").forEach(b => b.onclick = () => {
  $("#edE").value = b.dataset.e;
  $$("#estChips [data-e]").forEach(x => x.classList.toggle("on", x === b));
});
$$("#edP [data-p]").forEach(b => b.onclick = () => {
  $$("#edP [data-p]").forEach(x => x.classList.toggle("on", x === b));
});
$("#edForm").addEventListener("submit", async e => { e.preventDefault(); await saveEditor(); });
$("#editor").addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); saveEditor(); }
});
async function saveEditor() {
  if (!edState) return;
  const wasEdit = !!edState.id;
  const title = $("#edT").value.trim();
  if (!title) { toast("タイトルを入力してください"); $("#edT").focus(); return; }
  const isNote = $("#editor").dataset.kind === "note";
  const rec = {
    title,
    body: $("#edB").value,
    ai_hidden: $("#edH").checked,
    category: $("#edC").value.trim(),
  };
  if (!isNote) {
    rec.due = toIso($("#edD").value);
    rec.est_minutes = $("#edE").value ? parseInt($("#edE").value, 10) : null;
    rec.priority = parseInt($("#edP [data-p].on")?.dataset.p || "0", 10);
  }
  const { error } = edState.id
    ? await sb.from("sec_items").update(rec).eq("id", edState.id)
    : await sb.from("sec_items").insert({ kind: isNote ? "note" : "task", ...rec });
  if (error) { toast(error.message, 3500); return; }
  $("#editor").close();
  await loadItems();
  toast(wasEdit ? "保存しました" : "作成しました");
}
$("#edDel").onclick = async () => {
  if (!edState || !edState.id) return;
  const target = state.items.find(x => x.id === edState.id);
  const ok = await confirmAsk("削除しますか?", `「${edState.title}」を削除します。`, "削除");
  if (!ok) return;
  const { error } = await sb.from("sec_items").delete().eq("id", edState.id);
  if (error) { toast(error.message, 3500); return; }
  $("#editor").close();
  await loadItems();
  if (target) {
    toast("削除しました", 5000, {
      label: "元に戻す",
      fn: async () => {
        const { created_at, updated_at, ...rest } = target;
        await sb.from("sec_items").insert(rest);
        await loadItems();
      },
    });
  }
};

/* ---------------------------------------------------------------------------
   14. 集中モード
--------------------------------------------------------------------------- */
const focus = { taskId: null, title: "", total: 25 * 60, left: 25 * 60, paused: false, timer: null, wl: null, startedAt: 0 };
function startFocus(it, minutes) {
  if (!it) { const n = nextTask(); if (!n.item) { toast("集中するタスクがありません"); return; } it = n.item; }
  const total = clamp(parseInt(minutes || it.est_minutes || state.focusDefault, 10) || 25, 5, 180) * 60;
  focus.taskId = it.id; focus.title = it.title; focus.total = total; focus.left = total; focus.paused = false; focus.startedAt = Date.now();
  $("#focusTask").textContent = it.title;
  $("#focusPhase").textContent = "集中";
  $("#focus").hidden = false;
  document.body.style.overflow = "hidden";
  requestWakeLock();
  tickFocus();
  clearInterval(focus.timer);
  focus.timer = setInterval(tickFocus, 250);
}
function tickFocus() {
  if (!focus.paused) {
    const elapsed = (Date.now() - focus.startedAt) / 1000;
    focus.left = Math.max(0, focus.total - elapsed);
    if (focus.left <= 0) { finishFocus(); return; }
  }
  const m = Math.floor(focus.left / 60), s = Math.floor(focus.left % 60);
  $("#focusTime").textContent = `${pad2(m)}:${pad2(s)}`;
  const p = Math.round((1 - focus.left / focus.total) * 100);
  $("#focusRing").style.setProperty("--p", p);
  $("#focusMeta").textContent = `${fmtMin(Math.round(focus.total / 60))}のセッション · 残り${Math.ceil(focus.left / 60)}分`;
}
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) focus.wl = await navigator.wakeLock.request("screen");
  } catch {}
}
function releaseWakeLock() {
  try { focus.wl && focus.wl.release(); } catch {}
  focus.wl = null;
}
function togglePause() {
  focus.paused = !focus.paused;
  if (!focus.paused) {
    focus.startedAt = Date.now() - (focus.total - focus.left) * 1000;
    $("#focusPhase").textContent = "集中";
    $("#focusPause").innerHTML = `${icon("pause")}<span>一時停止</span>`;
  } else {
    $("#focusPhase").textContent = "一時停止";
    $("#focusPause").innerHTML = `${icon("play")}<span>再開</span>`;
  }
}
async function closeFocusOverlay() {
  clearInterval(focus.timer);
  focus.timer = null;
  releaseWakeLock();
  $("#focus").hidden = true;
  document.body.style.overflow = "";
}
async function finishFocus() {
  if ($("#focus").hidden) return;
  const elapsedMin = Math.max(1, Math.round((focus.total - focus.left) / 60));
  const id = focus.taskId;
  await closeFocusOverlay();
  const it = state.items.find(x => x.id === id);
  if (it) {
    const { error } = await sb.from("sec_items").update({ actual_min: elapsedMin }).eq("id", id);
    if (error) console.warn(error);
    const ok = await confirmAsk("おつかれさまでした", `${elapsedMin}分集中しました。このタスクを完了にしますか?`, "完了にする");
    if (ok) await setDone(id, true, { silent: true });
    await loadItems();
    toast(ok ? `完了 — ${elapsedMin}分を記録しました` : `${elapsedMin}分を記録しました`, 3200);
  }
}
$("#focusClose").onclick = () => finishFocus();
$("#focusFinish").onclick = () => finishFocus();
$("#focusPause").onclick = () => togglePause();
$("#focusAdd").onclick = () => { focus.total += 300; focus.left += 300; tickFocus(); };

/* ---------------------------------------------------------------------------
   15. コマンドパレット
--------------------------------------------------------------------------- */
function paletteActions() {
  const acts = [
    { id: "new-task", label: "新規タスク", icon: "plus", hint: "N", run: () => openEditor({ kind: "task" }) },
    { id: "new-note", label: "新規メモ", icon: "notes", run: () => openEditor({ kind: "note" }) },
    { id: "new-project", label: "新規プロジェクト (EE / IA / TOK)", icon: "grid", run: () => openProjectEditor({ kind: "EE" }) },
    { id: "today", label: "今日へ移動", icon: "today", run: () => setView("today") },
    { id: "tasks", label: "タスクへ移動", icon: "tasks", run: () => setView("tasks") },
    { id: "calendar", label: "カレンダーを開く", icon: "calendar", run: () => { state.taskMode = "calendar"; localStorage.setItem("sec_task_mode", "calendar"); setView("tasks"); } },
    { id: "ai-plan", label: "AIに今日の計画を相談", icon: "spark", run: () => askAiPlan(ymd(new Date())) },
    { id: "projects", label: "プロジェクトへ移動", icon: "grid", run: () => setView("projects") },
    { id: "notes", label: "メモへ移動", icon: "notes", run: () => setView("notes") },
    { id: "settings", label: "設定を開く", icon: "settings", run: () => setView("settings") },
    { id: "focus", label: "集中モードをはじめる", icon: "play", run: () => startFocus(nextTask().item) },
    { id: "replan", label: "計画を組み直す", icon: "refresh", run: () => autoPlan({ manual: true }) },
    { id: "ai-score", label: "AIで所要時間・難易度・重要度を推定", icon: "spark", run: () => scoreTasks({ manual: true }) },
    { id: "theme", label: "テーマを切り替える", icon: "moon", run: cycleTheme },
    { id: "sync", label: "最新に同期する", icon: "refresh", run: async () => { await loadAll(); toast("同期しました"); } },
    { id: "export", label: "JSONで書き出す", icon: "db", run: exportData },
    { id: "chat", label: "秘書に話しかける", icon: "chat", run: () => { setView("chat"); setTimeout(() => $("#q").focus(), 60); } },
  ];
  return acts;
}
function openPalette() {
  if ($("#palette").open) return;
  $("#palQ").value = "";
  state.paletteIndex = 0;
  renderPalette("");
  $("#palette").showModal();
  setTimeout(() => $("#palQ").focus(), 30);
}
function renderPalette(q) {
  q = q.trim().toLowerCase();
  const actions = paletteActions().filter(a => !q || a.label.toLowerCase().includes(q) || a.id.includes(q));
  const items = visibleItems()
    .filter(i => q && matchQuery(i, q))
    .slice(0, 8);
  const projects = state.projects
    .filter(p => q && [p.title, p.subject, kindLabel(p.kind)].join(" ").toLowerCase().includes(q))
    .slice(0, 4);
  const list = [];
  if (actions.length) {
    list.push(`<div class="pal-group">コマンド</div>`);
    actions.forEach(a => list.push(`<button type="button" class="pal-item" data-type="act" data-id="${a.id}">${icon(a.icon)}<span>${esc(a.label)}</span>${a.hint ? `<span class="pal-sub"><kbd>${a.hint}</kbd></span>` : ""}</button>`));
  }
  if (projects.length) {
    list.push(`<div class="pal-group">プロジェクト</div>`);
    projects.forEach(p => list.push(`<button type="button" class="pal-item" data-type="project" data-id="${p.id}">${icon("grid")}<span>${esc(p.title)}</span><span class="pal-kind">${esc(kindLabel(p.kind))}</span><span class="pal-sub">${projectProgress(p)}%</span></button>`));
  }
  if (items.length) {
    list.push(`<div class="pal-group">タスクとメモ</div>`);
    items.forEach(i => list.push(`<button type="button" class="pal-item" data-type="item" data-id="${i.id}">${icon(i.kind === "note" ? "notes" : "tasks")}<span>${esc(i.title)}</span><span class="pal-kind">${i.mb ? "MB" : i.kind === "note" ? "メモ" : "タスク"}</span><span class="pal-sub">${i.due ? esc(fmtDue(i.due)) : ""}</span></button>`));
  }
  if (!list.length) list.push(`<div class="pal-empty">「${esc(q)}」に一致する項目はありません。Enterで新しいタスクとして追加できます。</div>`);
  $("#palList").innerHTML = list.join("");
  state.paletteItems = $$("#palList .pal-item");
  state.paletteItems.forEach((el, idx) => {
    el.onclick = () => runPaletteItem(el);
    el.onmouseenter = () => { state.paletteIndex = idx; highlightPalette(); };
  });
  state.paletteIndex = clamp(state.paletteIndex, 0, Math.max(0, state.paletteItems.length - 1));
  highlightPalette();
}
function highlightPalette() {
  state.paletteItems.forEach((el, i) => el.classList.toggle("on", i === state.paletteIndex));
  const cur = state.paletteItems[state.paletteIndex];
  if (cur) cur.scrollIntoView({ block: "nearest" });
}
function runPaletteItem(el) {
  if (!el) return;
  const id = el.dataset.id;
  $("#palette").close();
  if (el.dataset.type === "act") {
    const a = paletteActions().find(x => x.id === id);
    if (a) a.run();
  } else if (el.dataset.type === "project") {
    state.view = "projects"; state.projectId = id;
    renderApp(); view.scrollTop = 0;
  } else {
    const it = state.items.find(x => x.id === id);
    if (it) { if (it.mb) { it.url && window.open(it.url, "_blank", "noopener"); } else openEditor(it); }
  }
}
$("#palQ").addEventListener("input", e => { state.paletteIndex = 0; renderPalette(e.target.value); });
$("#palQ").addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { e.preventDefault(); state.paletteIndex = Math.min(state.paletteItems.length - 1, state.paletteIndex + 1); highlightPalette(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); state.paletteIndex = Math.max(0, state.paletteIndex - 1); highlightPalette(); }
  else if (e.key === "Enter") {
    e.preventDefault();
    if (state.paletteItems.length) runPaletteItem(state.paletteItems[state.paletteIndex]);
    else {
      const title = $("#palQ").value.trim();
      if (title) { $("#palette").close(); openEditor({ kind: "task", title }); }
    }
  }
});
$("#palette").addEventListener("click", e => { if (e.target === $("#palette")) $("#palette").close(); });
$("#palList").addEventListener("mousemove", () => {});

/* ---------------------------------------------------------------------------
   16. チャット
--------------------------------------------------------------------------- */
const PROMPTS = ["今日の計画を立てて", "今週の予定を確認", "タスクを整理して", "明日の準備を教えて"];
let voiceList = [];
function loadVoices() {
  try { voiceList = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch { voiceList = []; }
}
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
const stripSpeech = t => String(t || "")
  .replace(/```[\s\S]*?```/g, "。")
  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/[#>*_`]/g, " ")
  .replace(/\s+/g, " ")
  .trim();
function speak(text, onend) {
  if (!("speechSynthesis" in window) || !text) { if (onend) onend(); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(stripSpeech(text).slice(0, 1200));
    const ja = voiceList.find(v => /^ja/i.test(v.lang) && /kyoko|o-ren|google/i.test(v.name)) || voiceList.find(v => /^ja/i.test(v.lang));
    if (ja) u.voice = ja;
    u.lang = "ja-JP"; u.rate = 1.03; u.pitch = 1;
    if (onend) u.onend = onend;
    speechSynthesis.speak(u);
  } catch { if (onend) onend(); }
}
function greetingText() {
  const st = todayStat();
  const next = plannedToday().find(i => !i.done);
  const h = new Date().getHours();
  const word = h < 5 ? "こんばんは" : h < 11 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";
  let s = `${word}。秘書です。`;
  if (st.overdue) s += `期限切れが${st.overdue}件あります。`;
  if (st.total) s += `今日は${st.total}件のうち、${st.done}件が完了しています。`;
  else s += "今日の予定はまだありません。";
  if (next) s += `次は${fmtClock(next.scheduled_start)}から、${next.title}です。`;
  return s;
}
let greeted = false;
function greet() {
  if (greeted) return;
  greeted = true;
  if (localStorage.getItem("sec_voice_greet") === "0") return;
  setTimeout(() => { if (app.classList.contains("ready") && !reducedMotion()) speak(greetingText()); }, 700);
}

/* markdown-lite (XSS-safe: escapes first) */
function md(src) {
  let s = esc(src);
  const blocks = [];
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(`<pre><code>${code.replace(/\n$/, "")}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  s = s.replace(/^###\s+(.+)$/gm, "<h4>$1</h4>")
       .replace(/^##\s+(.+)$/gm, "<h3>$1</h3>")
       .replace(/^#\s+(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
       .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
       .replace(/`([^`]+)`/g, "<code>$1</code>")
       .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
       .replace(/^---+$/gm, "<hr>");
  const lines = s.split("\n");
  let html = "", list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const ph = line.match(/^\u0000(\d+)\u0000$/);
    if (ph) { closeList(); html += blocks[parseInt(ph[1], 10)] || ""; continue; }
    if (/^<h[34]>/.test(line) || /^<hr>/.test(line)) { closeList(); html += line; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; }
      html += `<li>${line.replace(/^\s*[-*]\s+/, "")}</li>`; continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; }
      html += `<li>${line.replace(/^\s*\d+\.\s+/, "")}</li>`; continue;
    }
    if (!line.trim()) { closeList(); continue; }
    closeList();
    html += `<p>${line}</p>`;
  }
  closeList();
  return html;
}
function scrollMsgs(smooth = false) {
  msgs.scrollTo({ top: msgs.scrollHeight, behavior: smooth && !reducedMotion() ? "smooth" : "auto" });
  $("#scrollDown").classList.remove("on");
}
function addActions(el, text) {
  const acts = document.createElement("div");
  acts.className = "b-acts";
  const copy = document.createElement("button");
  copy.type = "button"; copy.title = "コピー"; copy.innerHTML = icon("copy");
  copy.onclick = async e => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); toast("コピーしました", 1600); }
    catch { toast("コピーできませんでした"); }
  };
  const sp = document.createElement("button");
  sp.type = "button"; sp.title = "読み上げ"; sp.innerHTML = icon("speaker");
  sp.onclick = e => { e.stopPropagation(); speak(text); };
  acts.append(copy, sp);
  el.appendChild(acts);
}
function bubble(role, text, opts = {}) {
  const d = document.createElement("div");
  d.className = "b " + role;
  if (role === "ai") {
    const mdEl = document.createElement("div");
    mdEl.className = "md";
    mdEl.innerHTML = md(text);
    d.appendChild(mdEl);
    addActions(d, text);
  } else {
    d.textContent = text;
  }
  if (opts.time) {
    const t = document.createElement("span");
    t.className = "b-time";
    t.textContent = opts.time;
    d.appendChild(t);
  }
  msgs.appendChild(d);
  scrollMsgs();
  return d;
}
function typingBubble() {
  const d = document.createElement("div");
  d.className = "b ai typing";
  d.innerHTML = "<i></i><i></i><i></i>";
  msgs.appendChild(d);
  scrollMsgs();
  return d;
}
function errorBubble(msg, retry) {
  const d = document.createElement("div");
  d.className = "b error";
  d.innerHTML = `<div><b>応答できませんでした</b><div class="em">${esc(msg)}</div></div>`;
  const b = document.createElement("button");
  b.type = "button"; b.textContent = "再送する";
  b.onclick = () => { d.remove(); sendChat(retry); };
  d.appendChild(b);
  msgs.appendChild(d);
  scrollMsgs();
}
function setAI(mode) {
  const dot = $("#aiDot"), txt = $("#aiText");
  if (!dot) return;
  dot.className = "dot" + (mode === "busy" ? " busy" : mode === "off" ? " off" : "");
  txt.textContent = mode === "busy" ? "考えています…" : mode === "off" ? "オフライン" : "待機中";
}
function showPrompts() {
  const p = $("#prompts");
  if (!p) return;
  const hasUser = state.chat.some(m => m.role === "user");
  if (hasUser) { p.classList.add("hide"); return; }
  p.classList.remove("hide");
  p.innerHTML = PROMPTS.map(t => `<button type="button">${esc(t)}</button>`).join("");
  $$("#prompts button").forEach(b => b.onclick = () => { p.classList.add("hide"); sendChat(b.textContent); });
}
function saveChat() {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(state.chat.slice(-40))); } catch {}
}
function renderChatHistory() {
  msgs.innerHTML = "";
  if (!state.chat.length) {
    bubble("sys", "秘書です。予定・タスク・メモ・計画の相談を話しかけてください。変更は提案として出るので、確認して「適用」を押します。");
  } else {
    state.chat.slice(-14).forEach(m => bubble(m.role === "user" ? "user" : "ai", m.content));
  }
  showPrompts();
}
async function askServer(message, history) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, error } = await sb.functions.invoke("ai", {
    body: { message, history, tz, now: new Date().toLocaleString("ja-JP", { dateStyle: "full", timeStyle: "short", timeZone: tz }) },
  });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch {}
    return { error: msg };
  }
  return data;
}
async function sendChat(text) {
  text = String(text || "").trim();
  if (!text) return;
  if (state.sending) { toast("応答を待っています", 2000); return; }
  state.sending = true;
  $("#send").disabled = true;
  setAI("busy");
  $("#prompts").classList.add("hide");
  bubble("user", text, { time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) });
  const history = state.chat.slice(-12);
  state.chat.push({ role: "user", content: text });
  const waitEl = typingBubble();
  let r;
  try { r = await askServer(text, history); }
  catch (e) { r = { error: String(e).slice(0, 200) }; }
  waitEl.remove();
  if (r.error) {
    state.chat.pop();
    saveChat();
    errorBubble(r.error, text);
    toast("応答に失敗しました", 3000);
  } else {
    const answer = r.text || "(応答なし)";
    bubble("ai", answer);
    if (localStorage.getItem("sec_voice_read") === "1") speak(answer);
    state.chat.push({ role: "assistant", content: answer });
    saveChat();
    if (r.tried && r.tried.length > 1 && r.tried.some(t => !t.ok)) {
      bubble("sys", `${r.tried.filter(t => !t.ok).map(t => t.provider).join(",")}が失敗したため ${r.provider} で応答しました`);
    }
    const props = r.proposals || [];
    props.forEach(p => addProposal(p));
    if (props.length > 1) addBatchApply(props.length);
    showPrompts();
  }
  state.sending = false;
  $("#send").disabled = false;
  setAI(navigator.onLine ? "idle" : "off");
}
function titleOf(id) { return state.items.find(x => x.id === id)?.title || id; }
function describe(p) {
  const a = p.args || {};
  switch (p.tool) {
    case "propose_add_task": return `タスク追加: ${a.title}${a.due ? `(${fmtDue(toIso(a.due))})` : ""}${a.est_minutes ? ` / ${a.est_minutes}分` : ""}${a.category ? ` [${a.category}]` : ""}`;
    case "propose_add_note": return `メモ追加: ${a.title}`;
    case "propose_update_item": {
      const ch = [a.title && `題名→${a.title}`, a.due && `期限→${fmtDue(toIso(a.due))}`, a.category && `カテゴリ→${a.category}`, a.est_minutes && `見積り→${a.est_minutes}分`, a.body !== undefined && "本文を変更"].filter(Boolean).join(" / ");
      return `更新: ${titleOf(a.id)}(${ch})`;
    }
    case "propose_complete_task": return `完了にする: ${titleOf(a.id)}`;
    case "propose_delete_item": return `削除: ${titleOf(a.id)}`;
    case "propose_memory": return `覚える: ${a.text}`;
    case "propose_schedule": {
      const f = iso => new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      return `時間割り当て: ${titleOf(a.id)} → ${f(a.scheduled_start)}〜${f(a.scheduled_end)}`;
    }
    case "propose_estimate": return `見積り推定: ${titleOf(a.id)} → ${a.est_minutes}分${a.reason ? `(${a.reason})` : ""}`;
    default: return p.tool;
  }
}
function proposalIcon(tool) {
  if (tool.includes("delete")) return "trash";
  if (tool.includes("memory")) return "spark";
  if (tool.includes("schedule")) return "calendar";
  if (tool.includes("estimate")) return "clock";
  if (tool.includes("complete")) return "check";
  return "plus";
}
async function applyProposal(p) {
  const a = p.args || {};
  const must = r => { if (r.error) throw new Error(r.error.message); return r; };
  switch (p.tool) {
    case "propose_add_task": {
      const { data } = must(await sb.from("sec_items").insert({ kind: "task", title: a.title, due: toIso(a.due), category: a.category || "", est_minutes: a.est_minutes || null, body: a.notes || "" }).select().single());
      return async () => { await sb.from("sec_items").delete().eq("id", data.id); };
    }
    case "propose_add_note": {
      const { data } = must(await sb.from("sec_items").insert({ kind: "note", title: a.title, body: a.body || "", category: a.category || "" }).select().single());
      return async () => { await sb.from("sec_items").delete().eq("id", data.id); };
    }
    case "propose_update_item": {
      const prev = state.items.find(x => x.id === a.id); if (!prev) throw new Error("対象が見つかりません");
      const patch = {};
      ["title", "body", "category", "est_minutes"].forEach(k => { if (a[k] !== undefined) patch[k] = a[k]; });
      if (a.due) patch.due = toIso(a.due);
      const old = {}; Object.keys(patch).forEach(k => old[k] = prev[k]);
      must(await sb.from("sec_items").update(patch).eq("id", a.id));
      return async () => { await sb.from("sec_items").update(old).eq("id", a.id); };
    }
    case "propose_complete_task": {
      const patch = { done: true, done_at: new Date().toISOString() };
      if (a.actual_min != null) patch.actual_min = a.actual_min;
      must(await sb.from("sec_items").update(patch).eq("id", a.id));
      return async () => { await sb.from("sec_items").update({ done: false, done_at: null }).eq("id", a.id); };
    }
    case "propose_delete_item": {
      const prev = state.items.find(x => x.id === a.id); if (!prev) throw new Error("対象が見つかりません");
      must(await sb.from("sec_items").delete().eq("id", a.id));
      return async () => { const { created_at, updated_at, ...rest } = prev; await sb.from("sec_items").insert(rest); };
    }
    case "propose_memory": {
      const { data } = must(await sb.from("sec_memory").insert({ text: a.text }).select().single());
      return async () => { await sb.from("sec_memory").delete().eq("id", data.id); };
    }
    case "propose_schedule": {
      const prev = state.items.find(x => x.id === a.id); if (!prev) throw new Error("対象が見つかりません");
      const old = { scheduled_start: prev.scheduled_start ?? null, scheduled_end: prev.scheduled_end ?? null };
      must(await sb.from("sec_items").update({ scheduled_start: toIso(a.scheduled_start), scheduled_end: toIso(a.scheduled_end) }).eq("id", a.id));
      return async () => { await sb.from("sec_items").update(old).eq("id", a.id); };
    }
    case "propose_estimate": {
      const prev = state.items.find(x => x.id === a.id); if (!prev) throw new Error("対象が見つかりません");
      must(await sb.from("sec_items").update({ est_minutes: a.est_minutes }).eq("id", a.id));
      return async () => { await sb.from("sec_items").update({ est_minutes: prev.est_minutes ?? null }).eq("id", a.id); };
    }
    default: throw new Error("未対応の操作");
  }
}
function proposalView(p) {
  const a = p.args || {};
  const range = a.scheduled_start && a.scheduled_end
    ? `${new Date(a.scheduled_start).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} – ${new Date(a.scheduled_end).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
    : "";
  switch (p.tool) {
    case "propose_add_task":
      return { kind: "タスクを追加", main: a.title || "", meta: [a.due ? fmtDue(toIso(a.due)) : "", a.est_minutes ? `${a.est_minutes}分` : "", a.category ? `#${a.category}` : ""].filter(Boolean), detail: a.notes || "" };
    case "propose_add_note":
      return { kind: "メモを追加", main: a.title || "", meta: [a.category ? `#${a.category}` : ""].filter(Boolean), detail: (a.body || "").slice(0, 160) };
    case "propose_update_item": {
      const meta = [a.title && `題名 → ${a.title}`, a.due && `期限 → ${fmtDue(toIso(a.due))}`, a.category && `カテゴリ → ${a.category}`, a.est_minutes && `見積り → ${a.est_minutes}分`, a.body !== undefined && "本文を変更"].filter(Boolean);
      return { kind: "タスクを更新", main: titleOf(a.id), meta, detail: "" };
    }
    case "propose_complete_task":
      return { kind: "タスクを完了", main: titleOf(a.id), meta: [a.actual_min ? `実績 ${a.actual_min}分` : ""].filter(Boolean), detail: "" };
    case "propose_delete_item":
      return { kind: "削除", main: titleOf(a.id), meta: ["適用後も元に戻せます"], detail: "" };
    case "propose_memory":
      return { kind: "記憶に保存", main: a.text || "", meta: ["AIの記憶"], detail: "" };
    case "propose_schedule":
      return { kind: "時間を割り当て", main: titleOf(a.id), meta: [range, "タイムラインに反映"], detail: "" };
    case "propose_estimate":
      return { kind: "見積りを更新", main: titleOf(a.id), meta: [`${a.est_minutes}分`], detail: a.reason || "" };
    default:
      return { kind: "提案", main: describe(p), meta: [], detail: "" };
  }
}
function addProposal(p) {
  const v = proposalView(p);
  const d = document.createElement("div");
  d.className = "prop";
  d.innerHTML = `<div class="prop-head">${icon(proposalIcon(p.tool))}提案</div>
    <div class="prop-title">${esc(v.kind)}</div>
    <div class="prop-main">${esc(v.main)}</div>
    ${v.meta.length ? `<div class="prop-meta">${v.meta.map(m => `<span class="pill">${esc(m)}</span>`).join("")}</div>` : ""}
    ${v.detail ? `<div class="prop-detail">${esc(v.detail)}</div>` : ""}
    <div class="prop-acts"><button class="btn btn-primary" data-a="ok" type="button">適用</button><button class="btn btn-quiet" data-a="no" type="button">却下</button></div>`;
  msgs.appendChild(d);
  scrollMsgs();
  let undo = null;
  d.addEventListener("click", async e => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (!a) return;
    if (a === "ok") {
      const btn = e.target.closest("[data-a]");
      btn.disabled = true;
      try {
        undo = await applyProposal(p);
        d.className = "prop applied";
        d.querySelector(".prop-acts").innerHTML = `<span class="sub">適用済み</span> <button class="btn btn-quiet" data-a="undo" type="button">${icon("undo")}元に戻す</button>`;
        toast("適用しました", 2500);
        loadAll();
      } catch (err) {
        btn.disabled = false;
        toast("適用に失敗: " + err.message, 4000);
      }
    } else if (a === "no") {
      d.className = "prop rejected";
      d.querySelector(".prop-acts").innerHTML = `<span class="sub">却下しました</span>`;
    } else if (a === "undo" && undo) {
      await undo();
      undo = null;
      d.className = "prop rejected";
      d.querySelector(".prop-acts").innerHTML = `<span class="sub">元に戻しました</span>`;
      loadAll();
    }
  });
}
function addBatchApply(n) {
  const d = document.createElement("div");
  d.className = "prop-multi";
  d.innerHTML = `<span>${n}件の提案</span><button class="btn btn-primary btn-sm" type="button">すべて適用</button>`;
  d.querySelector("button").onclick = async () => {
    const btns = $$("#msgs .prop:not(.applied):not(.rejected) [data-a='ok']");
    for (const b of btns) { b.click(); await wait(320); }
    d.remove();
  };
  msgs.appendChild(d);
  scrollMsgs();
}

/* 入力 */
function autosize() {
  const q = $("#q");
  q.style.height = "auto";
  q.style.height = (Math.min(q.scrollHeight || 46, 120)) + "px";
}
function sendNow() {
  if (state.sending) { toast("応答を待っています", 2000); return; }
  const q = $("#q");
  const v = q.value.trim();
  if (!v) return;
  q.value = "";
  autosize();
  sendChat(v);
}
$("#send").onclick = sendNow;
$("#q").addEventListener("input", autosize);
$("#q").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendNow(); }
});
msgs.addEventListener("scroll", () => {
  $("#scrollDown").classList.toggle("on", msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight > 220);
});
$("#scrollDown").onclick = () => scrollMsgs(true);
$("#chatClear").onclick = async () => {
  if (!state.chat.length) { toast("履歴はありません"); return; }
  const ok = await confirmAsk("会話履歴を消しますか?", "この端末に保存されている秘書とのやり取りを消します。タスクとメモは残ります。", "消去");
  if (!ok) return;
  state.chat = [];
  saveChat();
  renderChatHistory();
  toast("履歴を消去しました");
};
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
$("#mic").onclick = () => {
  if (!SR) { bubble("sys", "このブラウザは音声認識に未対応です。キーボードのマイクボタンで音声入力できます"); return; }
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = "ja-JP"; rec.interimResults = true; rec.continuous = false;
  $("#mic").classList.add("rec");
  rec.onresult = e => { $("#q").value = Array.from(e.results).map(r => r[0].transcript).join(""); autosize(); };
  rec.onend = () => { rec = null; $("#mic").classList.remove("rec"); sendNow(); };
  rec.onerror = ev => { rec = null; $("#mic").classList.remove("rec"); bubble("sys", `音声認識エラー(${ev.error})。キーボードのマイクボタンでも音声入力できます`); };
  rec.start();
};
$("#chatClose").onclick = () => setView(state.listView === "settings" ? "today" : state.listView);

/* ---------------------------------------------------------------------------
   17. 設定
--------------------------------------------------------------------------- */
function exportData() {
  const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), app: "AI秘書 v2", items: state.items, memory: state.memory }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "secretary-export.json";
  a.click();
}
function estInsight() {
  const f = estFactorMap();
  const entries = Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!entries.length) return "";
  return `<div class="insight">${icon("spark")}<div>見積り補正: ${entries.map(([k, v]) => `${esc(k || "その他")} ×${v.toFixed(1)}`).join(" / ")}。次回の自動計画に反映しています。</div></div>`;
}
function weekStats() {
  const start = addDays(startOfDay(), -6);
  const done = state.items.filter(i => i.kind === "task" && i.done && i.done_at && new Date(i.done_at) >= start);
  const focusMin = done.filter(i => !i.mb && i.actual_min).reduce((a, i) => a + i.actual_min, 0);
  const overdue = visibleItems().filter(i => i.kind === "task" && !i.done && i.due && new Date(i.due) < new Date()).length;
  return { done: done.length, focusMin, overdue, created: state.items.filter(i => i.kind === "task" && i.created_at && new Date(i.created_at) >= start).length };
}
function renderSettings() {
  const keepScroll = renderSettings._last ? view.scrollTop : 0;
  view.classList.add("narrow");
  const open = visibleItems().filter(i => i.kind === "task" && !i.done).length;
  const notes = state.items.filter(i => i.kind === "note").length;
  const online = navigator.onLine;
  const greetOn = localStorage.getItem("sec_voice_greet") !== "0";
  const readOn = localStorage.getItem("sec_voice_read") === "1";
  const autoOn = localStorage.getItem("sec_autoplan") !== "0";
  const theme = localStorage.getItem(THEME_KEY) || "auto";
  const accent = localStorage.getItem(ACCENT_KEY) || "orange";
  const density = localStorage.getItem(DENSITY_KEY) || "cozy";
  const reduce = localStorage.getItem(MOTION_KEY) === "reduce";
  const cap = defaultCap();
  const ws = weekStats();

  view.innerHTML = `<div class="settings-grid">
    <section class="card settings-card" style="grid-column:1/-1">
      <h2>${icon("user")}アカウント</h2>
      <div class="set-row" style="padding-top:12px">
        <div class="set-label"><b>${esc(state.userEmail || "未ログイン")}</b><small>${online ? "Supabaseと同期中" : "オフライン"}</small></div>
        <span class="pill ${online ? "ok" : "gray"}">${online ? "オンライン" : "オフライン"}</span>
      </div>
      <div class="stat-grid">
        <div><b>${open}</b><span>未完了タスク</span></div>
        <div><b>${notes}</b><span>メモ</span></div>
        <div><b>${state.memory.length}</b><span>AIの記憶</span></div>
      </div>
      <div class="set-row" style="display:block">
        <div class="set-label"><b>パスワード</b><small>変更後は次回のログインから適用されます</small></div>
        <div class="addrow" style="display:flex;gap:8px;margin-top:8px"><input class="field" id="pwNew" type="password" placeholder="新しいパスワード(8文字以上)" autocomplete="new-password"><button class="btn btn-ghost btn-sm" id="pwChange">変更</button></div>
      </div>
    </section>

    <section class="card settings-card">
      <h2>${icon("spark")}今週の振り返り</h2>
      <p class="desc">直近7日間の進み具合。</p>
      <div class="stat-grid" style="grid-template-columns:repeat(2,1fr)">
        <div><b>${ws.done}</b><span>完了したタスク</span></div>
        <div><b>${fmtMin(ws.focusMin)}</b><span>集中した時間</span></div>
        <div><b>${ws.created}</b><span>新しく追加</span></div>
        <div><b class="${ws.overdue ? "danger" : ""}" style="${ws.overdue ? "color:var(--danger)" : ""}">${ws.overdue}</b><span>期限切れ</span></div>
      </div>
    </section>

    <section class="card settings-card">
      <h2>${icon("moon")}外観</h2>
      <p class="desc">テーマとアクセント。端末ごとに保存されます。</p>
      <div class="set-row"><div class="set-label"><b>テーマ</b></div>
        <div class="set-ctl"><div class="seg" id="themeSeg">${[["auto", "自動"], ["light", "ライト"], ["dark", "ダーク"]].map(([k, l]) => `<button type="button" data-t="${k}" class="${theme === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      </div>
      <div class="set-row"><div class="set-label"><b>アクセント</b></div>
        <div class="set-ctl"><div class="theme-swatches">${[["orange", "オレンジ"], ["amber", "アンバー"], ["sage", "セージ"], ["blue", "ブルー"]].map(([k, l]) => `<button type="button" class="swatch ${accent === k ? "on" : ""}" data-a="${k}" title="${l}" aria-label="${l}"></button>`).join("")}</div></div>
      </div>
      <div class="set-row"><div class="set-label"><b>密度</b><small>リストの詰まり具合</small></div>
        <div class="set-ctl"><div class="seg" id="densitySeg">${[["cozy", "ゆったり"], ["compact", "コンパクト"]].map(([k, l]) => `<button type="button" data-d="${k}" class="${density === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      </div>
      <div class="set-row"><div class="set-label"><b>アニメーションを減らす</b><small>動きを抑えて軽くします</small></div>
        <div class="set-ctl"><input type="checkbox" class="switch" id="optMotion" ${reduce ? "checked" : ""}></div>
      </div>
    </section>

    <section class="card settings-card">
      <h2>${icon("calendar")}計画と集中</h2>
      <p class="desc">自動割り当てと集中セッションの既定値。</p>
      <div class="set-row"><div class="set-label"><b>空き時間に自動で割り当てる</b><small>開いたとき・変更時に計画を更新</small></div>
        <div class="set-ctl"><input type="checkbox" class="switch" id="optAuto" ${autoOn ? "checked" : ""}></div>
      </div>
      <div class="set-row"><div class="set-label"><b>AIで所要時間・難易度・重要度を自動推定</b><small>新しいタスクをAIが採点し、やる日を振り分けます</small></div>
        <div class="set-ctl"><input type="checkbox" class="switch" id="optAutoscore" ${localStorage.getItem("sec_autoscore") !== "0" ? "checked" : ""}></div>
      </div>
      <div class="set-row"><div class="set-label"><b>いま推定を実行</b><small>${unscoredCount() ? `${unscoredCount()}件が未推定` : "すべて推定済み"}</small></div>
        <div class="set-ctl"><button class="btn btn-ghost btn-sm" id="scoreNow" ${scoring.running ? "disabled" : ""}>${icon("spark")}${scoring.running ? "推定中…" : "AI推定"}</button></div>
      </div>
      <div class="set-row"><div class="set-label"><b>1ヶ月以上前の期限切れを表示</b><small>既定は非表示。30日以上前の未完了は一覧・カレンダー・件数から隠します(データは残ります)</small></div>
        <div class="set-ctl"><input type="checkbox" class="switch" id="optShowStale" ${staleHidden() ? "" : "checked"}></div>
      </div>
      <div class="set-row"><div class="set-label"><b>既定キャパシティ</b><small>今日のチップで上書きできます</small></div>
        <div class="set-ctl"><div class="seg" id="capSeg">${[[60, "1h"], [120, "2h"], [180, "3h"], [240, "4h"]].map(([m, l]) => `<button type="button" data-cap="${m}" class="${cap === m ? "on" : ""}">${l}</button>`).join("")}</div></div>
      </div>
      <div class="set-row"><div class="set-label"><b>集中セッションの長さ</b><small>タスクに見積りがないとき</small></div>
        <div class="set-ctl"><div class="seg" id="focusSeg">${[15, 25, 45, 60].map(m => `<button type="button" data-m="${m}" class="${state.focusDefault === m ? "on" : ""}">${m}分</button>`).join("")}</div></div>
      </div>
      <div class="set-row"><div class="set-label"><b>計画を組み直す</b></div>
        <div class="set-ctl"><button class="btn btn-ghost btn-sm" id="replanBtn">${icon("refresh")}実行</button></div>
      </div>
      ${estInsight()}
    </section>

    <section class="card settings-card">
      <h2>${icon("chat")}秘書</h2>
      <p class="desc">AIの接続確認と、覚えておいてほしいこと。</p>
      <div class="set-row"><div class="set-label"><b>AI接続</b><small id="aiTestOut">Gemini → NVIDIA NIM の順で試します</small></div>
        <div class="set-ctl"><button class="btn btn-ghost btn-sm" id="aiTest">テスト</button></div>
      </div>
      <div class="set-row" style="display:block">
        <div class="set-label" style="margin-bottom:8px"><b>AIの記憶</b><small>承認制で保存された好みや固定予定</small></div>
        <div id="memList"></div>
        <div class="addrow" style="display:flex;gap:8px;margin-top:8px"><input class="field" id="memNew" placeholder="例: 毎週水曜は部活"><button class="btn btn-ghost btn-sm" id="memAdd">追加</button></div>
      </div>
      <div class="set-row"><div class="set-label"><b>会話履歴</b><small>${state.chat.length}件をこの端末に保存</small></div>
        <div class="set-ctl"><button class="btn btn-ghost btn-sm" id="clearChatBtn">消去</button></div>
      </div>
    </section>

    <section class="card settings-card">
      <h2>${icon("link")}連携</h2>
      <p class="desc">カレンダーへの書き出しと購読。</p>
      <div class="set-row" style="display:block">
        <div class="set-label" style="margin-bottom:6px"><b>Googleカレンダー</b><small id="gcalStatus">確認中…</small></div>
        <div class="set-ctl" style="justify-content:flex-start"><button class="btn btn-ghost btn-sm" id="gcalSync">同期</button><button class="btn btn-ghost btn-sm" id="gcalConnect">連携</button><button class="btn btn-quiet btn-sm" id="gcalDisc">解除</button></div>
      </div>
      <div class="set-row" style="display:block">
        <div class="set-label" style="margin-bottom:6px"><b>カレンダー購読 (iCal)</b><small>Googleカレンダーの「URLから追加」に貼り付け</small></div>
        <div class="integration-url"><input class="field" id="icsUrl" readonly placeholder="取得中…"><button class="btn btn-ghost btn-sm" id="icsCopy">コピー</button><button class="btn btn-quiet btn-sm" id="icsRotate">再発行</button></div>
      </div>
      <div class="set-row"><div class="set-label"><b>ホーム画面に追加</b><small>${state.installPrompt ? "インストールできます" : "ブラウザのメニューから追加できます"}</small></div>
        <div class="set-ctl"><button class="btn btn-ghost btn-sm" id="installBtn" ${state.installPrompt ? "" : "disabled"}>インストール</button></div>
      </div>
    </section>

    <section class="card settings-card">
      <h2>${icon("speaker")}音声</h2>
      <p class="desc">読み上げと起動時の挨拶。</p>
      <div class="set-row"><div class="set-label"><b>起動時に声で挨拶する</b></div>
        <div class="set-ctl"><input type="checkbox" class="switch" id="optGreet" ${greetOn ? "checked" : ""}></div>
      </div>
      <div class="set-row"><div class="set-label"><b>返答を読み上げる</b></div>
        <div class="set-ctl"><input type="checkbox" class="switch" id="optRead" ${readOn ? "checked" : ""}></div>
      </div>
      <div class="set-row"><div class="set-label"><b>声を確認</b></div>
        <div class="set-ctl"><button class="btn btn-ghost btn-sm" id="voiceTest">再生</button></div>
      </div>
    </section>

    <section class="card settings-card" style="grid-column:1/-1">
      <h2>${icon("db")}データ</h2>
      <p class="desc">${state.items.length}件をこの端末と同期しています。最終同期: ${state.lastSync ? new Date(state.lastSync).toLocaleString("ja-JP") : "—"}</p>
      <div class="set-row"><div class="set-label"><b>エクスポート</b><small>タスク・メモ・記憶をJSONで書き出す</small></div>
        <div class="set-ctl"><button class="btn btn-ghost btn-sm" id="export">書き出す</button><button class="btn btn-ghost btn-sm" id="refresh">最新に更新</button></div>
      </div>
      <div class="set-row"><div class="set-label"><b>ログアウト</b><small>この端末のログイン状態を解除します</small></div>
        <div class="set-ctl"><button class="btn btn-quiet btn-sm" id="logout">${icon("logout")}ログアウト</button></div>
      </div>
    </section>
  </div>`;

  refreshMemList();
  bindSettings();
  renderSettings._last = true;
  view.scrollTop = keepScroll;
}

function refreshMemList() {
  const el = $("#memList");
  if (!el) return;
  el.innerHTML = state.memory.map(m => `<div class="memrow"><span>${esc(m.text)}</span><button type="button" data-mid="${m.id}" aria-label="削除">${icon("trash")}</button></div>`).join("") || `<div class="sub">まだありません</div>`;
  $$("[data-mid]", el).forEach(b => b.onclick = async () => {
    await sb.from("sec_memory").delete().eq("id", b.dataset.mid);
    loadMemory();
  });
}

function bindSettings() {
  $("#themeSeg")?.querySelectorAll("[data-t]").forEach(b => b.onclick = () => {
    localStorage.setItem(THEME_KEY, b.dataset.t);
    applyTheme();
    renderSettings();
  });
  $$(".swatch").forEach(b => b.onclick = () => {
    localStorage.setItem(ACCENT_KEY, b.dataset.a);
    applyTheme();
    renderSettings();
  });
  $("#densitySeg")?.querySelectorAll("[data-d]").forEach(b => b.onclick = () => {
    localStorage.setItem(DENSITY_KEY, b.dataset.d);
    applyTheme();
    renderSettings();
  });
  $("#optMotion").onchange = e => {
    localStorage.setItem(MOTION_KEY, e.target.checked ? "reduce" : "full");
    applyTheme();
  };
  $("#optAuto").onchange = e => {
    localStorage.setItem("sec_autoplan", e.target.checked ? "1" : "0");
    if (e.target.checked) autoPlan({ manual: true });
    else toast("自動割り当てをオフにしました");
  };
  $("#optAutoscore").onchange = e => {
    localStorage.setItem("sec_autoscore", e.target.checked ? "1" : "0");
    toast(e.target.checked ? "AI推定をオンにしました" : "AI推定をオフにしました");
    if (e.target.checked && unscoredCount()) scoreTasks({ limit: 25 });
  };
  const scoreBtn = $("#scoreNow");
  if (scoreBtn) scoreBtn.onclick = () => scoreTasks({ manual: true }).then(() => { if (state.view === "settings") renderSettings(); });
  $("#optShowStale").onchange = e => {
    localStorage.setItem(STALE_KEY, e.target.checked ? "1" : "0");
    renderApp();
    toast(e.target.checked ? "1ヶ月以上前の期限切れを表示します" : "1ヶ月以上前の期限切れを非表示にしました", 3000);
  };
  $("#capSeg")?.querySelectorAll("[data-cap]").forEach(b => b.onclick = () => {
    localStorage.setItem(CAP_KEY, b.dataset.cap);
    state.capacity = null;
    renderSettings();
    toast(`既定を${fmtMin(parseInt(b.dataset.cap, 10))}にしました`);
  });
  $("#focusSeg")?.querySelectorAll("[data-m]").forEach(b => b.onclick = () => {
    state.focusDefault = parseInt(b.dataset.m, 10);
    localStorage.setItem(FOCUS_KEY, b.dataset.m);
    renderSettings();
  });
  $("#replanBtn").onclick = () => autoPlan({ manual: true });
  $("#aiTest").onclick = async () => {
    const out = $("#aiTestOut");
    if (!out) return;
    out.innerHTML = `<span class="dot busy"></span>確認中…`;
    const r = await askServer("接続テストです。「OK」とだけ返してください。", []);
    if (r.error) out.innerHTML = `失敗: ${esc(r.error)}`;
    else out.innerHTML = `OK — ${esc(r.provider || "")}${r.tried && r.tried.length > 1 ? " / フォールバックあり" : ""}`;
  };
  $("#memAdd").onclick = async () => {
    const t = $("#memNew").value.trim(); if (!t) return;
    const { error } = await sb.from("sec_memory").insert({ text: t });
    if (error) toast(error.message); else { $("#memNew").value = ""; loadMemory(); }
  };
  $("#clearChatBtn").onclick = $("#chatClear").onclick;
  $("#installBtn").onclick = async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    const { outcome } = await state.installPrompt.userChoice;
    if (outcome === "accepted") toast("インストールしました");
    state.installPrompt = null;
  };
  $("#optGreet").onchange = e => localStorage.setItem("sec_voice_greet", e.target.checked ? "1" : "0");
  $("#optRead").onchange = e => {
    localStorage.setItem("sec_voice_read", e.target.checked ? "1" : "0");
    if (e.target.checked) speak("読み上げをオンにしました。");
  };
  $("#voiceTest").onclick = () => speak("こんにちは。秘書です。今日の予定を確認しましょう。");
  $("#refresh").onclick = async () => { await loadAll(); renderSettings(); toast("最新にしました"); };
  $("#export").onclick = exportData;
  $("#logout").onclick = async () => {
    if (CONFIGURED) await sb.auth.signOut();
    else showLock();
  };
  $("#pwChange").onclick = async () => {
    const p = $("#pwNew").value;
    if (p.length < 8) { toast("8文字以上にしてください"); return; }
    const { error } = await sb.auth.updateUser({ password: p });
    if (error) toast(error.message, 4000);
    else { $("#pwNew").value = ""; toast("パスワードを変更しました"); }
  };

  async function gcal(action, extra = {}) {
    const { data, error } = await sb.functions.invoke("gcal", { body: { action, ...extra } });
    if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch {} throw new Error(m); }
    return data;
  }
  function refreshGcalStatus() {
    const out = $("#gcalStatus"); if (!out) return;
    if (PREVIEW) { out.textContent = "接続済み(デモ)"; return; }
    gcal("status").then(r => {
      out.textContent = r.connected ? `接続済み(最終同期: ${r.last_sync ? new Date(r.last_sync).toLocaleString("ja-JP") : "未同期"})` : "未接続";
    }).catch(() => { out.textContent = "状態を取得できませんでした"; });
  }
  $("#gcalConnect").onclick = async () => {
    if (PREVIEW) { toast("プレビューでは連携できません"); return; }
    try { const r = await gcal("auth_url", { state: location.origin + location.pathname }); location.href = r.url; }
    catch (e) { toast("連携URLの取得に失敗: " + e.message, 4000); }
  };
  $("#gcalSync").onclick = async () => {
    const out = $("#gcalStatus");
    if (PREVIEW) { toast("プレビューでは同期しません"); return; }
    out.textContent = "同期中…";
    try {
      const r = await gcal("sync");
      out.textContent = `接続済み(作成${r.created}件・更新${r.updated}件 / ${new Date(r.synced_at).toLocaleString("ja-JP")})`;
      toast("Googleカレンダーへ同期しました");
    } catch (e) { out.textContent = "同期失敗: " + e.message; toast("同期に失敗しました", 3000); }
  };
  $("#gcalDisc").onclick = async () => {
    if (PREVIEW) return;
    try { await gcal("disconnect"); toast("連携を解除しました"); refreshGcalStatus(); }
    catch (e) { toast(e.message, 4000); }
  };
  refreshGcalStatus();
  (async () => {
    const el = $("#icsUrl"); if (!el) return;
    if (PREVIEW) { el.value = "https://example.supabase.co/functions/v1/ics?token=demo"; return; }
    let { data } = await sb.from("sec_ics_tokens").select("token").single();
    if (!data?.token) {
      const r = await sb.functions.invoke("ics", { body: { action: "rotate" } });
      if (!r.error) data = { token: r.data.token };
    }
    el.value = data?.token ? `${SUPABASE_URL}/functions/v1/ics?token=${data.token}` : "(取得失敗 — 再発行してください)";
  })();
  $("#icsCopy").onclick = async () => {
    const el = $("#icsUrl");
    try { await navigator.clipboard.writeText(el.value); toast("コピーしました"); }
    catch { el.select(); document.execCommand("copy"); toast("コピーしました"); }
  };
  $("#icsRotate").onclick = async () => {
    if (PREVIEW) { toast("プレビューでは再発行しません"); return; }
    try {
      const { data, error } = await sb.functions.invoke("ics", { body: { action: "rotate" } });
      if (error) throw new Error((await error.context.json().catch(() => ({}))).error || error.message);
      $("#icsUrl").value = `${SUPABASE_URL}/functions/v1/ics?token=${data.token}`;
      toast("フィードURLを再発行しました(カレンダー側も張り替えてください)", 5000);
    } catch (e) { toast("再発行に失敗: " + e.message, 4000); }
  };
}

/* ---------------------------------------------------------------------------
   18. PWA / ネットワーク
--------------------------------------------------------------------------- */
function updateNet(notify = false) {
  const on = navigator.onLine;
  $("#netbar").classList.toggle("on", !on);
  app.classList.toggle("offline", !on);
  if (!state.sending) setAI(on ? "idle" : "off");
  if (notify && on) { toast("オンラインに戻りました"); if (state.userEmail) loadAll(); }
}
addEventListener("online", () => updateNet(true));
addEventListener("offline", () => updateNet(true));
addEventListener("beforeinstallprompt", e => { e.preventDefault(); state.installPrompt = e; if (state.view === "settings") renderSettings(); });
addEventListener("appinstalled", () => { state.installPrompt = null; toast("インストールしました"); });
if ("serviceWorker" in navigator && !PREVIEW && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
if (PREVIEW && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
}

/* ---------------------------------------------------------------------------
   19. グローバル操作
--------------------------------------------------------------------------- */
$("#themeBtn").onclick = cycleTheme;
$("#searchBtn").onclick = openPalette;
function newForCurrentView() {
  if (state.view === "projects") {
    if (state.projectsMissing) { toast("先に supabase/phase3.sql を実行してください", 4500); return; }
    if (state.projectsError) { toast("プロジェクトを読み込めていません", 3000); return; }
    const p = state.projectId ? state.projects.find(x => x.id === state.projectId) : null;
    openProjectEditor(p || { kind: "EE" });
    return;
  }
  if (state.view === "notes") { openEditor({ kind: "note" }); return; }
  openEditor({ kind: "task" });
}
$("#newBtn").onclick = newForCurrentView;
$("#backBtn").onclick = () => { state.projectId = null; renderApp(); view.scrollTop = 0; };
$("#chatToggle").onclick = () => {
  app.dataset.chat = app.dataset.chat === "off" ? "on" : "off";
  if (app.dataset.chat === "on") setTimeout(() => $("#q").focus(), 60);
};
$("#sideUser").onclick = () => setView("settings");
$("#palList").addEventListener("click", () => {});
$("#palette").addEventListener("close", () => { $("#palQ").value = ""; });

addEventListener("keydown", e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if (typing) return;
  if (e.key === "/") { e.preventDefault(); openPalette(); return; }
  if (e.key === "n" || e.key === "N") { e.preventDefault(); newForCurrentView(); return; }
  if (e.key === "Escape") {
    if ($("#palette").open) $("#palette").close();
    else if (!focusHidden()) finishFocus();
  }
});
function focusHidden() { return $("#focus").hidden; }

addEventListener("resize", () => {
  if (!isWide() && state.view === "chat") { /* keep */ }
  if (isWide() && state.view === "chat") { state.view = state.listView; app.dataset.view = state.view; renderApp(); }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.userEmail) loadAll();
});

/* ---------------------------------------------------------------------------
   20. 起動
--------------------------------------------------------------------------- */
applyTheme();
renderNav();
renderChatHistory();
setAI(navigator.onLine ? "idle" : "off");
updateNet(false);
autosize();
state.view = "today";
renderApp();
updateIdentity();
if (PREVIEW) {
  setTimeout(() => { renderApp(); showPrompts(); }, 60);
}
if (new URLSearchParams(location.search).get("gcal") === "connected") {
  toast("Googleカレンダーと連携しました。「同期」で予定を書き出せます", 5000);
  history.replaceState(null, "", location.pathname);
}

/* デバッグ用(コンソールから状態を確認) */
window.__aiSecretary = { state, sb, loadAll, autoPlan, parseQuick, nextTask, todayCandidates, taskScore, taskReasons, freeMinutesNow, scoreTasks, plannedForDay, unscoredCount };
})();
