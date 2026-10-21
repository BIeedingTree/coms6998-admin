/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createBrowserClient } = require('@supabase/ssr');
const root = path.resolve(__dirname, '..');
const project = 'https://oauth-regression.supabase.co';
const publicKey = 'sb_publishable_test_only';

function loadModules(env, mocks = {}) {
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const exports = {}; cache.set(name, exports);
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(compiled, {
      exports, URL, process: { env }, window: { location: { origin: 'https://admin.example' } },
      require(id) {
        if (Object.hasOwn(mocks, id)) return mocks[id];
        if (id.startsWith('@/')) return load(['.ts', '.tsx'].map(ext => id.slice(2) + ext).find(file => fs.existsSync(path.join(root, file))));
        return require(id);
      },
    });
    return exports;
  }
  return load;
}
const configEnv = suffix => ({ NEXT_PUBLIC_SUPABASE_URL: project + suffix, NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey });

for (const suffix of ['', '/', '/rest/v1', '/rest/v1/']) {
  test('actual Google button and SDK use the Auth endpoint for configured suffix ' + JSON.stringify(suffix), async () => {
    const cookies = new Map();
    let result; let suppliedUrl; let suppliedKey; let client;
    const load = loadModules(configEnv(suffix), {
      react: { useState: initial => [initial, () => {}] },
      '@supabase/ssr': { createBrowserClient(url, key) {
        suppliedUrl = url; suppliedKey = key;
        client = createBrowserClient(url, key, {
          isSingleton: false,
          cookies: {
            getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
            setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
          },
          global: { fetch: () => { throw Error('OAuth URL generation must not make a network request'); } },
        });
        const signIn = client.auth.signInWithOAuth.bind(client.auth);
        client.auth.signInWithOAuth = async input => { result = await signIn(input); return result; };
        return client;
      } },
    });
    const tree = load('components/login.tsx').LoginButton();
    const button = tree.props.children.find(child => child?.type === 'button');
    await button.props.onClick();
    assert.ok(result, 'button must call the Supabase SDK');
    assert.equal(result.error, null);
    assert.equal(suppliedUrl, project); assert.equal(suppliedKey, publicKey);
    const url = new URL(result.data.url);
    assert.equal(url.origin, project);
    assert.equal(url.pathname, '/auth/v1/authorize');
    assert.equal(url.searchParams.get('provider'), 'google');
    assert.equal(url.searchParams.get('redirect_to'), 'https://admin.example/auth/callback');
    assert.equal(url.searchParams.get('prompt'), 'select_account');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.ok([...cookies.keys()].some(key => key.includes('code-verifier')), 'PKCE verifier persists for callback exchange');
    assert.equal(url.searchParams.has('apikey'), false, 'do not patch a wrong endpoint by putting keys in OAuth URLs');
    await client.auth.stopAutoRefresh();
  });
}

test('SSR client uses the same normalized URL and public key', async () => {
  let captured;
  const load = loadModules(configEnv('/rest/v1/'), {
    'server-only': {},
    'next/headers': { cookies: async () => ({ getAll: () => [], set: () => {} }) },
    '@supabase/ssr': { createServerClient: (url, key) => { captured = { url, key }; return captured; } },
  });
  await load('lib/supabase/server.ts').createClient();
  assert.deepEqual(captured, { url: project, key: publicKey });
});

test('session-refresh proxy uses the same normalized URL and public key', async () => {
  let captured;
  const load = loadModules(configEnv('/rest/v1/'), {
    'next/server': { NextResponse: { next: () => ({ headers: new Headers() }) } },
    '@supabase/ssr': { createServerClient: (url, key) => { captured = { url, key }; return { auth: { getUser: async () => ({ data: { user: { id: 'test' } }, error: null }) } }; } },
  });
  await load('proxy.ts').proxy({ cookies: { getAll: () => [] }, nextUrl: { pathname: '/admin' } });
  assert.deepEqual(captured, { url: project, key: publicKey });
});

test('privileged client uses the normalized URL and still verifies superadmin', async () => {
  let suppliedUrl; let roleChecks = 0;
  const load = loadModules({ ...configEnv('/rest/v1/'), SUPABASE_SERVICE_ROLE_KEY: 'server-only-test' }, {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test' } }, error: null }) } }) },
    '@supabase/supabase-js': { createClient: url => {
      suppliedUrl = url;
      return { from: table => {
        assert.equal(table, 'profiles');
        return { select: () => ({ eq: (field, id) => {
          assert.equal(field, 'id'); assert.equal(id, 'test'); roleChecks++;
          return { maybeSingle: async () => ({ data: { is_superadmin: false }, error: null }) };
        } }) };
      } };
    } },
    'next/navigation': {},
  });
  assert.equal((await load('lib/auth.ts').getAdminAccess()).status, 'denied');
  assert.equal(suppliedUrl, project); assert.equal(roleChecks, 1);
});

for (const url of ['', 'not-a-url', project + '/rest/v1/captions', project + '/auth/v1', project + '?apikey=do-not-log', 'https://name:do-not-log@example.com', 'http://public.example']) {
  test('invalid project URL fails without disclosing its value: case ' + String(url.length), () => {
    const config = loadModules({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey })('lib/supabase/config.ts');
    assert.throws(() => config.getSupabasePublicConfig(), error => error.message.includes('Supabase') && !error.message.includes('do-not-log'));
  });
}

test('missing key fails before SDK initialization', () => {
  const config = loadModules({ NEXT_PUBLIC_SUPABASE_URL: project })('lib/supabase/config.ts');
  assert.throws(() => config.getSupabasePublicConfig(), /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

test('configuration trims whitespace and preserves local development URLs', () => {
  const config = loadModules({ NEXT_PUBLIC_SUPABASE_URL: ' http://localhost:54321/rest/v1/ ', NEXT_PUBLIC_SUPABASE_ANON_KEY: ' '+publicKey+' ' })('lib/supabase/config.ts').getSupabasePublicConfig();
  assert.equal(config.url, 'http://localhost:54321'); assert.equal(config.key, publicKey);
});
