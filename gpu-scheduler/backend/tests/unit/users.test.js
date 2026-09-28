const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveUsername } = require('../../src/users/username');
const { generatePassword, PASSWORD_ALPHABET } = require('../../src/users/password');

test('US-T09 VietNH@vimaru.edu.vn → username vietnh', () => {
  assert.equal(deriveUsername('VietNH@vimaru.edu.vn'), 'vietnh');
});

test('US-T17 sinh 10.000 mật khẩu không trùng, dài 16, đúng bộ ký tự', () => {
  const seen = new Set();
  for (let i = 0; i < 10_000; i++) {
    const p = generatePassword(16);
    assert.equal(p.length, 16);
    for (const ch of p) assert.ok(PASSWORD_ALPHABET.includes(ch), `ký tự lạ: ${ch}`);
    seen.add(p);
  }
  assert.equal(seen.size, 10_000);
});
