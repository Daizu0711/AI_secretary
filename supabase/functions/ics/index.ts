// ============================================================================
// ics — iCalフィード配信 Edge Function (OAuth不要のカレンダー連携)
//
//   GET  ?token=<feed token>   → text/calendar (VEVENT一覧)
//   POST { action:"rotate" }   → ユーザーJWT必須。フィードトークンを再発行して返す
//
// 使い方: Googleカレンダー →「他のカレンダー」→「+」→「URLから追加」に
//   https://<ref>.supabase.co/functions/v1/ics?token=<token>
// を登録する。Google側の巡回間隔の都合で反映は遅い(数十分〜数時間)。
// デプロイ: supabase functions deploy ics --no-verify-jwt
//   (GETはトークンで認証するため。POSTはユーザーJWTを関数内で検証)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const service = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: { user }, error } = await c.auth.getUser();
  return error || !user ? null : user;
}

// ---------- iCal生成 ----------
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fmtUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function ev(lines: string[], o: { uid: string; summary: string; desc: string; start: string; end: string; stamp: string }) {
  lines.push(
    "BEGIN:VEVENT",
    `UID:${o.uid}`,
    `DTSTAMP:${fmtUtc(o.stamp)}`,
    `DTSTART:${fmtUtc(o.start)}`,
    `DTEND:${fmtUtc(o.end)}`,
    `SUMMARY:${icsEscape(o.summary)}`,
    `DESCRIPTION:${icsEscape(o.desc)}`,
    "END:VEVENT",
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // トークン再発行 (ユーザー認証必須)
  if (req.method === "POST") {
    const user = await getUser(req);
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: cors });
    const body = await req.json().catch(() => ({}));
    if (body.action === "rotate") {
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const { error } = await service().from("sec_ics_tokens").upsert({ user_id: user.id, token }, { onConflict: "user_id" });
      if (error) return Response.json({ error: error.message }, { status: 500, headers: cors });
      return Response.json({ token }, { headers: cors });
    }
    return Response.json({ error: "unknown action" }, { status: 400, headers: cors });
  }

  // フィード本体
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return new Response("missing token", { status: 400, headers: cors });
  const sb = service();
  const { data: tk } = await sb.from("sec_ics_tokens").select("user_id").eq("token", token).single();
  if (!tk) return new Response("invalid token", { status: 401, headers: cors });
  const userId = tk.user_id as string;

  const { data: items } = await sb.from("sec_items")
    .select("id,title,body,category,due,est_minutes,scheduled_start,scheduled_end,done,updated_at")
    .eq("user_id", userId);
  const { data: mb } = await sb.from("managebac_tasks")
    .select("task_id,class_name,title,due_iso,detail,url,status,updated_at");

  const now = new Date().toISOString();
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AI-secretary//ics//JA",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:AI秘書`,
  ];

  for (const it of (items ?? []) as Record<string, unknown>[]) {
    if (it.done) continue;
    const est = (it.est_minutes as number) || 30;
    let start: string | null = null, end: string | null = null;
    if (it.scheduled_start) {
      start = it.scheduled_start as string;
      end = (it.scheduled_end as string) || new Date(new Date(start).getTime() + est * 60000).toISOString();
    } else if (it.due) {
      start = it.due as string;
      end = new Date(new Date(start).getTime() + est * 60000).toISOString();
    }
    if (!start || !end) continue;
    ev(lines, {
      uid: `sec-${it.id}@ai-secretary`,
      summary: String(it.title),
      desc: [it.body, it.category ? `カテゴリ: ${it.category}` : ""].filter(Boolean).join("\n").slice(0, 4000),
      start, end, stamp: (it.updated_at as string) || now,
    });
  }

  for (const t of (mb ?? []) as Record<string, unknown>[]) {
    if (!t.due_iso) continue;
    if (["Submitted", "Complete", "Excused"].includes(t.status as string)) continue;
    const start = t.due_iso as string;
    const end = new Date(new Date(start).getTime() + 60 * 60000).toISOString();
    ev(lines, {
      uid: `mb-${t.task_id}@ai-secretary`,
      summary: `[MB] ${t.class_name ? t.class_name + ": " : ""}${t.title}`,
      desc: [t.detail, t.url].filter(Boolean).join("\n\n").slice(0, 4000),
      start, end, stamp: (t.updated_at as string) || now,
    });
  }

  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", ...cors },
  });
});
