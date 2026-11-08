/* ============================================================================
   AI秘書 v2 — application
   ========================================================================== */
(() => {
"use strict";

/* ---------------------------------------------------------------------------
   0. 設定
--------------------------------------------------------------------------- */
const SUPABASE_URL = "https://pjlccscmpatxyaqcsipy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqbGNjc2NtcGF0eHlhcWNzaXB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3ODU3MDMsImV4cCI6MjEwOTM2MTcwM30.zKEG_edtbEq_73CoY6q6MpZdEtyfN2TLTdU_biRCok0";
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
  items: [], memory: [], userEmail: "",
  view: "today", listView: "today",
  taskFilter: "open", noteQuery: "", taskQuery: "", category: "",
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
      state.items = []; state.memory = [];
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
    }));
  } catch {}
}
function cacheLoad() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!c || !Array.isArray(c.items)) return false;
    state.items = c.items; state.memory = c.memory || [];
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
    id: "mb_" + t.task_id, mb: true, kind: "task", title: t.title,
    due: t.due_iso, category: t.class_name || "ManageBac", est_minutes: null,
    done: ["Submitted", "Complete", "Excused"].includes(t.status),
    body: t.detail || "", url: t.url, mb_status: t.status || "", submittable: !!t.submittable,
    created_at: t.fetched_at, updated_at: t.fetched_at,
  }));
  state.items = [...(data || []), ...mbRows];
  cacheSave();
  renderApp();
  updateIdentity();
  const open = state.items.filter(i => i.kind === "task" && !i.done && !i.mb);
  if (open.length && localStorage.getItem("sec_autoplan") !== "0") {
    setTimeout(() => autoPlan({ silent: true }), 600);
  }
}
async function loadMemory() {
  const { data } = await sb.from("sec_memory").select("*").order("created_at");
  state.memory = data || [];
  if (state.view === "settings") refreshMemList();
}
async function loadAll() { await Promise.all([loadItems(), loadMemory()]); }

function subscribe() {
  if (chan || PREVIEW) return;
  chan = sb.channel("sec")
    .on("postgres_changes", { event: "*", schema: "public", table: "sec_items" }, () => loadItems())
    .on("postgres_changes", { event: "*", schema: "public", table: "sec_memory" }, () => loadMemory())
    .on("postgres_changes", { event: "*", schema: "public", table: "managebac_tasks" }, () => loadItems())
    .subscribe();
}

/* ---------------------------------------------------------------------------
   6. 計画エンジン
--------------------------------------------------------------------------- */
const PLAN_DAYS = 10;

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
  return (w === 0 || w === 6) ? [[9 * 60, 12 * 60], [13 * 60, 18 * 60]] : [[16 * 60, 22 * 60]];
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
    if (s < b.e) s = b.e + 10;
  }
  return s + est <= to ? s : null;
}
function plannedToday() {
  const s = startOfDay(), e = endOfDay();
  return state.items
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

async function autoPlan({ manual = false, silent = false } = {}) {
  if (state.planning || !state.loaded) return;
  if (!manual && Date.now() - state.planAt < 10 * 60 * 1000) return;
  const open = state.items.filter(i => i.kind === "task" && !i.done && !i.mb);
  if (!open.length) { if (manual) toast("計画するタスクがありません"); return; }
  if (state.items.length && !("scheduled_start" in state.items[0])) {
    if (manual) toast("先に supabase/phase2.sql を実行してください", 4500);
    return;
  }
  state.planning = true;
  state.planAt = Date.now();
  const factors = estFactorMap();
  const today = startOfDay();
  const ordered = [...open].sort((a, b) => {
    const ad = a.due ? new Date(a.due) : null, bd = b.due ? new Date(b.due) : null;
    if (ad && bd && +ad !== +bd) return ad - bd;
    if (!!ad !== !!bd) return ad ? -1 : 1;
    if ((a.priority || 0) !== (b.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    return (b.est_minutes || 30) - (a.est_minutes || 30);
  });

  const days = new Map();
  const plan = [];
  const now = new Date();

  for (const t of ordered) {
    const f = factors[(t.category || "").trim()] || 1;
    const est = clamp(Math.round((t.est_minutes || 30) * f), 10, 240);
    const due = t.due ? new Date(t.due) : null;
    const duePast = due && due < now;
    const lastDay = due && !duePast ? startOfDay(due) : addDays(today, 7);
    let placed = null;
    for (let d = 0; d < PLAN_DAYS; d++) {
      const day = addDays(today, d);
      if (day > lastDay) break;
      const key = ymd(day);
      let st = days.get(key);
      if (!st) { st = { used: 0, blocks: [] }; days.set(key, st); }
      if (st.used + est > planCap(day) || st.blocks.length >= 4) continue;
      for (const [ws, we] of planWindows(day)) {
        let from = ws, to = we;
        if (sameDay(day, now)) from = Math.max(from, now.getHours() * 60 + now.getMinutes() + 15);
        if (due && !duePast && sameDay(day, due)) to = Math.min(to, due.getHours() * 60 + due.getMinutes() - 5);
        if (to - from < Math.min(est, 20)) continue;
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
      ${icon(n.icon)}<span>${n.label}</span>
      ${["today", "tasks"].includes(n.v) ? `<i class="badge" data-badge="${n.v}" hidden></i>` : ""}
    </button>`).join("");
  $$("[data-view]").forEach(b => {
    if (b.closest("#sideNav") || b.closest("#tabbar")) b.onclick = () => setView(b.dataset.view);
  });
  updateBadges();
}
function updateBadges() {
  const open = state.items.filter(i => i.kind === "task" && !i.done);
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
  const open = state.items.filter(i => i.kind === "task" && !i.done).length;
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
  const titles = {
    today: ["今日", todaySub],
    tasks: ["タスク", `${state.items.filter(i => i.kind === "task" && !i.done).length}件 未完了`],
    notes: ["メモ", `${state.items.filter(i => i.kind === "note").length}件`],
    settings: ["設定", "表示と動作の設定"],
    chat: ["秘書", "承認制アシスタント"],
  };
  const t = titles[state.view] || titles.today;
  $("#pageTitle").textContent = t[0];
  $("#pageSub").textContent = t[1];
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
  const tasks = state.items.filter(i => i.kind === "task");
  const due = tasks.filter(i => i.due && new Date(i.due) >= s && new Date(i.due) <= e);
  const done = due.filter(i => i.done).length;
  const overdue = tasks.filter(i => !i.done && i.due && new Date(i.due) < s).length;
  const leftMin = due.filter(i => !i.done).reduce((a, i) => a + (i.est_minutes || 0), 0);
  return { done, total: due.length, overdue, leftMin, pct: due.length ? Math.round(done / due.length * 100) : 0 };
}
function nextTask() {
  const now = new Date();
  const planned = plannedToday().filter(i => !i.done);
  const live = planned.find(i => {
    const s = new Date(i.scheduled_start);
    const e = i.scheduled_end ? new Date(i.scheduled_end) : new Date(s.getTime() + (i.est_minutes || 30) * 60000);
    return s <= now && now < e;
  });
  if (live) return { item: live, live: true };
  const next = planned.find(i => new Date(i.scheduled_start) > now);
  if (next) return { item: next, live: false };
  const s = startOfDay(), e = endOfDay();
  const dueToday = state.items.filter(i => i.kind === "task" && !i.done && i.due &&
    new Date(i.due) >= s && new Date(i.due) <= e && !plannedToday().some(p => p.id === i.id));
  if (dueToday.length) return { item: dueToday.sort((a, b) => new Date(a.due) - new Date(b.due))[0], unscheduled: true };
  const over = state.items.filter(i => i.kind === "task" && !i.done && i.due && new Date(i.due) < s);
  if (over.length) return { item: over.sort((a, b) => new Date(a.due) - new Date(b.due))[0], overdue: true };
  return { item: null };
}
function nextHTML() {
  const n = nextTask();
  if (!n.item) {
    return `<section class="next"><div class="next-top"><span class="next-label"><i></i>NEXT UP</span></div>
      <div class="next-empty"><div><h2>${state.items.some(i => i.kind === "task" && !i.done) ? "今日はここまで" : "今日の予定はまだありません"}</h2><p>${state.items.some(i => i.kind === "task" && !i.done) ? "残りのタスクはありません。おつかれさまでした。" : "下の入力から追加するか、秘書に相談してみてください。"}</p></div></div>
      <div class="next-acts"><button class="btn btn-ghost btn-block" data-act="new-note">メモを残す</button></div></section>`;
  }
  const it = n.item;
  const start = it.scheduled_start ? new Date(it.scheduled_start) : null;
  const end = it.scheduled_end ? new Date(it.scheduled_end) : start ? new Date(start.getTime() + (it.est_minutes || 30) * 60000) : null;
  const minsTo = start ? Math.round((start - new Date()) / 60000) : null;
  let count = "";
  if (n.live) count = "進行中";
  else if (minsTo != null && minsTo > 0) count = minsTo < 60 ? `あと${minsTo}分` : `あと${fmtMin(minsTo)}`;
  else if (n.overdue) count = "期限切れ";
  else if (n.unscheduled) count = "時間未定";
  const sub = [it.category, it.est_minutes ? `${it.est_minutes}分` : "", it.mb ? "ManageBac" : ""].filter(Boolean).map(esc).join(" · ");
  return `<section class="next">
    <div class="next-top"><span class="next-label"><i></i>NEXT UP</span><span class="next-count num">${esc(count)}</span></div>
    <div class="next-main">
      <div class="next-time">${start ? fmtClock(start).replace(":", "<small>:</small>") : "--<small>:</small>--"}</div>
      <div class="next-info"><h2>${esc(it.title)}</h2><p>${start ? `${fmtClock(start)} – ${fmtClock(end)}` : ""}${sub ? ` · ${sub}` : ""}</p></div>
    </div>
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
    const meta = [it.category, `${dur}分`];
    if (live) meta.push("進行中");
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
  const total = list.reduce((a, i) => {
    const s0 = new Date(i.scheduled_start);
    const e0 = i.scheduled_end ? new Date(i.scheduled_end) : new Date(s0.getTime() + (i.est_minutes || 30) * 60000);
    return a + Math.round((e0 - s0) / 60000);
  }, 0);
  return `<section class="timeline">
    <div class="tl-head"><b>タイムライン</b><span>${list.length ? `${list.length}件 · ${fmtMin(total)}` : "未計画"}</span>
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
  const planned = plannedToday().reduce((a, i) => {
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
    ${capacityHTML()}
    ${timelineHTML()}
    ${groupsHTML(state.items)}
    ${!state.items.length ? emptyHTML("今日はまだ何もありません", "下の入力からタスクを追加するか、秘書に話しかけてください。", `<button class="btn btn-primary" data-act="focus-quick">${icon("plus")}タスクを追加</button>`, "sun") : ""}
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
  let rows = state.items.filter(i => i.kind === "task" && matchQuery(i, state.taskQuery));
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
  const cats = [...new Set(state.items.filter(i => i.kind === "task").map(i => i.category).filter(Boolean))].slice(0, 12);
  return `<div class="toolbar">
      <div class="searchbox">${icon("search")}<input id="taskSearch" type="search" placeholder="タスクを検索" value="${esc(state.taskQuery)}" aria-label="タスクを検索"><button class="clear" data-act="clear-search" aria-label="検索をクリア">${icon("close")}</button></div>
      <div class="seg" id="taskFilter">${[["open", "未完了"], ["done", "完了"], ["all", "すべて"]].map(([k, l]) => `<button type="button" data-f="${k}" class="${state.taskFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
    </div>
    ${cats.length ? `<div class="filter-row" style="margin-bottom:12px"><button class="chip ${!state.category ? "on" : ""}" data-act="cat" data-cat="">すべて</button>${cats.map(c => `<button class="chip ${state.category === c ? "on" : ""}" data-act="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
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
    area.innerHTML = rows.length
      ? rows.map(rowHTML).join("")
      : emptyHTML(
          state.taskQuery.trim() ? "見つかりません" : state.taskFilter === "done" ? "完了したタスクはありません" : "タスクはありません",
          state.taskQuery.trim() ? `「${esc(state.taskQuery.trim())}」に一致するタスクはありません。` : "上の入力から追加できます。",
          state.taskQuery.trim() ? `<button class="btn btn-ghost" data-act="clear-search">検索をクリア</button>` : `<button class="btn btn-ghost" data-act="focus-quick">タスクを追加</button>`,
          state.taskQuery.trim() ? "search" : "check");
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
    const s = $("#taskSearch");
    if (s) s.addEventListener("input", () => { state.taskQuery = s.value; renderListArea(); });
    $$("#taskFilter [data-f]").forEach(b => b.onclick = () => {
      state.taskFilter = b.dataset.f;
      $$("#taskFilter [data-f]").forEach(x => x.classList.toggle("on", x === b));
      renderListArea();
    });
  }
  if (state.view === "notes") {
    const s = $("#noteSearch");
    if (s) s.addEventListener("input", () => { state.noteQuery = s.value; renderListArea(); });
  }
  if (state.view === "tasks" || state.view === "notes") renderListArea();
}
view.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
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
    { id: "today", label: "今日へ移動", icon: "today", run: () => setView("today") },
    { id: "tasks", label: "タスクへ移動", icon: "tasks", run: () => setView("tasks") },
    { id: "notes", label: "メモへ移動", icon: "notes", run: () => setView("notes") },
    { id: "settings", label: "設定を開く", icon: "settings", run: () => setView("settings") },
    { id: "focus", label: "集中モードをはじめる", icon: "play", run: () => startFocus(nextTask().item) },
    { id: "replan", label: "計画を組み直す", icon: "refresh", run: () => autoPlan({ manual: true }) },
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
  const items = state.items
    .filter(i => q && matchQuery(i, q))
    .slice(0, 8);
  const list = [];
  if (actions.length) {
    list.push(`<div class="pal-group">コマンド</div>`);
    actions.forEach(a => list.push(`<button type="button" class="pal-item" data-type="act" data-id="${a.id}">${icon(a.icon)}<span>${esc(a.label)}</span>${a.hint ? `<span class="pal-sub"><kbd>${a.hint}</kbd></span>` : ""}</button>`));
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
  const overdue = state.items.filter(i => i.kind === "task" && !i.done && i.due && new Date(i.due) < new Date()).length;
  return { done: done.length, focusMin, overdue, created: state.items.filter(i => i.kind === "task" && i.created_at && new Date(i.created_at) >= start).length };
}
function renderSettings() {
  const keepScroll = renderSettings._last ? view.scrollTop : 0;
  view.classList.add("narrow");
  const open = state.items.filter(i => i.kind === "task" && !i.done).length;
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
$("#newBtn").onclick = () => openEditor({ kind: "task" });
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
  if (e.key === "n" || e.key === "N") { e.preventDefault(); openEditor({ kind: "task" }); return; }
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
window.__aiSecretary = { state, sb, loadAll, autoPlan, parseQuick };
})();
