// ============================================================================
// ai — AIルーター Edge Function (仕様書 v1 §2, §4.2, §6)
// フロントエンド(app/index_1.html)の askServer() との契約:
//
//   Request : { message, history:[{role,content}], tz, now, purpose? }
//   Response: { text, provider, tried:[{provider,ok}], proposals:[{tool,args}] }
//             または { error }
//
//   proposals の tool 名と args はフロントの describe()/applyProposal() に直結する:
//     propose_add_task      { title, due, est_minutes, category, notes }
//     propose_add_note      { title, body, category }
//     propose_update_item   { id, title?, body?, category?, est_minutes?, due? }
//     propose_complete_task { id, actual_min? }
//     propose_delete_item   { id }
//     propose_memory        { text }
//
// ルール(仕様書):
//   - チャット/計画: Gemini → NIM → Hermes(オンライン時)。hint は NIM → Gemini
//   - 429/タイムアウトは同一提供元を2回再試行、失敗続きで10分クールダウン
//   - list_items/list_memory は即実行(ai_hidden=true は返さない)
//   - 書き込みは propose_* の提案のみ。適用はアプリが承認後に行う
//   - 全呼び出しを sec_ai_log に記録
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
// モデルは候補リストで持ち、404/退役なら次の候補へフォールバックする。
// 2026年時点で gemini-2.x は退役しているため latest エイリアスを既定にする。
// GEMINI_MODEL を設定した場合は先頭になる。GEMINI_MODELS でカンマ区切りに候補追加可。
const GEMINI_MODELS = [
  ...(Deno.env.get("GEMINI_MODEL") ? [Deno.env.get("GEMINI_MODEL")!] : []),
  ...(Deno.env.get("GEMINI_MODELS") ?? "gemini-flash-latest,gemini-pro-latest").split(","),
].map((s) => s.trim()).filter(Boolean);
const NIM_API_KEY = Deno.env.get("NIM_API_KEY") ?? Deno.env.get("NVIDIA_API_KEY") ?? "";
const NIM_BASE = (Deno.env.get("NIM_BASE") ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
// integrate.api.nvidia.com/v1/models で現存確認済みの候補
// (NIM_MODEL を設定した場合は先頭。NIM_MODELS でカンマ区切りに追加可)
const NIM_MODELS = [
  ...(Deno.env.get("NIM_MODEL") ? [Deno.env.get("NIM_MODEL")!] : []),
  ...(Deno.env.get("NIM_MODELS") ?? [
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "nvidia/nemotron-4-340b-instruct",
    "mistralai/mistral-large-4-1t-a52b",
    "deepseek-ai/deepseek-v4.1-flash",
  ].join(",")).split(","),
].map((s) => s.trim()).filter(Boolean);

const CALL_TIMEOUT_MS = 25_000;
const MAX_ROUNDS = 6;
const PROVIDER_COOLDOWN_MS = 10 * 60_000;

const cooldownUntil = new Map<string, number>();
const inCooldown = (p: string) => Date.now() < (cooldownUntil.get(p) ?? 0);
const markCooldown = (p: string) => cooldownUntil.set(p, Date.now() + PROVIDER_COOLDOWN_MS);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Msg = { role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string; name?: string };
type ToolCall = { id: string; name: string; args: Record<string, unknown> };
type ProviderResult = { text: string; toolCalls: ToolCall[] };
type Tried = { provider: string; ok: boolean };

// ---------- ツール定義(フロントエンドの applyProposal と名前を一致させる) ----------
const TOOLS: { name: string; description: string; args: Record<string, string> }[] = [
  { name: "list_items", description: "タスク/メモを読む。ai_hidden(AI非公開)の行は含まれない。計画・要約・進捗確認では必ず先にこれを呼ぶ。", args: { kind: "'task'|'note'|省略で全部", include_done: "boolean 省略で未完了のみ" } },
  { name: "list_memory", description: "保存済みの記憶を読む。", args: {} },
  { name: "list_mb_tasks", description: "ManageBacから取り込んだ課題(managebac_tasks)を読む。今日の計画にはこれも含める。", args: { only_open: "boolean 省略で未完了のみ(Submitted/Complete系は除外)" } },
  { name: "propose_add_task", description: "タスク追加の提案(承認されるまで追加しない)", args: { title: "string 必須", due: "ISO8601|null", est_minutes: "number|null 見積り分", category: "string", notes: "string" } },
  { name: "propose_add_note", description: "メモ追加の提案", args: { title: "string 必須", body: "string", category: "string" } },
  { name: "propose_update_item", description: "既存タスク/メモの更新提案", args: { id: "string 必須", title: "string?", body: "string?", category: "string?", est_minutes: "number?", due: "ISO8601?" } },
  { name: "propose_complete_task", description: "タスク完了の提案", args: { id: "string 必須", actual_min: "number? 実績分(見積り学習用)" } },
  { name: "propose_delete_item", description: "削除の提案", args: { id: "string 必須" } },
  { name: "propose_memory", description: "記憶に保存する提案", args: { text: "string 必須" } },
  { name: "propose_schedule", description: "タスクの「いつやるか」の割り当て提案。承認で scheduled_start/scheduled_end が設定される。", args: { id: "string 必須", scheduled_start: "ISO8601 必須", scheduled_end: "ISO8601 必須" } },
  { name: "propose_estimate", description: "est_minutes が無いタスクへの完了時間(分)の推定提案。承認で est_minutes に入る。", args: { id: "string 必須", est_minutes: "number 必須", reason: "string 推定理由" } },
];

const SYSTEM_PROMPT = `あなたはユーザー専属のAI秘書です。日本語で簡潔に答えます。
ルール:
- タスク/メモについて答える前に、必ず list_items / list_memory で実データを読んでから答えること。
- 追加・更新・完了・削除・記憶の保存は propose_* ツールで「提案」だけを出すこと。適用はユーザーの承認後にアプリが行う。
- list_items には ai_hidden(AI非公開)の項目は含まれない。見えないデータがある前提で勝手な推測をしないこと。
- 今日の計画の相談では、list_items と list_mb_tasks の両方を読み、期限・est_minutes・scheduled_start を踏まえて具体的に答えること。
- est_minutes が無いタスクは、種別・内容・過去の実績から完了時間を推定し、propose_estimate で提案すること。
- 「いつやるか」の割り当ては propose_schedule で scheduled_start/scheduled_end を提案すること(承認後にタイムラインへ反映される)。
- EE/IA/TOKなどの本文の代筆はしない。構成案・論点・質問・次の一歩までにすること。`;

// ---------- Supabase ----------
function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function logAi(o: { userId: string | null; provider: string; purpose: string; ok: boolean; error?: string; detail?: unknown }) {
  try {
    await serviceClient().from("sec_ai_log").insert({
      user_id: o.userId, provider: o.provider, purpose: o.purpose,
      ok: o.ok, error: o.error ?? null, detail: o.detail ?? null,
    });
  } catch { /* ログ失敗で本体を落とさない */ }
}

// ---------- プロバイダ ----------
function toolParams(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const t of TOOLS) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t.args)) {
      const type = k === "est_minutes" || k === "actual_min" ? "number" : k === "include_done" ? "boolean" : "string";
      props[k] = { type, description: v };
    }
    out[t.name] = { type: "object", properties: props };
  }
  return out;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), CALL_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}

// モデルが存在しない系のエラー(404やメッセージ中の not found)を検出して次候補へ回す
function isModelDead(code: number | undefined, msg: string): boolean {
  if (code === 404) return true;
  return /not found|does not exist|is not found|unknown model|invalid model|model.*(not|no longer)|retired/i.test(msg);
}

async function callGemini(messages: Msg[], model: string): Promise<ProviderResult> {
  const sys = messages.find((m) => m.role === "system")?.content ?? SYSTEM_PROMPT;
  const contents = [];
  for (const m of messages.filter((x) => x.role !== "system")) {
    if (m.role === "tool") {
      // ツール結果 → functionResponse
      contents.push({ role: "user", parts: [{ functionResponse: { name: m.name, response: { result: (m.content || "").slice(0, 4000) } } }] });
    } else if (m.role === "assistant") {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of (m.tool_calls as ToolCall[] | undefined) ?? []) {
        parts.push({ functionCall: { name: c.name, args: c.args } });
      }
      contents.push({ role: "model", parts });
    } else {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    }
  }
  const r = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents,
        tools: [{ functionDeclarations: TOOLS.map((t) => ({
          name: t.name, description: t.description, parameters: toolParams()[t.name],
        })) }],
      }),
    });
  if (r.status === 429) throw Object.assign(new Error("gemini 429"), { code: 429 });
  if (!r.ok) {
    const body = (await r.text()).slice(0, 300);
    throw Object.assign(new Error(`gemini ${r.status} [${model}]: ${body}`), { code: r.status, modelDead: isModelDead(r.status, body) });
  }
  const j = await r.json();
  const c = j.candidates?.[0]?.content ?? {};
  const text = (c.parts ?? []).filter((p: { text?: string }) => p.text).map((p: { text: string }) => p.text).join("\n");
  const toolCalls: ToolCall[] = (c.parts ?? [])
    .filter((p: { functionCall?: { name: string; args: Record<string, unknown> } }) => p.functionCall)
    .map((p: { functionCall: { name: string; args: Record<string, unknown> } }, i: number) => ({
      id: `g${Date.now()}_${i}`, name: p.functionCall.name, args: p.functionCall.args ?? {},
    }));
  return { text, toolCalls };
}

async function callNIM(messages: Msg[], model: string): Promise<ProviderResult> {
  const r = await fetchWithTimeout(`${NIM_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${NIM_API_KEY}` },
    body: JSON.stringify({
      model,
      messages,
      tools: TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: toolParams()[t.name] } })),
      tool_choice: "auto",
    }),
  });
  if (r.status === 429) throw Object.assign(new Error("nim 429"), { code: 429 });
  if (!r.ok) {
    const body = (await r.text()).slice(0, 300);
    throw Object.assign(new Error(`nim ${r.status} [${model}]: ${body}`), { code: r.status, modelDead: isModelDead(r.status, body) });
  }
  const j = await r.json();
  const m = j.choices?.[0]?.message ?? {};
  const toolCalls: ToolCall[] = (m.tool_calls ?? []).map((c: { id: string; function: { name: string; arguments: string } }) => ({
    id: c.id ?? `n${Date.now()}`, name: c.function.name, args: safeJson(c.function.arguments),
  }));
  return { text: m.content ?? "", toolCalls };
}

// Hermes: ジョブ表に書いて結果を待つ(オンライン時のみ)
async function callHermes(userId: string, purpose: string, lastUser: string): Promise<ProviderResult | null> {
  const sb = serviceClient();
  const { data: job, error } = await sb.from("sec_hermes_jobs").insert({
    user_id: userId, kind: "free", payload: { purpose, prompt: lastUser.slice(-4000) }, status: "pending",
  }).select("id").single();
  if (error || !job) return null;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const { data } = await sb.from("sec_hermes_jobs").select("status,result").eq("id", job.id).single();
    if (data?.status === "done") {
      const text = typeof data.result === "string" ? data.result : JSON.stringify(data.result);
      return { text, toolCalls: [] };
    }
    if (data?.status === "failed") return null;
  }
  return null;
}

// ---------- ツール実行 ----------
async function runTool(sb: ReturnType<typeof serviceClient>, userId: string, call: ToolCall, proposals: { tool: string; args: Record<string, unknown> }[]): Promise<string> {
  switch (call.name) {
    case "list_items": {
      const kind = (call.args.kind as string) || undefined;
      const includeDone = Boolean(call.args.include_done);
      let q = sb.from("sec_items")
        .select("id,kind,title,body,due,category,est_minutes,actual_min,done,done_at,priority,scheduled_start,scheduled_end")
        .eq("user_id", userId).eq("ai_hidden", false)
        .order("due", { ascending: true, nullsFirst: false });
      if (kind === "task" || kind === "note") q = q.eq("kind", kind);
      if (!includeDone) q = q.eq("done", false);
      const { data, error } = await q.limit(200);
      if (error) return `error: ${error.message}`;
      return JSON.stringify(data ?? []);
    }
    case "list_memory": {
      const { data, error } = await sb.from("sec_memory").select("id,text,created_at").eq("user_id", userId).order("created_at");
      if (error) return `error: ${error.message}`;
      return JSON.stringify(data ?? []);
    }
    case "list_mb_tasks": {
      const onlyOpen = call.args.only_open !== false;
      let q = sb.from("managebac_tasks")
        .select("task_id,class_name,title,kind,status,submittable,due,due_iso,detail,url,fetched_at,gcal_event_id")
        .order("due_iso", { ascending: true, nullsFirst: false });
      if (onlyOpen) q = q.not("status", "in", '("Submitted","Complete","Excused")');
      const { data, error } = await q.limit(100);
      if (error) return `error: ${error.message}`;
      return JSON.stringify(data ?? []);
    }
    default: {
      if (call.name.startsWith("propose_")) {
        proposals.push({ tool: call.name, args: call.args });
        return "提案カードを作成しました。ユーザーの承認後にアプリが適用します。";
      }
      return `unknown tool: ${call.name}`;
    }
  }
}

// ---------- ルーター ----------
// モデル候補を順に試し、404/退役なら次のモデルへ。全滅したら次の提供元へ。
async function callWithModels(p: "gemini" | "nim", models: string[], messages: Msg[], tried: Tried[]): Promise<ProviderResult | null> {
  for (const model of models) {
    try {
      const r = p === "gemini" ? await callGemini(messages, model) : await callNIM(messages, model);
      tried.push({ provider: `${p}:${model}`, ok: true });
      return r;
    } catch (e) {
      const modelDead = Boolean((e as { modelDead?: boolean }).modelDead);
      tried.push({ provider: `${p}:${model}`, ok: false });
      if (modelDead) continue; // 次のモデル候補へ
      throw e; // 429/タイムアウトなどは提供元の再試行へ
    }
  }
  return null;
}

async function callProvider(p: string, messages: Msg[], userId: string, purpose: string, tried: Tried[]): Promise<ProviderResult | null> {
  if (p === "gemini" && GEMINI_API_KEY) return await callWithModels("gemini", GEMINI_MODELS, messages, tried);
  if (p === "nim" && NIM_API_KEY) return await callWithModels("nim", NIM_MODELS, messages, tried);
  if (p === "hermes") {
    const lastUser = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n");
    return await callHermes(userId, purpose, lastUser);
  }
  return null; // キー未設定
}

async function route(purpose: string, messages: Msg[], userId: string, tried: Tried[]): Promise<{ provider: string; result: ProviderResult } | null> {
  const order = purpose === "hint" ? ["nim", "gemini"] : ["gemini", "nim", "hermes"];
  for (const p of order) {
    if (inCooldown(p)) { tried.push({ provider: p, ok: false }); continue; }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await callProvider(p, messages, userId, purpose, tried);
        if (r) return { provider: p, result: r };
        break; // キー未設定/全モデル退役/Hermesオフライン → 次へ
      } catch (e) {
        const code = (e as { code?: number }).code;
        tried.push({ provider: p, ok: false });
        if (code === 429 || (e as Error).name === "AbortError") {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        break;
      }
    }
    markCooldown(p); // 失敗が続いた提供元は10分休ませる
  }
  return null;
}

// ---------- ハンドラ ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method === "GET") {
    const u = new URL(req.url);
    // 診断: 実際に使えるモデル一覧をプロバイダから取得 (キーがあれば)
    if (u.searchParams.get("action") === "models") {
      const out: Record<string, unknown> = { candidates: { gemini: GEMINI_MODELS, nim: NIM_MODELS } };
      try {
        const r = await fetch(`${NIM_BASE}/models`, { headers: { Authorization: `Bearer ${NIM_API_KEY}` } });
        if (r.ok) out.nim_live = (await r.json()).data.map((m: { id: string }) => m.id);
      } catch { /* 無視 */ }
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}&pageSize=200`);
        if (r.ok) out.gemini_live = (await r.json()).models.map((m: { name: string }) => m.name.replace("models/", ""));
      } catch { /* 無視 */ }
      return Response.json(out, { headers: cors });
    }
    return Response.json({ ok: true, providers: { gemini: !!GEMINI_API_KEY, nim: !!NIM_API_KEY }, models: { gemini: GEMINI_MODELS, nim: NIM_MODELS } }, { headers: cors });
  }

  const tried: Tried[] = [];
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      await logAi({ userId: null, provider: "-", purpose: "auth", ok: false, error: authErr?.message });
      const bearer = (auth.split(" ")[1] ?? "");
      const hint = bearer === SUPABASE_ANON_KEY
        ? "not signed in: anon key only (アプリでログインしてから呼んでください)"
        : `unauthorized: ${authErr?.message ?? "invalid token"}`;
      return Response.json({ error: hint }, { status: 401, headers: cors });
    }

    const body = await req.json();
    const purpose: string = body.purpose ?? "chat";
    const nowCtx = [body.now, body.tz ? `タイムゾーン: ${body.tz}` : ""].filter(Boolean).join(" / ");
    const history: Msg[] = Array.isArray(body.history) ? body.history : [];
    const messages: Msg[] = [
      { role: "system", content: SYSTEM_PROMPT + (nowCtx ? `\n現在時刻: ${nowCtx}` : "") },
      ...history,
      { role: "user", content: String(body.message ?? "") },
    ];

    const sb = serviceClient();
    const proposals: { tool: string; args: Record<string, unknown> }[] = [];

    const routed = await route(purpose, messages, user.id, tried);
    if (!routed) {
      await logAi({ userId: user.id, provider: "-", purpose, ok: false, error: "all providers unavailable" });
      return Response.json({ error: "all AI providers unavailable (キー未設定またはクールダウン中)" }, { status: 503, headers: cors });
    }
    let provider = routed.provider;
    let result = routed.result;

    for (let round = 0; round < MAX_ROUNDS && result.toolCalls.length > 0; round++) {
      const toolMsgs: Msg[] = await Promise.all(result.toolCalls.map(async (c) => ({
        role: "tool", name: c.name, tool_call_id: c.id,
        content: await runTool(sb, user.id, c, proposals),
      })));
      messages.push({ role: "assistant", content: result.text, tool_calls: result.toolCalls });
      messages.push(...toolMsgs);
      const again = await route(purpose, messages, user.id, tried);
      if (!again) break;
      provider = again.provider;
      result = again.result;
    }

    const text = result.text || "(返答を生成できませんでした)";
    await logAi({ userId: user.id, provider, purpose, ok: true, detail: { proposals: proposals.length } });
    return Response.json({ text, provider, tried, proposals }, { headers: cors });
  } catch (e) {
    await logAi({ userId: null, provider: "-", purpose: "error", ok: false, error: String(e) });
    return Response.json({ error: String(e) }, { status: 500, headers: cors });
  }
});
