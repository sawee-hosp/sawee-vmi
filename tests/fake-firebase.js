// Minimal in-memory Firebase compat stub for smoke tests (prototype-based like the real compat SDK)
(function () {
  const seed = window.__SEED || {};
  const store = {}; // col -> Map(id -> data)
  const col = (n) => (store[n] = store[n] || new Map());
  window.__STORE = store;
  window.__READS = 0; window.__READLOG = [];
  const countReads = (c, n) => { window.__READS += n; window.__READLOG.push(c + ':' + n); };
  class Timestamp {
    constructor(s, n) { this.seconds = s; this.nanoseconds = n || 0; }
    toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
    toDate() { return new Date(this.toMillis()); }
    static fromDate(d) { const ms = d.getTime(); return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
    static now() { return Timestamp.fromDate(new Date()); }
  }
  const revive = (v) => {
    if (v && typeof v === 'object') {
      if (typeof v.seconds === 'number' && Object.keys(v).length <= 2 && 'nanoseconds' in v) return new Timestamp(v.seconds, v.nanoseconds);
      if (Array.isArray(v)) return v.map(revive);
      const o = {}; Object.keys(v).forEach(k => { o[k] = revive(v[k]); }); return o;
    }
    return v;
  };
  const clone = (v) => {
    if (v instanceof Timestamp) return new Timestamp(v.seconds, v.nanoseconds);
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = clone(v[k]); }); return o; }
    return v;
  };
  Object.entries(seed.collections || {}).forEach(([c, docs]) => Object.entries(docs).forEach(([id, d]) => col(c).set(id, revive(JSON.parse(JSON.stringify(d))))));
  const SENT = (t, v) => ({ __fv: t, v });
  const FieldValue = {
    serverTimestamp: () => SENT('ts'), delete: () => SENT('del'),
    increment: (n) => SENT('inc', n), arrayUnion: (...a) => SENT('au', a)
  };
  let tick = 0;
  const now = () => { const ms = Date.now(); tick += 1; return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6 + (tick % 1000000)); };
  const apply = (prev, patch, merge) => {
    const out = merge ? { ...(prev || {}) } : {};
    Object.entries(patch).forEach(([k, v]) => {
      if (v && v.__fv === 'ts') out[k] = now();
      else if (v && v.__fv === 'del') delete out[k];
      else if (v && v.__fv === 'inc') out[k] = (Number(out[k]) || 0) + v.v;
      else if (v && v.__fv === 'au') out[k] = [...new Set([...(out[k] || []), ...v.v])];
      else out[k] = clone(v);
    });
    return out;
  };
  const snapDoc = (c, id) => { const d = col(c).get(id); return { id, exists: !!d, data: () => d ? clone(d) : undefined, ref: new DocRef(c, id) }; };
  class DocRef {
    constructor(c, id) { this.id = id; this._c = c; this.parent = { id: c }; }
    async get() { countReads(this._c + '/doc', 1); return snapDoc(this._c, this.id); }
    async set(data, opt) { col(this._c).set(this.id, apply(col(this._c).get(this.id), data, opt && opt.merge)); window.__WRITES = (window.__WRITES || 0) + 1; }
    async update(data) { if (!col(this._c).has(this.id)) throw new Error('update missing ' + this._c + '/' + this.id); col(this._c).set(this.id, apply(col(this._c).get(this.id), data, true)); window.__WRITES = (window.__WRITES || 0) + 1; }
    async delete() { col(this._c).delete(this.id); }
  }
  const cmpVal = (a, b) => {
    const av = a instanceof Timestamp ? a.seconds * 1e9 + a.nanoseconds : a;
    const bv = b instanceof Timestamp ? b.seconds * 1e9 + b.nanoseconds : b;
    return av < bv ? -1 : av > bv ? 1 : 0;
  };
  const matches = (d, [f, op, v]) => {
    const x = d[f];
    if (op === '==') return x === v;
    if (op === 'in') return v.includes(x);
    if (x === undefined || x === null) return false;
    if ((v instanceof Timestamp) !== (x instanceof Timestamp)) return false;
    if (op === '>') return cmpVal(x, v) > 0;
    if (op === '>=') return cmpVal(x, v) >= 0;
    if (op === '<') return cmpVal(x, v) < 0;
    return true;
  };
  const query = (c, filters, order, lim) => ({
    where: (f, op, v) => query(c, [...filters, [f, op, v]], order, lim),
    orderBy: (f, dir) => query(c, filters, [f, dir], lim),
    limit: (n) => query(c, filters, order, n),
    get: async () => {
      if (window.__REQUIRE_INDEX && filters.some(f => f[1] === '==') && filters.some(f => f[1] === '>')) {
        const e = new Error('The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/x/firestore/indexes?create_composite=' + c);
        e.code = 'failed-precondition'; throw e;
      }
      let rows = [...col(c).entries()].filter(([id, d]) => filters.every(f => matches(d, f)));
      if (order) rows.sort((a, b) => { const r = cmpVal(a[1][order[0]] || 0, b[1][order[0]] || 0); return order[1] === 'desc' ? -r : r; });
      if (lim) rows = rows.slice(0, lim);
      const docs = rows.map(([id]) => snapDoc(c, id));
      countReads(c, Math.max(1, docs.length));
      return { docs, size: docs.length, empty: !docs.length };
    },
    doc: (id) => new DocRef(c, id || ('auto' + Math.random().toString(36).slice(2))),
    add: async (data) => { const id = 'auto' + Math.random().toString(36).slice(2); col(c).set(id, apply(null, data)); return new DocRef(c, id); }
  });
  class Batch {
    constructor() { this.ops = []; }
    set(r, d, o) { this.ops.push(() => r.set(d, o)); return this; }
    update(r, d) { this.ops.push(() => r.update(d)); return this; }
    delete(r) { this.ops.push(() => r.delete()); return this; }
    async commit() { for (const f of this.ops) await f(); }
  }
  class Tx {
    constructor() { this.ops = []; }
    get(r) { return r.get(); }
    set(r, d, o) { this.ops.push(() => r.set(d, o)); return this; }
    update(r, d) { this.ops.push(() => r.update(d)); return this; }
    delete(r) { this.ops.push(() => r.delete()); return this; }
  }
  const fs = {
    settings() {},
    collection: (c) => query(c, [], null, null),
    batch: () => new Batch(),
    runTransaction: async (fn) => { const tx = new Tx(); const res = await fn(tx); for (const f of tx.ops) await f(); return res; }
  };
  const user = seed.user ? { uid: seed.user.uid, email: seed.user.email, getIdToken: async () => 'TEST_TOKEN', delete: async () => {} } : null;
  const authObj = {
    currentUser: user,
    onAuthStateChanged: (cb) => { setTimeout(() => cb(authObj.currentUser), 0); return () => {}; },
    signOut: async () => { authObj.currentUser = null; window.__SIGNED_OUT = true; },
    setPersistence: async () => {}, signInWithEmailAndPassword: async () => ({ user }), createUserWithEmailAndPassword: async () => ({ user })
  };
  const firestoreFn = () => fs; firestoreFn.FieldValue = FieldValue; firestoreFn.Timestamp = Timestamp;
  const authFn = () => authObj; authFn.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session' } };
  // named secondary apps (e.g. 'sawee-refer') get their own store from __SEED.referCollections
  const makeNamed = (cfg, name) => {
    const rstore = {}; const rcol = (n) => (rstore[n] = rstore[n] || new Map());
    Object.entries((window.__SEED || {}).referCollections || {}).forEach(([c, docs]) => Object.entries(docs).forEach(([id, d]) => rcol(c).set(id, d)));
    window.__REFER_STORE = rstore;
    const rq = (c, filters, lim) => ({
      where: (f, op, v) => rq(c, [...filters, [f, op, v]], lim), limit: (n) => rq(c, filters, n),
      get: async () => {
        if ((window.__SEED || {}).referDenyUnauth && !app._auth.currentUser) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
        let rows = [...rcol(c).entries()].filter(([id, d]) => filters.every(([f, op, v]) => d[f] === v)); if (lim) rows = rows.slice(0, lim);
        const docs = rows.map(([id, d]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(d)) })); return { docs, size: docs.length };
      }
    });
    const app = { name, options: cfg, _auth: { currentUser: null, signInAnonymously: async () => { if ((window.__SEED || {}).referAnonDisabled) { const e = new Error('disabled'); e.code = 'auth/operation-not-allowed'; throw e; } app._auth.currentUser = { uid: 'anon' }; } },
      firestore: () => ({ collection: (c) => rq(c, [], null) }), auth: () => app._auth, delete: async () => { window.firebase.apps = window.firebase.apps.filter(a => a !== app); } };
    return app;
  };
  window.firebase = { apps: [], initializeApp(cfg, name) { if (name) { const a = makeNamed(cfg, name); this.apps.push(a); return a; } this.apps.push({ name: '[DEFAULT]' }); }, firestore: firestoreFn, auth: authFn };
})();
