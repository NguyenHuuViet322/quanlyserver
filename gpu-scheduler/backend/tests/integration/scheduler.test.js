const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTestApp } = require('../helpers/app');
const { createFakeDocker } = require('../helpers/fake-docker');
const { defaults } = require('../../src/config');
const { runTick, reconcile } = require('../../src/scheduler/tick');

const IMAGE = 'vmu/pytorch:2.8-cuda12.8';
const vn = (s) => `${s}+07:00`;

describe('M3 — Scheduler', () => {
  let t;
  let docker;
  let cfg;
  let A;
  let admin;

  // Đồng hồ: 05/10/2026 08:50 giờ VN; A có ca GPU 09:00–11:00
  beforeEach(async () => {
    t = await createTestApp({ now: vn('2026-10-05T08:50:00') });
    docker = createFakeDocker();
    cfg = { ...defaults, logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vmu-logs-')) };
    admin = await t.adminCookie('quantri@vimaru.edu.vn');
    await t.db.query('INSERT INTO images (name) VALUES ($1)', [IMAGE]);
    const { body } = await t.login('a@vimaru.edu.vn');
    const res = await t.req('POST', `/api/admin/users/${body.user.id}/approve`, admin);
    A = { ...res.json().user, cookie: (await t.login('a@vimaru.edu.vn')).cookie };
  });
  afterEach(async () => {
    await t.close();
    fs.rmSync(cfg.logDir, { recursive: true, force: true });
  });

  const env = () => ({ db: t.db, docker, clock: t.clock, cfg, host: { cpuThreads: 32 } });
  const tick = () => runTick(env());
  const code = (res) => res.json().error?.code;
  async function book(start = '2026-10-05T09:00:00', end = '2026-10-05T11:00:00', use_gpu = true) {
    const res = await t.req('POST', '/api/bookings', A.cookie, { start: vn(start), end: vn(end), use_gpu, image: IMAGE, ports: [10001] });
    assert.equal(res.statusCode, 201, res.body);
    return res.json();
  }
  const row = async (id) => (await t.db.query('SELECT * FROM bookings WHERE id = $1', [id])).rows[0];
  const notes = async (kind) => (await t.db.query('SELECT * FROM notifications WHERE kind = $1', [kind])).rows;
  async function started() {
    const b = await book();
    t.clock.set(vn('2026-10-05T09:00:10'));
    await tick();
    assert.equal((await row(b.id)).status, 'running');
    return b;
  }

  test('SC-T02 còn 15 phút → đúng 1 cảnh báo END_WARNING và 1 lần in ra terminal /dev/pts/* + log, dù chạy thêm 5 tick', async () => {
    const b = await started();
    t.clock.set(vn('2026-10-05T10:44:00'));
    await tick();
    assert.equal((await notes('END_WARNING')).length, 0);
    t.clock.set(vn('2026-10-05T10:45:00'));
    for (let i = 0; i < 5; i++) {
      await tick();
      t.clock.advance(60_000);
    }
    const w = await notes('END_WARNING');
    assert.equal(w.length, 1);
    assert.equal(w[0].booking_id, b.id);
    const execs = docker.calls.filter((c) => c[0] === 'exec');
    assert.equal(execs.length, 1);
    const script = execs[0][2].join(' ');
    assert.ok(script.includes('/dev/pts/'), script);
    assert.ok(script.includes('/proc/1/fd/1'), script);
    assert.ok(script.includes('11:00 (GMT+7)'), script);
  });

  test('SC-T03 hết giờ → docker stop -t 120, lưu log, docker rm, completed', async () => {
    const b = await started();
    t.clock.set(vn('2026-10-05T11:00:00'));
    await tick();
    const stop = docker.calls.find((c) => c[0] === 'stop');
    assert.deepEqual(stop, ['stop', `vmu-bk-${b.id}`, 120]);
    const ops = docker.calls.map((c) => c[0]);
    assert.ok(ops.lastIndexOf('logs') > ops.lastIndexOf('stop') && ops.lastIndexOf('rm') > ops.lastIndexOf('logs'), ops.join(','));
    assert.ok(!docker.containers.has(`vmu-bk-${b.id}`));
    const r = await row(b.id);
    assert.equal(r.status, 'completed');
    assert.equal(r.actual_end_at.toISOString(), '2026-10-05T04:00:00.000Z');
    assert.match(fs.readFileSync(path.join(cfg.logDir, `${b.id}.log`), 'utf8'), /khởi chạy/);
  });

  test('SC-T05 hai tick chạy chồng nhau → chỉ 1 lần docker run cho 1 ca', async () => {
    docker = createFakeDocker({ runDelayMs: 300 });
    const b = await book();
    t.clock.set(vn('2026-10-05T09:00:10'));
    const results = await Promise.all([tick(), tick(), tick()]);
    assert.equal(docker.runsOf(`vmu-bk-${b.id}`).length, 1);
    assert.equal(results.filter((r) => r.skipped).length, 2);
    await tick();
    assert.equal(docker.runsOf(`vmu-bk-${b.id}`).length, 1);
  });

  test('SC-T06 khởi động Scheduler khi còn container của ca completed → container bị dừng', async () => {
    const b = await started();
    await t.db.query(`UPDATE bookings SET status = 'completed' WHERE id = $1`, [b.id]);
    docker.addContainer('vmu-bk-999', 999); // container mồ côi, không có ca
    await reconcile(env());
    assert.ok(!docker.containers.has(`vmu-bk-${b.id}`));
    assert.ok(!docker.containers.has('vmu-bk-999'));
    assert.ok(docker.calls.some((c) => c[0] === 'stop' && c[1] === `vmu-bk-${b.id}`));
  });

  test('SC-T07 khởi động Scheduler khi ca running thiếu container → container được tạo lại', async () => {
    const b = await started();
    docker.containers.delete(`vmu-bk-${b.id}`); // mất container (vd server reboot)
    t.clock.set(vn('2026-10-05T09:30:00'));
    await reconcile(env());
    assert.ok(docker.containers.get(`vmu-bk-${b.id}`)?.running);
    assert.equal(docker.runsOf(`vmu-bk-${b.id}`).length, 2);
    assert.equal((await row(b.id)).status, 'running');
  });

  test('SC-T08 docker run lỗi → failed, có log lỗi, có thông báo START_FAILED', async () => {
    docker.failOn('run');
    const b = await book();
    t.clock.set(vn('2026-10-05T09:00:10'));
    await tick();
    const r = await row(b.id);
    assert.equal(r.status, 'failed');
    assert.equal(r.exit_reason, 'ERROR');
    assert.match(fs.readFileSync(path.join(cfg.logDir, `${b.id}.log`), 'utf8'), /image hỏng/);
    const n = await notes('START_FAILED');
    assert.equal(n.length, 1);
    assert.equal(n[0].user_id, A.id);
  });

  test('SC-T09 container tự thoát trước giờ → exited, EXITED, không tự khởi động lại', async () => {
    const b = await started();
    docker.exit(`vmu-bk-${b.id}`, { code: 1 });
    t.clock.set(vn('2026-10-05T09:10:00'));
    await tick();
    const r = await row(b.id);
    assert.equal(r.status, 'exited');
    assert.equal(r.exit_reason, 'EXITED');
    for (let i = 0; i < 3; i++) {
      t.clock.advance(60_000);
      await tick();
    }
    assert.equal(docker.runsOf(`vmu-bk-${b.id}`).length, 1);
    assert.equal((await row(b.id)).status, 'exited');
  });

  test('SC-T10 ca exited, chủ ca restart → docker run với tham số giống hệt lần đầu, running', async () => {
    const b = await started();
    const firstArgs = docker.runsOf(`vmu-bk-${b.id}`)[0][1];
    docker.exit(`vmu-bk-${b.id}`, { code: 1 });
    t.clock.set(vn('2026-10-05T09:10:00'));
    await tick();
    const res = await t.req('POST', `/api/bookings/${b.id}/restart`, A.cookie);
    assert.equal(res.statusCode, 202, res.body);
    assert.equal(res.json().status, 'starting');
    await tick();
    const runs = docker.runsOf(`vmu-bk-${b.id}`);
    assert.equal(runs.length, 2);
    assert.deepEqual(runs[1][1], firstArgs);
    assert.equal((await row(b.id)).status, 'running');
  });

  test('SC-T11 restart ca đang running hoặc đã quá end → 409 INVALID_STATE', async () => {
    const b = await started();
    const running = await t.req('POST', `/api/bookings/${b.id}/restart`, A.cookie);
    assert.equal(running.statusCode, 409);
    assert.equal(code(running), 'INVALID_STATE');
    await t.db.query(`UPDATE bookings SET status = 'exited' WHERE id = $1`, [b.id]);
    t.clock.set(vn('2026-10-05T11:00:00'));
    const late = await t.req('POST', `/api/bookings/${b.id}/restart`, A.cookie);
    assert.equal(late.statusCode, 409);
    assert.equal(code(late), 'INVALID_STATE');
  });

  test('SC-T12 Scheduler tắt suốt thời gian của ca, bật lại sau end → failed, không tạo container', async () => {
    const b = await book();
    t.clock.set(vn('2026-10-05T12:00:00'));
    await reconcile(env());
    assert.equal((await row(b.id)).status, 'failed');
    assert.equal(docker.calls.filter((c) => c[0] === 'run').length, 0);
  });

  test('SC-T13 ca 09:00–11:00 giờ VN chạy lúc 02:00Z, cảnh báo 03:45Z, dừng 04:00Z; không lệch 7 giờ', async () => {
    const b = await book();
    const name = `vmu-bk-${b.id}`;
    t.clock.set('2026-10-05T01:59:00Z');
    await tick();
    assert.equal(docker.runsOf(name).length, 0, 'chạy sớm');
    t.clock.set('2026-10-05T02:00:30Z');
    await tick();
    assert.equal(docker.runsOf(name).length, 1, 'không chạy đúng giờ');
    t.clock.set('2026-10-05T03:44:00Z');
    await tick();
    assert.equal((await notes('END_WARNING')).length, 0, 'cảnh báo sớm');
    t.clock.set('2026-10-05T03:45:00Z');
    await tick();
    const w = await notes('END_WARNING');
    assert.equal(w.length, 1);
    assert.match(w[0].message, /11:00 \(GMT\+7\)/);
    t.clock.set('2026-10-05T03:59:30Z');
    await tick();
    assert.equal((await row(b.id)).status, 'running', 'dừng sớm');
    t.clock.set('2026-10-05T04:00:00Z');
    await tick();
    assert.equal((await row(b.id)).status, 'completed');
  });

  test('MN-T04 container bị OOM → exited, exit_reason OOM, có thông báo OOM', async () => {
    const b = await started();
    docker.exit(`vmu-bk-${b.id}`, { oom: true });
    t.clock.set(vn('2026-10-05T09:20:00'));
    await tick();
    const r = await row(b.id);
    assert.equal(r.status, 'exited');
    assert.equal(r.exit_reason, 'OOM');
    assert.equal((await notes('OOM')).length, 1);
    const api = await t.req('GET', `/api/bookings/${b.id}`, A.cookie);
    assert.equal(api.json().exit_reason, 'OOM');
  });
});
