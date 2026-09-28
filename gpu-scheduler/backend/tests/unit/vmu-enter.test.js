// REQ-CT-08, REQ-CT-09: script deploy/vmu-enter (ForceCommand của sshd).
// Chạy script thật bằng bash; rsync, scp, sftp-server, sudo được thay bằng bản giả ghi lại tham số.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '../../../deploy/vmu-enter');

// Đường dẫn dạng bash. Trên Windows (Git Bash): C:\x → /c/x, vì PATH dùng dấu ':' để ngăn cách.
function sh(p) {
  const posix = process.platform === 'win32' ? p.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`) : p;
  return posix.split(path.sep).join('/');
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vmu-enter-'));
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'calls.log');
  fs.mkdirSync(bin);
  // Bản giả: ghi một dòng "tên|thư mục hiện tại|tham số 1|tham số 2|…"
  for (const name of ['rsync', 'scp', 'sftp-server', 'sudo', 'sh', 'bash']) {
    const body = ['#!/bin/bash', `( IFS='|'; echo "${name}|$(pwd)|$*" ) >> "${sh(log)}"`, ''].join('\n');
    fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 });
  }
  const me = spawnSync('bash', ['-c', 'id -un'], { encoding: 'utf8' }).stdout.trim();
  fs.mkdirSync(path.join(root, 'data', 'users', me), { recursive: true });
  return { root, bin, log, me };
}

function enter(env, originalCommand) {
  const e = {
    ...process.env,
    VMU_ENTER_PATH: sh(env.bin),
    VMU_DATA_ROOT: sh(path.join(env.root, 'data')),
    VMU_SFTP_SERVER: `${sh(env.bin)}/sftp-server`,
  };
  if (originalCommand === undefined) delete e.SSH_ORIGINAL_COMMAND;
  else e.SSH_ORIGINAL_COMMAND = originalCommand;
  fs.rmSync(env.log, { force: true });
  const r = spawnSync('bash', [sh(SCRIPT)], { env: e, encoding: 'utf8' });
  const calls = fs.existsSync(env.log)
    ? fs.readFileSync(env.log, 'utf8').trim().split('\n').map((l) => l.split('|'))
    : [];
  return { status: r.status, stderr: r.stderr, calls };
}

test('CT-T17 lệnh chép file chạy trên máy chủ, không qua shell; lệnh khác chuyển nguyên cho vmu-exec', () => {
  const env = setup();
  try {
    const inHome = (c) => c[1].endsWith(`/data/users/${env.me}`);

    // rsync: `;` và `id` chỉ là tham số của rsync, không có shell nào chạy `id`
    let r = enter(env, 'rsync --server -vlogDtpre.iLsfxC . ; id');
    assert.equal(r.calls.length, 1, `${JSON.stringify(r.calls)} ${r.stderr}`);
    assert.equal(r.calls[0][0], 'rsync');
    assert.ok(inHome(r.calls[0]), `rsync chạy ở ${r.calls[0][1]}`);
    assert.deepEqual(r.calls[0].slice(2), ['--server', '-vlogDtpre.iLsfxC', '.', ';', 'id']);

    r = enter(env, 'scp -t x && id');
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0][0], 'scp');
    assert.deepEqual(r.calls[0].slice(2), ['-t', 'x', '&&', 'id']);

    r = enter(env, 'rsync --server $(id) `id`');
    assert.equal(r.calls.length, 1);
    assert.deepEqual(r.calls[0].slice(2), ['--server', '$(id)', '`id`']);

    // SFTP (subsystem) → sftp-server trên máy chủ, bắt đầu tại thư mục của user
    r = enter(env, '/usr/lib/openssh/sftp-server');
    assert.equal(r.calls[0][0], 'sftp-server');
    assert.ok(r.calls[0].slice(2).join(' ').endsWith(`/data/users/${env.me}`), r.calls[0].join(' '));
    r = enter(env, 'internal-sftp');
    assert.equal(r.calls[0][0], 'sftp-server');

    // scp không có -t/-f, rsync không có --server → không phải chép file, chuyển nguyên cho vmu-exec
    for (const cmd of ['nvidia-smi', 'scp other@host:x .', 'rsync -a / /tmp', 'bash']) {
      r = enter(env, cmd);
      assert.equal(r.calls.length, 1, cmd);
      assert.equal(r.calls[0][0], 'sudo', cmd);
      assert.deepEqual(r.calls[0].slice(2), ['-n', '/usr/local/sbin/vmu-exec', '--', cmd], cmd);
    }

    // Không có lệnh (ssh tương tác) → vmu-exec với lệnh rỗng
    r = enter(env, undefined);
    assert.deepEqual(r.calls[0].slice(2), ['-n', '/usr/local/sbin/vmu-exec', '--', '']);

    // (xem thêm CT-T20 cho vmu-connect)
    // Không lần nào gọi sh/bash trên máy chủ
    for (const cmd of ['rsync --server . ; sh', 'scp -f x ; bash']) {
      r = enter(env, cmd);
      assert.ok(r.calls.every((c) => c[0] !== 'sh' && c[0] !== 'bash'), cmd);
    }
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true });
  }
});

test('CT-T20 đúng một từ "vmu-connect" → sudo vmu-exec --connect; biến thể khác không được coi là vmu-connect', () => {
  const env = setup();
  try {
    let r = enter(env, 'vmu-connect');
    assert.equal(r.calls.length, 1, JSON.stringify(r.calls));
    assert.equal(r.calls[0][0], 'sudo');
    assert.deepEqual(r.calls[0].slice(2), ['-n', '/usr/local/sbin/vmu-exec', '--connect']);
    for (const cmd of ['vmu-connect ; id', 'vmu-connect x', 'vmu-connectx']) {
      r = enter(env, cmd);
      assert.deepEqual(r.calls[0].slice(2), ['-n', '/usr/local/sbin/vmu-exec', '--', cmd], cmd);
    }
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true });
  }
});
