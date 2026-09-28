const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('../helpers/app');

describe('M1 — Đăng nhập Google', () => {
  let t;
  before(async () => { t = await createTestApp(); });
  after(async () => { await t.close(); });

  const loginWith = async (token) => t.app.inject({ method: 'POST', url: '/api/auth/google', payload: { id_token: token } });
  const code = (res) => res.json().error?.code;

  test('US-T01 email vimaru.edu.vn hợp lệ → 200, có cookie sid', async () => {
    const res = await loginWith(await t.google.sign({ email: 'abc@vimaru.edu.vn' }));
    assert.equal(res.statusCode, 200);
    const cookie = [].concat(res.headers['set-cookie']).find((c) => c.startsWith('sid='));
    assert.ok(cookie, 'thiếu cookie sid');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.equal(res.json().user.email, 'abc@vimaru.edu.vn');
  });

  test('US-T02 email @gmail.com → 403 DOMAIN_NOT_ALLOWED', async () => {
    const res = await loginWith(await t.google.sign({ email: 'abc@gmail.com', hd: undefined }));
    assert.equal(res.statusCode, 403);
    assert.equal(code(res), 'DOMAIN_NOT_ALLOWED');
  });

  test('US-T03 email @sv.vimaru.edu.vn (tên miền con) → 403 DOMAIN_NOT_ALLOWED', async () => {
    const res = await loginWith(await t.google.sign({ email: 'abc@sv.vimaru.edu.vn', hd: 'sv.vimaru.edu.vn' }));
    assert.equal(res.statusCode, 403);
    assert.equal(code(res), 'DOMAIN_NOT_ALLOWED');
  });

  test('US-T04 email abc@vimaru.edu.vn.evil.com → 403 DOMAIN_NOT_ALLOWED', async () => {
    const res = await loginWith(await t.google.sign({ email: 'abc@vimaru.edu.vn.evil.com', hd: 'vimaru.edu.vn' }));
    assert.equal(res.statusCode, 403);
    assert.equal(code(res), 'DOMAIN_NOT_ALLOWED');
  });

  test('US-T05 email_verified = false → 403 EMAIL_NOT_VERIFIED', async () => {
    const res = await loginWith(await t.google.sign({ email: 'abc@vimaru.edu.vn', email_verified: false }));
    assert.equal(res.statusCode, 403);
    assert.equal(code(res), 'EMAIL_NOT_VERIFIED');
  });

  test('US-T06 token sai chữ ký, sai aud, hết hạn → 401 INVALID_TOKEN', async () => {
    const wrongSig = await t.google.signWithWrongKey({ email: 'abc@vimaru.edu.vn' });
    const wrongAud = await t.google.sign({ email: 'abc@vimaru.edu.vn' }, { aud: 'someone-else.apps.googleusercontent.com' });
    const past = Math.floor(Date.now() / 1000) - 7200;
    const expired = await t.google.sign({ email: 'abc@vimaru.edu.vn' }, { iat: past, expiresIn: past + 60 });
    for (const [name, token] of [['sai chữ ký', wrongSig], ['sai aud', wrongAud], ['hết hạn', expired], ['rác', 'not-a-jwt']]) {
      const res = await loginWith(token);
      assert.equal(res.statusCode, 401, name);
      assert.equal(code(res), 'INVALID_TOKEN', name);
    }
  });

  test('US-T07 token Gmail không có claim hd, hoặc email trường nhưng thiếu hd → 403 DOMAIN_NOT_ALLOWED', async () => {
    const gmail = await loginWith(await t.google.sign({ email: 'someone@gmail.com', hd: undefined }));
    assert.equal(gmail.statusCode, 403);
    assert.equal(code(gmail), 'DOMAIN_NOT_ALLOWED');
    const noHd = await loginWith(await t.google.sign({ email: 'abc@vimaru.edu.vn', hd: undefined }));
    assert.equal(noHd.statusCode, 403);
    assert.equal(code(noHd), 'DOMAIN_NOT_ALLOWED');
  });

  test('US-T08 họ tên, email, ảnh lấy từ Google; đăng nhập lại với tên/ảnh mới → được cập nhật', async () => {
    const first = await t.login('profile@vimaru.edu.vn', { name: 'Tên Cũ', picture: 'https://lh3.googleusercontent.com/a/old' });
    assert.equal(first.body.user.name, 'Tên Cũ');
    assert.equal(first.body.user.avatar_url, 'https://lh3.googleusercontent.com/a/old');

    const second = await t.login('profile@vimaru.edu.vn', { name: 'Tên Mới', picture: 'https://lh3.googleusercontent.com/a/new' });
    assert.equal(second.body.user.id, first.body.user.id);
    const me = (await t.req('GET', '/api/me', second.cookie)).json();
    assert.equal(me.name, 'Tên Mới');
    assert.equal(me.email, 'profile@vimaru.edu.vn');
    assert.equal(me.avatar_url, 'https://lh3.googleusercontent.com/a/new');
  });

  test('US-T27 gọi GET /me không có cookie → 401 UNAUTHENTICATED', async () => {
    const res = await t.req('GET', '/api/me');
    assert.equal(res.statusCode, 401);
    assert.equal(code(res), 'UNAUTHENTICATED');
    const bogus = await t.req('GET', '/api/me', 'sid=khong-ton-tai');
    assert.equal(bogus.statusCode, 401);
    assert.equal(code(bogus), 'UNAUTHENTICATED');
  });
});
