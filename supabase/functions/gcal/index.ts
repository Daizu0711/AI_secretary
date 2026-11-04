// ============================================================================
// gcal — Googleカレンダー連携 Edge Function (書き込み: タスク/MB課題を予定として登録)
//
// アクション(POSTボディの action、またはGETのクエリ):
//   auth_url   { state? }        → Google OAuth開始URLを返す { url }
//   callback   GET ?code=&state= → トークン交換して sec_gcal に保存し、state へリダイレクト
//   status                      → { connected, calendar_id, last_sync }
//   sync                        → sec_items / managebac_tasks をカレンダーへ作成・更新
//   disconnect                  → トークン削除
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Google Cloud Console 側で承認済みリダイレクトURIに
//   {SUPABASE_URL}/functions/v1/gcal?action=callback を登録すること。
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gcal?action=callback`;
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

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

// ---------- Google トークン ----------
async function getTokens(userId: string) {
  const { data } = await service().from("sec_gcal").select("*").eq("user_id", userId).single();
  return data as { refresh_token: string; access_token: string | null; token_expiry: string | null; calendar_id: string; sync_enabled: boolean } | null;
}

async function accessToken(userId: string): Promise<string> {
  const t = await getTokens(userId);
  if (!t) throw new Error("not connected");
  const exp = t.token_expiry ? new Date(t.token_expiry).getTime() : 0;
  if (t.access_token && exp - 60_000 > Date.now()) return t.access_token;
  // リフレッシュ
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: t.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`refresh failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const expiry = new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString();
  await service().from("sec_gcal").update({ access_token: j.access_token, token_expiry: expiry }).eq("user_id", userId);
  return j.access_token;
}

// ---------- イベント同期 ----------
function eventForItem(it: Record<string, unknown>) {
  const est = (it.est_minutes as number) || 30;
  let start: string, end: string;
  if (it.scheduled_start) {
    start = it.scheduled_start as string;
    end = (it.scheduled_end as string) || new Date(new Date(start).getTime() + est * 60000).toISOString();
  } else if (it.due) {
    start = it.due as string;
    end = new Date(new Date(start).getTime() + est * 60000).toISOString();
  } else {
    return null; // 日時のないタスクはカレンダーに出さない
  }
  return {
    summary: String(it.title),
    description: [it.body, it.category ? `カテゴリ: ${it.category}` : ""].filter(Boolean).join("\n").slice(0, 4000),
    start: { dateTime: start, timeZone: "Asia/Tokyo" },
    end: { dateTime: end, timeZone: "Asia/Tokyo" },
  };
}

function eventForMb(t: Record<string, unknown>) {
  if (!t.due_iso) return null;
  const start = t.due_iso as string;
  const end = new Date(new Date(start).getTime() + 60 * 60000).toISOString();
  return {
    summary: `[MB] ${t.class_name ? t.class_name + ": " : ""}${t.title}`,
    description: [t.detail, t.url].filter(Boolean).join("\n\n").slice(0, 4000),
    start: { dateTime: start, timeZone: "Asia/Tokyo" },
    end: { dateTime: end, timeZone: "Asia/Tokyo" },
  };
}

async function syncTable(userId: string, token: string, table: "sec_items" | "managebac_tasks", toEvent: (r: Record<string, unknown>) => object | null, idKey: "id" | "task_id") {
  const sb = service();
  const calId = (await getTokens(userId))?.calendar_id || "primary";
  const { data: rows, error } = await sb.from(table).select("*");
  if (error) throw error;
  let created = 0, updated = 0;
  const now = new Date().toISOString();
  for (const row of (rows ?? []) as Record<string, unknown>[]) {
    if (table === "sec_items" && (row.user_id !== userId || row.done)) continue;
    const ev = toEvent(row);
    if (!ev) continue;
    const id = row[idKey] as string;
    const needsUpdate = row.gcal_event_id && row.gcal_synced_at && new Date(row.gcal_synced_at as string) < new Date(row.updated_at as string);
    try {
      if (!row.gcal_event_id) {
        const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(ev),
        });
        if (!r.ok) throw new Error(`create ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const j = await r.json();
        await sb.from(table).update({ gcal_event_id: j.id, gcal_synced_at: now }).eq(idKey, id);
        created++;
      } else if (needsUpdate) {
        const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(row.gcal_event_id as string)}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(ev),
        });
        if (!r.ok) throw new Error(`update ${r.status}: ${(await r.text()).slice(0, 200)}`);
        await sb.from(table).update({ gcal_synced_at: now }).eq(idKey, id);
        updated++;
      }
    } catch (e) {
      console.error(`[gcal] ${table} ${id} failed:`, e); // 個別失敗は続行
    }
  }
  return { created, updated };
}

// ---------- ハンドラ ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);

  // OAuthコールバック (GET, code付き)
  if (req.method === "GET" && url.searchParams.get("action") === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "/";
    if (!code) return new Response("missing code", { status: 400 });
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
      }),
    });
    if (!r.ok) return new Response(`token exchange failed: ${(await r.text()).slice(0, 300)}`, { status: 400 });
    const j = await r.json();
    // user_id は state 経由では取れないので、コールバック時は呼び出し元が ?uid= を付ける方式にはせず
    // セキュリティ重視で「ログイン中セッションのCookieが無い」ため、フロント側が uid を state に含める
    const uid = url.searchParams.get("uid") ?? "";
    if (!uid) return new Response("missing uid", { status: 400 });
    const expiry = new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString();
    await service().from("sec_gcal").upsert({
      user_id: uid, refresh_token: j.refresh_token, access_token: j.access_token,
      token_expiry: expiry, sync_enabled: true,
    }, { onConflict: "user_id" });
    const target = state + (state.includes("?") ? "&" : "?") + "gcal=connected";
    return new Response(
      `<html><body><script>location.href=${JSON.stringify(target)}</script>リダイレクト中…</body></html>`,
      { headers: { "Content-Type": "text/html" } });
  }

  if (req.method === "GET") {
    return Response.json({ ok: true, configured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) }, { headers: cors });
  }

  // POST系はユーザー認証必須
  const user = await getUser(req);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: cors });

  const body = await req.json().catch(() => ({}));
  const action = body.action ?? url.searchParams.get("action");

  try {
    if (action === "auth_url") {
      if (!GOOGLE_CLIENT_ID) return Response.json({ error: "GOOGLE_CLIENT_ID not set" }, { status: 500, headers: cors });
      const state = body.state || "/";
      const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      u.searchParams.set("client_id", GOOGLE_CLIENT_ID);
      u.searchParams.set("redirect_uri", REDIRECT_URI);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", SCOPE);
      u.searchParams.set("access_type", "offline");
      u.searchParams.set("prompt", "consent");
      u.searchParams.set("state", state + "&uid=" + user.id);
      return Response.json({ url: u.toString() }, { headers: cors });
    }

    if (action === "status") {
      const t = await getTokens(user.id);
      return Response.json({
        connected: !!t?.refresh_token, calendar_id: t?.calendar_id ?? null,
        sync_enabled: t?.sync_enabled ?? false, last_sync: t?.last_sync ?? null,
      }, { headers: cors });
    }

    if (action === "disconnect") {
      await service().from("sec_gcal").delete().eq("user_id", user.id);
      return Response.json({ ok: true }, { headers: cors });
    }

    if (action === "sync") {
      const t = await getTokens(user.id);
      if (!t || !t.sync_enabled) return Response.json({ error: "not connected" }, { status: 400, headers: cors });
      const token = await accessToken(user.id);
      const a = await syncTable(user.id, token, "sec_items", eventForItem, "id");
      const b = await syncTable(user.id, token, "managebac_tasks", eventForMb, "task_id");
      const syncedAt = new Date().toISOString();
      await service().from("sec_gcal").update({ last_sync: syncedAt }).eq("user_id", user.id);
      return Response.json({ ok: true, created: a.created + b.created, updated: a.updated + b.updated, synced_at: syncedAt }, { headers: cors });
    }

    return Response.json({ error: `unknown action: ${action}` }, { status: 400, headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: cors });
  }
});
