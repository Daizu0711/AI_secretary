// ============================================================================
// ai — AIルーター Edge Function (仕様書 v1 §2, §4.2, §6)
//
// 役割:
//   - チャット/計画: Gemini → NVIDIA NIM → Hermes(オンライン時) の順にフォールバック
//   - 課題ヒント(hint): NIM → Gemini
//   - 文字起こし(transcribe): Gemini のみ。失敗時は {ok:false, retry_later:true}
//     を返し、呼び出し側は録音を保存して後で再処理する
//   - 429/タイムアウトは同一提供元を2回まで再試行。失敗が続いた提供元は10分休ませる
//   - 読み取りツール(list_items/list_memory)は即実行。
//     書き込みは propose_* ツールで「提案」だけを返し、適用はアプリ側の承認タップで行う
//     (勝手に確定しない。承認後はアプリの元に戻すトーストで復元できる)
//   - 全呼び出しを sec_ai_log に記録する
//
// Secrets (supabase secrets set):
//   GEMINI_API_KEY, [GEMINI_MODEL], [NIM_API_KEY or NVIDIA_API_KEY], [NIM_BASE], [NIM_MODEL]
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";
const NIM_API_KEY = Deno.env.get("NIM_API_KEY") ?? Deno.env.get("NVIDIA_API_KEY") ?? "";
const NIM_BASE = (Deno.env.get("NIM_BASE") ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
const NIM_MODEL = Deno.env.get("NIM_MODEL") ?? "nvidia/llama-3.1-nemotron-70b-instruct";

const CALL_TIMEOUT_MS = 25_000;
const MAX_ROUNDS = 6;
const PROVIDER_COOLDOWN_MS = 10 * 60_000;

// 提供元ごとのクールダウン(インスタンス内メモリ。複数インスタンスでは再試行が増える程度で害はない)
const cooldownUntil = new Map<string, number>();

function inCooldown(p: string): boolean {
  const until = cooldownUntil.get(p) ?? 0;
  return Date.now() < until;
}
function markCooldown(p: string) {
  cooldownUntil.set(p, Date.now() + PROVIDER_COOLDOWN_MS);
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Msg = { role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string; name?: string };
type ToolCall = { id: string; name: string; args: Record<string, unknown> };
type ProviderResult = { text: string; toolCalls: ToolCall[] };

// ---------- ツール定義(提供元非依存) ----------
const TOOLS = [
  {
    name: "list_items",
    description: "ユーザーのタスク/メモを読む。AI非公開(hide_from_ai)は含まれない。計画相談・要約・進捗確認では先に必ずこれを呼ぶ。",
    args: { kind: "string: 'task'|'memo'|省略で全部", include_done: "boolean 省略で未完了のみ" },
  },
  {
    name: "list_memory",
    description: "保存済みの記憶(好み・固定予定・ペースなど)を読む。",
    args: {},
  },
  { name: "propose_add_task", description: "タスク追加の提案カードを出す(勝手に追加しない)", args: { title: "string", due: "ISO8601|null", category: "string", estimate_min: "number|null", priority: "number" } },
  { name: "propose_add_memo", description: "メモ追加の提案カードを出す", args: { title: "string", body: "string", category: "string" } },
  { name: "propose_update_item", description: "既存タスク/メモの更新提案", args: { id: "string", patch: "object 変更するフィールドだけ" } },
  { name: "propose_complete_item", description: "タスク完了の提案", args: { id: "string", actual_min: "number|null" } },
  { name: "propose_delete_item", description: "削除の提案", args: { id: "string" } },
  { name: "propose_save_memory", description: "記憶への保存提案", args: { content: "string" } },
];

const SYSTEM_PROMPT = `あなたはユーザー専属のAI秘書です。日本語で簡潔に答えます。
ルール:
- タスク/メモの内容に答える前に、必ず list_items / list_memory で実データを読んでから答えること。
- 追加・変更・完了・削除・記憶の保存は、勝手に確定せず propose_* ツールで提案だけ出すこと。適用はユーザーの承認後にアプリが行う。
- list_items は AI非公開フラグ付きの項目を含まない。見えないものがある前提で、勝手な推測をしないこと。
- 今日の計画の相談では、期限・見積り・使える時間を踏まえて具体的に答えること。
- EE/IA/TOKなどの課題本文の代筆はしない。構成案・論点・質問・次の一歩のヒントまでにすること。`;

// ---------- Supabase ----------
function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function logAi(opts: { userId: string | null; provider: string; purpose: string; ok: boolean; error?: string; detail?: unknown }) {
  try {
    await serviceClient().from("sec_ai_log").insert({
      user_id: opts.userId,
      provider: opts.provider,
      purpose: opts.purpose,
      ok: opts.ok,
      error: opts.error ?? null,
      detail: opts.detail ?? null,
    });
  } catch { /* ログ失敗で本体を落とさない */ }
}

// ---------- プロバイダ ----------
async function callGemini(messages: Msg[]): Promise<ProviderResult> {
  const sys = messages.find((m) => m.role === "system")?.content ?? SYSTEM_PROMPT;
  const rest = messages.filter((m) => m.role !== "system");
  const contents = rest.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents,
    tools: [{
      functionDeclarations: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: { type: "object", properties: Object.fromEntries(Object.entries(t.args).map(([k, v]) => [k, { type: typeof v === "string" ? "string" : "object", description: String(v) }])) },
      })),
    }],
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 429) throw Object.assign(new Error("gemini 429"), { code: 429 });
  if (!r.ok) throw Object.assign(new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`), { code: r.status });
  const j = await r.json();
  const c = j.candidates?.[0]?.content ?? {};
  const text = (c.parts ?? []).filter((p: { text?: string }) => p.text).map((p: { text: string }) => p.text).join("\n");
  const toolCalls: ToolCall[] = (c.parts ?? [])
    .filter((p: { functionCall?: { name: string; args: Record<string, unknown> } }) => p.functionCall)
    .map((p: { functionCall: { name: string; args: Record<string, unknown> } }, i: number) => ({
      id: `gemini_${Date.now()}_${i}`,
      name: p.functionCall.name,
      args: p.functionCall.args ?? {},
    }));
  return { text, toolCalls };
}

async function callNIM(messages: Msg[]): Promise<ProviderResult> {
  const tools = TOOLS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: "object", properties: Object.fromEntries(Object.entries(t.args).map(([k, v]) => [k, { type: typeof v === "string" ? "string" : "object", description: String(v) }])) },
    },
  }));
  const r = await fetchWithTimeout(`${NIM_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${NIM_API_KEY}` },
    body: JSON.stringify({ model: NIM_MODEL, messages, tools, tool_choice: "auto" }),
  });
  if (r.status === 429) throw Object.assign(new Error("nim 429"), { code: 429 });
  if (!r.ok) throw Object.assign(new Error(`nim ${r.status}: ${(await r.text()).slice(0, 300)}`), { code: r.status });
  const j = await r.json();
  const m = j.choices?.[0]?.message ?? {};
  const toolCalls: ToolCall[] = (m.tool_calls ?? []).map((c: { id: string; function: { name: string; arguments: string } }) => ({
    id: c.id ?? `nim_${Date.now()}`,
    name: c.function.name,
    args: safeJson(c.function.arguments),
  }));
  return { text: m.content ?? "", toolCalls };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), CALL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}

// Hermes: ジョブ表に書いて結果を待つ(オンライン時のみ有効)
async function callHermes(userId: string, purpose: string, messages: Msg[]): Promise<ProviderResult | null> {
  const sb = serviceClient();
  const lastUser = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n").slice(-4000);
  const { data: job, error } = await sb.from("sec_hermes_jobs").insert({
    user_id: userId,
    kind: "free",
    payload: { purpose, prompt: lastUser },
    status: "pending",
  }).select("id").single();
  if (error || !job) return null;

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const { data } = await sb.from("sec_hermes_jobs").select("status,result,error").eq("id", job.id).single();
    if (data?.status === "done") {
      const text = typeof data.result === "string" ? data.result : JSON.stringify(data.result);
      return { text, toolCalls: [] };
    }
    if (data?.status === "failed") return null;
  }
  return null; // オフライン/処理中 → 次のフォールバックなし(Hermesは最後手なのでnull)
}

// ---------- ツール実行 ----------
async function runTool(sb: ReturnType<typeof serviceClient>, userId: string, call: ToolCall, proposals: unknown[]): Promise<string> {
  switch (call.name) {
    case "list_items": {
      const kind = (call.args.kind as string) || undefined;
      const includeDone = Boolean(call.args.include_done);
      let q = sb.from("sec_items").select("id,kind,title,body,due,category,estimate_min,actual_min,done,priority,scheduled_start,scheduled_end")
        .eq("user_id", userId).eq("hide_from_ai", false).order("due", { ascending: true, nullsFirst: false });
      if (kind === "task" || kind === "memo") q = q.eq("kind", kind);
      if (!includeDone) q = q.eq("done", false);
      const { data, error } = await q.limit(200);
      if (error) return `error: ${error.message}`;
      return JSON.stringify(data ?? []);
    }
    case "list_memory": {
      const { data, error } = await sb.from("sec_memory").select("id,content,created_at").eq("user_id", userId).order("created_at");
      if (error) return `error: ${error.message}`;
      return JSON.stringify(data ?? []);
    }
    default: {
      if (call.name.startsWith("propose_")) {
        const p = { id: crypto.randomUUID(), type: call.name, ...call.args };
        proposals.push(p);
        return `proposal ${p.id} を作成しました。ユーザーの承認後にアプリが適用します。`;
      }
      return `unknown tool: ${call.name}`;
    }
  }
}

// ---------- ルーター ----------
async function route(purpose: string, messages: Msg[], userId: string): Promise<{ provider: string; result: ProviderResult } | null> {
  const order =
    purpose === "hint" ? ["nim", "gemini"]
    : purpose === "transcribe" ? ["gemini"]
    : ["gemini", "nim", "hermes"];

  for (const p of order) {
    if (inCooldown(p)) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (p === "gemini" && GEMINI_API_KEY) {
          return { provider: "gemini", result: await callGemini(messages) };
        }
        if (p === "nim" && NIM_API_KEY) {
          return { provider: "nim", result: await callNIM(messages) };
        }
        if (p === "hermes") {
          const r = await callHermes(userId, purpose, messages);
          if (r) return { provider: "hermes", result: r };
          markCooldown("hermes");
          break;
        }
        break; // キー未設定 → 次の提供元へ
      } catch (e) {
        const code = (e as { code?: number }).code;
        if (code === 429 || (e as Error).name === "AbortError") {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue; // 同一提供元を再試行
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
  if (req.method === "GET") return Response.json({ ok: true, providers: { gemini: !!GEMINI_API_KEY, nim: !!NIM_API_KEY } }, { headers: cors });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      await logAi({ userId: null, provider: "-", purpose: "auth", ok: false, error: authErr?.message });
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: cors });
    }

    const body = await req.json();
    const purpose: string = body.purpose ?? "chat";
    const userMessages: Msg[] = Array.isArray(body.messages) ? body.messages : [];
    const messages: Msg[] = [{ role: "system", content: SYSTEM_PROMPT }, ...userMessages];

    const sb = serviceClient();
    const proposals: unknown[] = [];
    let provider = "-";
    let reply = "";

    const routed = await route(purpose, messages, user.id);
    if (!routed) {
      await logAi({ userId: user.id, provider, purpose, ok: false, error: "all providers unavailable" });
      if (purpose === "transcribe") {
        return Response.json({ ok: false, retry_later: true, error: "transcribe unavailable" }, { status: 200, headers: cors });
      }
      return Response.json({ ok: false, error: "all AI providers unavailable (cooldown or keys missing)" }, { status: 503, headers: cors });
    }
    provider = routed.provider;
    let result = routed.result;

    // ツールループ
    for (let round = 0; round < MAX_ROUNDS && result.toolCalls.length > 0; round++) {
      const toolMsgs: Msg[] = await Promise.all(result.toolCalls.map(async (c) => ({
        role: "tool",
        name: c.name,
        tool_call_id: c.id,
        content: await runTool(sb, user.id, c, proposals),
      })));
      messages.push({ role: "assistant", content: result.text, tool_calls: result.toolCalls });
      messages.push(...toolMsgs);
      const again = await route(purpose, messages, user.id);
      if (!again) break;
      result = again.result;
      provider = again.provider;
    }

    reply = result.text || "(返答を生成できませんでした)";
    await logAi({ userId: user.id, provider, purpose, ok: true, detail: { proposals: proposals.length } });
    return Response.json({ ok: true, provider, reply, proposals }, { headers: cors });
  } catch (e) {
    await logAi({ userId: null, provider: "-", purpose: "error", ok: false, error: String(e) });
    return Response.json({ ok: false, error: String(e) }, { status: 500, headers: cors });
  }
});
