/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const form = fields => { const result = new FormData(); for (const [key, value] of Object.entries(fields)) result.set(key, value); return result; };
function setup(options = {}) {
  const user = Object.hasOwn(options, 'user') ? options.user : { id: 'admin-id', email: 'admin@columbia.edu', user_metadata: { is_superadmin: true } };
  const profile = Object.hasOwn(options, 'profile') ? options.profile : { id: 'admin-id', first_name: 'Admin', last_name: 'User', is_superadmin: true };
  const tables = { profiles: options.profiles ?? (profile ? [profile] : []), captions: options.captions ?? [], caption_votes: options.ratings ?? [], ...options.tables };
  const calls = { factories: 0, queries: [], writes: [], rpcs: [], ai: [], refreshed: [], identities: 0 };
  const session = { auth: {
    getUser: async () => { calls.identities++; return { data: { user }, error: options.authError ?? null }; },
    exchangeCodeForSession: async () => ({ error: options.exchangeError ?? null }),
    signOut: async () => ({ error: null }),
  }, rpc: async (name, args) => {
    calls.rpcs.push({ name, args });
    if (name !== 'admin_delete_media') throw Error('Unexpected RPC');
    if (options.rpcError || options.writeError) return { data: null, error: options.rpcError ?? options.writeError };
    if (options.rpcThrows) throw Error('Network failure');
    if (options.revokeBeforeRPC) profile.is_superadmin = false;
    if (!user || profile?.is_superadmin !== true) return { data: null, error: { code: '42501' } };
    if (options.zeroWrite) return { data: null, error: null };
    const row = tables.captions.find(row => String(row.id) === args.p_media_id);
    if (!row) return { data: null, error: null };
    const votes = tables.caption_votes.filter(vote => String(vote.caption_id) === args.p_media_id);
    votes.forEach(vote => tables.caption_votes.splice(tables.caption_votes.indexOf(vote), 1));
    tables.captions.splice(tables.captions.indexOf(row), 1);
    return { data: { id: String(row.id), deleted_ratings: String(votes.length) }, error: null };
  } };
  const db = { from(table) {
    const request = { table, operation: 'read', filters: [] }; calls.queries.push(request);
    let projection = '*'; let head = false; let from = 0; let to = Infinity; let ordering;
    const query = {
      select(fields, config = {}) { projection = fields; head = config.head; return query; },
      not(key, op, value) { if (op !== 'is' || value !== null) throw Error('Unexpected not filter'); request.filters.push(row => row[key] != null); return query; },
      neq(key, value) { request.filters.push(row => row[key] != null && String(row[key]) !== String(value)); return query; },
      eq(key, value) { request.filters.push(row => String(row[key]) === String(value)); return query; },
      gt(key, value) { request.filters.push(row => (/^[0-9]+$/.test(String(value)) ? BigInt(row[key]) > BigInt(value) : String(row[key]) > String(value))); return query; },
      in(key, values) { request.filters.push(row => values.map(String).includes(String(row[key]))); return query; },
      or(filter) { request.or = filter; const parts = filter.split(',').map(part => part.split(/\.(ilike|eq)\./)); request.filters.push(row => parts.some(([key, op, value]) => op === 'eq' ? String(row[key] ?? '') === value : String(row[key] ?? '').toLowerCase().includes(value.replaceAll('%', '').toLowerCase()))); return query; },
      order(key, config = {}) { ordering = [key, config.ascending !== false]; return query; },
      range(start, end) { from = start; to = end; return query; },
      limit(count) { to = count - 1; return query; },
      insert(value) { request.operation = 'insert'; request.patch = value; return query; },
      update(value) { request.operation = 'update'; request.patch = value; return query; },
      delete() { request.operation = 'delete'; return query; },
      single: () => execute(true), maybeSingle: () => execute(true),
      then(resolve, reject) { return execute(false).then(resolve, reject); },
    };
    async function execute(single) {
      if (!tables[table]) throw Error('Invented table: ' + table);
      const isRole = table === 'profiles' && projection.includes('is_superadmin') && projection !== 'id,first_name,last_name,avatar_url,is_superadmin';
      if (isRole && options.roleError) return { data: null, error: options.roleError };
      if (options.readError && !isRole && request.operation === 'read') return { data: null, error: options.readError };
      let rows = tables[table].filter(row => request.filters.every(filter => filter(row)));
      if (request.operation !== 'read') {
        calls.writes.push(request);
        if (options.writeError) return { data: null, error: options.writeError };
        if (options.zeroWrite) return { data: null, error: null };
        if (request.operation === 'insert') { rows = [{ id: String(1 + Math.max(0, ...tables[table].map(row => Number(row.id)))), ...request.patch }]; tables[table].push(...rows); }
        if (request.operation === 'update') rows.forEach(row => Object.assign(row, request.patch));
        if (request.operation === 'delete') {
          if (tables.caption_votes.some(vote => rows.some(row => String(row.id) === String(vote.caption_id)))) return { data: null, error: { code: '23503' } };
          rows.forEach(row => tables[table].splice(tables[table].indexOf(row), 1));
        }
      }
      const count = rows.length;
      if (ordering) { const [key, ascending] = ordering; rows.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (ascending ? 1 : -1)); }
      rows = rows.slice(from, Math.min(to + 1, from + (options.apiCap ?? 1000)));
      const projected = rows.map(row => projection === '*' ? { ...row } : Object.fromEntries(projection.split(',').map(field => { const [key, cast] = field.split('::'); return [key, cast === 'text' && row[key] != null ? String(row[key]) : row[key]]; })));
      return { data: head ? null : single ? projected[0] ?? null : projected, error: null, count };
    }
    return query;
  } };
  const mocks = {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => session },
    '@supabase/supabase-js': { createClient: () => { calls.factories++; return db; } },
    'next/navigation': { redirect: path => { throw Error('REDIRECT:' + path); }, notFound: () => { throw Error('NOT_FOUND'); }, usePathname: () => '/admin', useRouter: () => ({ refresh() {}, replace() {}, push() {} }) },
    'next/cache': { revalidatePath: path => calls.refreshed.push(path) },
    'next/server': { NextResponse: { redirect: url => ({ url: String(url), headers: new Headers() }) } },
    '@google/genai': { GoogleGenAI: class { models = { generateContent: async request => { calls.ai.push(request); if (options.aiError) throw Error('Private provider details'); if (options.revokeDuringAI) profile.is_superadmin = false; return { text: options.aiOutput ?? JSON.stringify({ subject: null, message: 'A test-only generated caption.' }) }; } }; } },
    ...options.mocks,
  };
  const cache = new Map();
  function load(relative) {
    const file = path.isAbsolute(relative) ? relative : path.join(root, relative);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(compiled, { exports, URL, Headers, File, Uint8Array, console, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: options.noServiceKey ? undefined : 'test-only-server-key', GEMINI_API_KEY: options.noAIKey ? undefined : 'test-only-ai-key' } }, require(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/')) return load(['.ts', '.tsx'].map(ext => path.join(root, id.slice(2) + ext)).find(fs.existsSync));
      return require(id);
    } }, { filename: file });
    return exports;
  }
  return { calls, tables, profile, db, load, actions: load('app/admin/media/actions.ts'), data: load('lib/data.ts'), auth: load('lib/auth.ts') };
}
module.exports = { setup, form };
