const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('../helpers/app');

// Key ed25519 hợp lệ (blob đúng định dạng), khác nhau để fingerprint khác nhau
function edKey(seed, comment = '') {
  const type = Buffer.from('ssh-ed25519');
  const pub = Buffer.alloc(32, seed);
  const blob = Buffer.concat([Buffer.from([0, 0, 0, type.length]), type, Buffer.from([0, 0, 0, 32]), pub]);
  return `ssh-ed25519 ${blob.toString('base64')}${comment ? ' ' + comment : ''}`;
}
const KEY_A = edKey(1, 'vietnh@laptop');
const KEY_B = edKey(2, 'may-lab@vmu');
const KEY_C = edKey(3);

describe('M1 — Mật khẩu SSH & SSH key', () => {
  let t;
  let user; // { cookie, username }
  beforeEach(async () => {
    t = await createTestApp();
    const admin = await t.adminCookie();
    const { body } = await t.login('vietnh@vimaru.edu.vn');
    const res = await t.req('POST', `/api/admin/users/${body.user.id}/approve`, admin);
    assert.equal(res.statusCode, 200, res.body);
    user = { cookie: (await t.login('vietnh@vimaru.edu.vn')).cookie, username: 'vietnh' };
  });
  afterEach(async () => { await t.close(); });

  const code = (res) => res.json().error?.code;

  test('US-T16 lần đăng nhập đầu sau khi được duyệt → mật khẩu 16 ký tự, khớp mật khẩu Linux, phải đổi khi SSH', async () => {
    const res = await t.req('GET', '/api/me/password', user.cookie);
    assert.equal(res.statusCode, 200);
    const { password } = res.json();
    assert.equal(typeof password, 'string');
    assert.equal(password.length, 16);
    const sys = t.system.state.users.get('vietnh');
    assert.equal(sys.password, password);
    assert.equal(sys.mustChange, true);
    // Không lưu bản rõ trong CSDL
    const { rows } = await t.db.query(`SELECT row_to_json(u)::text AS j FROM users u`);
    for (const r of rows) assert.ok(!r.j.includes(password), 'mật khẩu bản rõ nằm trong bảng users');
  });

  test('US-T18 sau POST /me/password/ack → GET /me/password trả 404 NOT_FOUND', async () => {
    assert.equal((await t.req('GET', '/api/me/password', user.cookie)).statusCode, 200);
    const ack = await t.req('POST', '/api/me/password/ack', user.cookie);
    assert.equal(ack.statusCode, 204);
    const again = await t.req('GET', '/api/me/password', user.cookie);
    assert.equal(again.statusCode, 404);
    assert.equal(code(again), 'NOT_FOUND');
    // Đăng nhập lại cũng không thấy
    const relogin = await t.login('vietnh@vimaru.edu.vn');
    assert.equal((await t.req('GET', '/api/me/password', relogin.cookie)).statusCode, 404);
  });

  test('US-T20 response chứa mật khẩu có Cache-Control: no-store', async () => {
    const get = await t.req('GET', '/api/me/password', user.cookie);
    assert.equal(get.statusCode, 200);
    assert.match(get.headers['cache-control'] || '', /no-store/);
    const reset = await t.req('POST', '/api/me/password/reset', user.cookie);
    assert.equal(reset.statusCode, 200);
    assert.match(reset.headers['cache-control'] || '', /no-store/);
    assert.equal(reset.json().password.length, 16);
  });

  test('US-T34 tên gợi nhớ của SSH key: có name → dùng name; không có → chú thích cuối key; không chú thích → loại key; name > 60 → 400', async () => {
    const add = (body) => t.req('POST', '/api/me/ssh-keys', user.cookie, body);
    const r1 = await add({ name: 'Laptop Macbook Pro', public_key: KEY_A });
    assert.equal(r1.statusCode, 201, r1.body);
    assert.equal(r1.json().name, 'Laptop Macbook Pro');
    const r2 = await add({ public_key: KEY_B });
    assert.equal(r2.json().name, 'may-lab@vmu');
    const r3 = await add({ public_key: KEY_C });
    assert.equal(r3.json().name, 'ssh-ed25519');
    const long = await add({ name: 'x'.repeat(61), public_key: KEY_A });
    assert.equal(long.statusCode, 400);
    assert.equal(code(long), 'VALIDATION_ERROR');
    const list = (await t.req('GET', '/api/me/ssh-keys', user.cookie)).json();
    assert.deepEqual(list.map((k) => k.name), ['Laptop Macbook Pro', 'may-lab@vmu', 'ssh-ed25519']);
  });

  test('US-T28 thêm SSH key sai định dạng → 400 INVALID_SSH_KEY', async () => {
    for (const bad of ['not-a-key', 'ssh-ed25519', 'ssh-ed25519 !!!notbase64!!!', 'ssh-rsa AAAA\nssh-ed25519 AAAA']) {
      const res = await t.req('POST', '/api/me/ssh-keys', user.cookie, { public_key: bad });
      assert.equal(res.statusCode, 400, JSON.stringify(bad));
      assert.equal(code(res), 'INVALID_SSH_KEY', JSON.stringify(bad));
    }
    assert.deepEqual(t.system.state.users.get('vietnh').keys, []);
  });
});
