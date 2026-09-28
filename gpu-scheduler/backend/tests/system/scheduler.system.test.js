// Test system của M3: Docker THẬT trên server staging (XFS pquota, /data/users, image có sh + tzdata).
// Chạy: VMU_SYSTEM=1 VMU_TEST_IMAGE=<image cho phép> npm run test:system
// Sau khi pass: lưu output vào reports/system/<ID>.log rồi `node tools/sync-ticks.js --manual <ID>`.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createTestApp } = require('../helpers/app');
const { createDocker } = require('../../src/container/docker');
const { defaults } = require('../../src/config');
const { runTick } = require('../../src/scheduler/tick');

const ENABLED = process.env.VMU_SYSTEM === '1';
const IMAGE = process.env.VMU_TEST_IMAGE || 'vmu/pytorch:2.8-cuda12.8';
const vn = (s) => `${s}+07:00`;

describe('M3 — Scheduler (system, Docker thật)', { skip: !ENABLED && 'đặt VMU_SYSTEM=1 để chạy trên server' }, () => {
  let t;
  let docker;
  let cfg;
  let A;

  beforeEach(async () => {
    t = await createTestApp({ now: vn('2026-10-05T08:50:00') });
    docker = createDocker();
    cfg = { ...defaults, logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vmu-logs-')) };
    const admin = await t.adminCookie('quantri@vimaru.edu.vn');
    await t.db.query('INSERT INTO images (name) VALUES ($1)', [IMAGE]);
    const { body } = await t.login('systest@vimaru.edu.vn');
    const res = await t.req('POST', `/api/admin/users/${body.user.id}/approve`, admin);
    A = { ...res.json().user, cookie: (await t.login('systest@vimaru.edu.vn')).cookie };
  });
  afterEach(async () => {
    for (const c of await docker.listManaged()) await docker.rm(c.name).catch(() => {});
    await t.close();
    fs.rmSync(cfg.logDir, { recursive: true, force: true });
  });

  const tick = () => runTick({ db: t.db, docker, clock: t.clock, cfg });
  async function book() {
    const res = await t.req('POST', '/api/bookings', A.cookie, {
      start: vn('2026-10-05T09:00:00'), end: vn('2026-10-05T11:00:00'), use_gpu: false, image: IMAGE,
    });
    assert.equal(res.statusCode, 201, res.body);
    return res.json();
  }
  const status = async (id) => (await t.db.query('SELECT status FROM bookings WHERE id = $1', [id])).rows[0].status;

  test('SC-T01 ca đến giờ → container được tạo trong ≤ 60 giây, running', async () => {
    const b = await book();
    t.clock.set(vn('2026-10-05T09:00:00'));
    const started = Date.now();
    await tick();
    assert.ok(Date.now() - started <= 60_000);
    assert.equal(await status(b.id), 'running');
    assert.equal((await docker.inspect(`vmu-bk-${b.id}`))?.running, true);
  });

  test('SC-T04 container bỏ qua SIGTERM → bị kill sau ~120 giây, ca completed', { timeout: 200_000 }, async () => {
    const b = await book(); // lệnh chính `sleep infinity` chạy như PID 1 nên không xử lý SIGTERM
    t.clock.set(vn('2026-10-05T09:00:00'));
    await tick();
    t.clock.set(vn('2026-10-05T11:00:00'));
    const started = Date.now();
    await tick();
    const secs = (Date.now() - started) / 1000;
    assert.ok(secs >= 115 && secs <= 150, `dừng sau ${secs}s`);
    assert.equal(await status(b.id), 'completed');
  });

  test('SC-T14 trong container TZ = Asia/Ho_Chi_Minh, date +%z = +0700; cảnh báo ghi "11:00 (GMT+7)"', async () => {
    const b = await book();
    t.clock.set(vn('2026-10-05T09:00:00'));
    await tick();
    const out = execFileSync('docker', ['exec', `vmu-bk-${b.id}`, 'sh', '-c', 'echo $TZ; date +%z'], { encoding: 'utf8' }).trim().split('\n');
    assert.deepEqual(out, ['Asia/Ho_Chi_Minh', '+0700']);
    t.clock.set(vn('2026-10-05T10:45:00'));
    await tick();
    const { rows } = await t.db.query(`SELECT message FROM notifications WHERE kind = 'END_WARNING'`);
    assert.match(rows[0].message, /11:00 \(GMT\+7\)/);
  });
});
