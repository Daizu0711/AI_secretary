/* ============================================================================
   mock.js — ローカル確認用の Supabase モック (?preview=1)
   本番では読み込まれない (index_1.html の document.write 条件を参照)
   ========================================================================== */
(() => {
  "use strict";

  const now = new Date();
  const day = n => { const d = new Date(now); d.setDate(d.getDate() + n); d.setHours(0, 0, 0, 0); return d; };
  const at = (n, h, m) => { const d = day(n); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const todayAt = (h, m) => at(0, h, m);
  const iso = d => new Date(d).toISOString();
  const minsAgo = n => new Date(Date.now() - n * 60000).toISOString();
  const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 10);

  const seedItems = [
    {
      id: "t-chem", user_id: "u1", kind: "task", title: "化学 HL レポートを仕上げる",
      body: "実験データの考察を追加して、参考文献を揃える。", due: todayAt(23, 59),
      category: "化学", est_minutes: 60, actual_min: null, done: false, done_at: null,
      ai_hidden: false, priority: 2, scheduled_start: todayAt(18, 0), scheduled_end: todayAt(19, 0),
      created_at: minsAgo(400), updated_at: minsAgo(120),
    },
    {
      id: "t-math", user_id: "u1", kind: "task", title: "数学 演習 5.2",
      body: "", due: todayAt(23, 59), category: "数学", est_minutes: 30, actual_min: null,
      done: false, done_at: null, ai_hidden: false, priority: 1,
      scheduled_start: todayAt(20, 0), scheduled_end: todayAt(20, 30),
      created_at: minsAgo(300), updated_at: minsAgo(300),
    },
    {
      id: "t-ee", user_id: "u1", kind: "task", title: "EE 構成案の見直し",
      body: "リサーチクエスチョンと章立ての整合を確認。", due: at(2, 23, 59),
      category: "EE", est_minutes: 90, actual_min: null, done: false, done_at: null,
      ai_hidden: false, priority: 2, scheduled_start: at(1, 16, 15), scheduled_end: at(1, 17, 45),
      created_at: minsAgo(1200), updated_at: minsAgo(600),
    },
    {
      id: "t-tok", user_id: "u1", kind: "task", title: "TOK エッセイの題材メモ",
      body: "", due: at(-1, 23, 59), category: "TOK", est_minutes: 30, actual_min: null,
      done: false, done_at: null, ai_hidden: false, priority: 1,
      scheduled_start: null, scheduled_end: null,
      created_at: minsAgo(2000), updated_at: minsAgo(2000),
    },
    {
      id: "t-club", user_id: "u1", kind: "task", title: "部活の連絡を返す",
      body: "", due: null, category: "生活", est_minutes: 10, actual_min: null,
      done: false, done_at: null, ai_hidden: false, priority: 0,
      scheduled_start: null, scheduled_end: null,
      created_at: minsAgo(2600), updated_at: minsAgo(2600),
    },
    {
      id: "t-eng", user_id: "u1", kind: "task", title: "英語 単語帳 30語",
      body: "", due: todayAt(23, 59), category: "英語", est_minutes: 20, actual_min: 35,
      done: true, done_at: minsAgo(95), ai_hidden: false, priority: 0,
      scheduled_start: todayAt(16, 0), scheduled_end: todayAt(16, 20),
      created_at: minsAgo(500), updated_at: minsAgo(95),
    },
    {
      id: "t-bio", user_id: "u1", kind: "task", title: "生物 IA データ整理",
      body: "", due: at(-2, 23, 59), category: "生物", est_minutes: 45, actual_min: 70,
      done: true, done_at: at(-2, 19, 30), ai_hidden: false, priority: 1,
      scheduled_start: at(-2, 18, 0), scheduled_end: at(-2, 18, 45),
      created_at: minsAgo(4000), updated_at: minsAgo(3000),
    },
    {
      id: "t-hist", user_id: "u1", kind: "task", title: "歴史 プリント復習",
      body: "", due: at(-1, 23, 59), category: "歴史", est_minutes: 30, actual_min: 25,
      done: true, done_at: at(-1, 21, 0), ai_hidden: false, priority: 0,
      scheduled_start: at(-1, 20, 0), scheduled_end: at(-1, 20, 30),
      created_at: minsAgo(5000), updated_at: minsAgo(3000),
    },
    {
      id: "n-ia", user_id: "u1", kind: "note", title: "IA のリサーチクエスチョン案",
      body: "「〇〇が△△に与える影響」→ 測定可能な変数に落とす。\n先行研究を3本探す。",
      category: "IA", ai_hidden: false, due: null, est_minutes: null,
      created_at: minsAgo(700), updated_at: minsAgo(90),
    },
    {
      id: "n-org", user_id: "u1", kind: "note", title: "有機化学 授業メモ",
      body: "求核置換と脱離の競合。SN1 はカルボカチオン安定性、SN2 は立体障害。",
      category: "化学", ai_hidden: false, due: null, est_minutes: null,
      created_at: minsAgo(3000), updated_at: minsAgo(2800),
    },
    {
      id: "n-buy", user_id: "u1", kind: "note", title: "買うもの",
      body: "ノート、シャープペン替芯、コーヒー", category: "生活", ai_hidden: true,
      due: null, est_minutes: null, created_at: minsAgo(6000), updated_at: minsAgo(6000),
    },
  ];

  const seedMemory = [
    { id: "m1", user_id: "u1", text: "平日は16時以降が勉強時間。部活の後は30分休んでから始める。", created_at: minsAgo(100000) },
    { id: "m2", user_id: "u1", text: "化学は理解に時間がかかるので、見積りは多めに取る。", created_at: minsAgo(90000) },
  ];

  const seedMb = [
    {
      task_id: "mb1", class_id: "c1", class_name: "Biology HL", title: "IA Draft Submission",
      kind: "Summative", status: "Not Submitted", submittable: true,
      due: "Nov 12", due_iso: at(4, 23, 59), url: "https://example.com", context: "",
      detail: "Submit the first draft of your IA (max 2000 words) including method and raw data.",
      detail_title: "IA Draft", fetched_at: minsAgo(200),
    },
    {
      task_id: "mb2", class_id: "c2", class_name: "Mathematics AA", title: "Exploration Checkpoint",
      kind: "Formative", status: "Not Submitted", submittable: true,
      due: "Nov 15", due_iso: at(7, 23, 59), url: "https://example.com", context: "",
      detail: "Upload your exploration outline and 3 references.", detail_title: "Checkpoint",
      fetched_at: minsAgo(200),
    },
  ];

  const db = {
    sec_items: seedItems.map(x => ({ ...x })),
    sec_memory: seedMemory.map(x => ({ ...x })),
    managebac_tasks: seedMb.map(x => ({ ...x })),
    sec_ics_tokens: [{ user_id: "u1", token: "demo-token-123" }],
  };

  const clone = v => JSON.parse(JSON.stringify(v));
  const match = (row, [k, v]) => row[k] === v;

  class Query {
    constructor(table) {
      this.table = table;
      this.op = "select";
      this.filters = [];
      this.orders = [];
      this.limitN = null;
      this.singleMode = false;
      this.payload = null;
      this.wantSelect = false;
    }
    select() { this.wantSelect = true; return this; }
    order(col, opts = {}) { this.orders.push([col, opts]); return this; }
    eq(col, val) { this.filters.push([col, val]); return this; }
    limit(n) { this.limitN = n; return this; }
    single() { this.singleMode = true; return this; }
    insert(v) { this.op = "insert"; this.payload = v; return this; }
    update(v) { this.op = "update"; this.payload = v; return this; }
    upsert(v) { this.op = "upsert"; this.payload = v; return this; }
    delete() { this.op = "delete"; return this; }
    then(res, rej) { Promise.resolve().then(() => res(this.run())).catch(rej); }
    run() {
      const rows = db[this.table] || (db[this.table] = []);
      if (this.op === "insert") {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload];
        const added = input.map(v => ({
          id: v.id || uid(this.table),
          created_at: v.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...clone(v),
        }));
        rows.push(...added);
        return { data: this.singleMode ? clone(added[0]) : clone(added), error: null };
      }
      if (this.op === "upsert") {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload];
        const merged = input.map(v => {
          const idx = rows.findIndex(r => r.id === v.id);
          if (idx >= 0) { rows[idx] = { ...rows[idx], ...clone(v), updated_at: new Date().toISOString() }; return rows[idx]; }
          const row = { id: v.id || uid(this.table), created_at: new Date().toISOString(), ...clone(v) };
          rows.push(row); return row;
        });
        return { data: clone(merged), error: null };
      }
      if (this.op === "update") {
        const hit = rows.filter(r => this.filters.every(f => match(r, f)));
        hit.forEach(r => Object.assign(r, clone(this.payload), { updated_at: new Date().toISOString() }));
        return { data: clone(hit), error: null };
      }
      if (this.op === "delete") {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (this.filters.every(f => match(rows[i], f))) rows.splice(i, 1);
        }
        return { data: null, error: null };
      }
      let out = rows.filter(r => this.filters.every(f => match(r, f)));
      for (const [col, opts] of [...this.orders].reverse()) {
        out.sort((a, b) => {
          const av = a[col], bv = b[col];
          if (av == null && bv == null) return 0;
          if (av == null) return opts.nullsFirst === false ? -1 : 1;
          if (bv == null) return opts.nullsFirst === false ? 1 : -1;
          const r = av > bv ? 1 : av < bv ? -1 : 0;
          return opts.ascending === false ? -r : r;
        });
      }
      if (this.limitN != null) out = out.slice(0, this.limitN);
      if (this.singleMode) return { data: out[0] ? clone(out[0]) : null, error: null };
      return { data: clone(out), error: null };
    }
  }

  const client = {
    from(table) { return new Query(table); },
    channel() {
      const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} };
      return ch;
    },
    removeChannel() {},
    auth: {
      async signInWithPassword() { return { data: { session: { user: { email: "sota@example.com" } } }, error: null }; },
      async signOut() { return { error: null }; },
      async updateUser() { return { data: {}, error: null }; },
      onAuthStateChange(cb) {
        setTimeout(() => cb("SIGNED_IN", { user: { email: "sota@example.com" } }), 0);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async getSession() { return { data: { session: { user: { email: "sota@example.com" } } } }; },
    },
    functions: {
      async invoke(name, opts = {}) {
        const msg = String(opts?.body?.message || "");
        if (name === "ai") {
          if (/接続テスト|OK/.test(msg)) {
            return { data: { text: "OK", provider: "gemini", tried: [{ provider: "gemini", ok: true }], proposals: [] }, error: null };
          }
          if (/計画|整理/.test(msg)) {
            return {
              data: {
                text: "今日の残りは2時間。期限の近い順に組み直しました。\n\n- **18:00** 化学レポート(60分)\n- **20:00** 数学演習(30分)\n\nTOKのメモは期限が過ぎているので、15分だけ先に片づけるのがおすすめです。",
                provider: "gemini", tried: [{ provider: "gemini", ok: true }],
                proposals: [{ tool: "propose_schedule", args: { id: "t-tok", scheduled_start: todayAt(21, 0), scheduled_end: todayAt(21, 30) } }],
              },
              error: null,
            };
          }
          return {
            data: {
              text: "了解しました。明日の15時から「化学のIA 構成案」を45分で入れておきます。期限は明日の23:59にしました。",
              provider: "gemini", tried: [{ provider: "gemini", ok: true }],
              proposals: [{
                tool: "propose_add_task",
                args: { title: "化学のIA 構成案", due: at(1, 15, 0), est_minutes: 45, category: "化学", notes: "章立てと図の下書き" },
              }],
            },
            error: null,
          };
        }
        return { data: {}, error: null };
      },
    },
  };

  window.__PREVIEW__ = { client };
})();
