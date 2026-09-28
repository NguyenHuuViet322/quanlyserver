// REQ-CT-10: cấu hình PermitOpen riêng cho từng user — docs/10-design/ssh.md
const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults: cfg } = require('../../src/config');
const { renderSshdUsers } = require('../../src/system/sshd');

test('CT-T18 mỗi user active/locked có Match User với đúng 200 mục PermitOpen trong dải; pending/deleted không có', () => {
  const users = [
    { username: 'vietnh', status: 'active', slot_index: 1 },
    { username: 'hoanglm', status: 'locked', slot_index: 30 },
    { username: 'moi', status: 'pending', slot_index: null },
    { username: 'daxoa', status: 'deleted', slot_index: null },
  ];
  const conf = renderSshdUsers(users, cfg);
  const blocks = [...conf.matchAll(/^Match User (\S+)\n\s+PermitOpen (.+)$/gm)].map((m) => ({ user: m[1], open: m[2].trim().split(/\s+/) }));
  assert.deepEqual(blocks.map((b) => b.user), ['vietnh', 'hoanglm']);

  const expect = (from) => {
    const out = [];
    for (let p = from; p < from + 100; p++) out.push(`localhost:${p}`, `127.0.0.1:${p}`);
    return out;
  };
  assert.deepEqual(blocks[0].open, expect(10000));
  assert.deepEqual(blocks[1].open, expect(12900));
  for (const b of blocks) assert.equal(b.open.length, 200);
  // Không có dòng nào khác ngoài chú thích, Match User, PermitOpen
  for (const line of conf.split('\n').filter(Boolean)) {
    assert.match(line, /^(#.*|Match User [a-z][a-z0-9._-]*|\s+PermitOpen( (localhost|127\.0\.0\.1):\d+)+)$/, line);
  }
});
