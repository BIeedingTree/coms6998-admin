import assert from 'node:assert/strict';
const origin = process.env.TEST_ORIGIN ?? 'http://127.0.0.1:3006';
for (const path of ['/admin', '/admin/users', '/admin/media', '/admin/media/new', '/admin/media/1', '/admin/ratings']) {
  const response = await fetch(origin + path, { redirect: 'manual' });
  assert.equal(response.status, 307, path);
  assert.equal(new URL(response.headers.get('location'), origin).pathname, '/login', path);
  console.log(`PASS ${path}: unauthenticated redirect`);
}
const login = await fetch(origin + '/login');
assert.equal(login.status, 200); assert.match(await login.text(), /Continue with Google/);
console.log('PASS /login: Google login renders');
const callback = await fetch(origin + '/auth/callback', { redirect: 'manual' });
assert.equal(callback.status, 307); assert.equal(new URL(callback.headers.get('location'), origin).pathname, '/login');
console.log('PASS /auth/callback: missing code rejected');
