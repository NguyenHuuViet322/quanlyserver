// REQ-DP-01, REQ-DP-02, REQ-DP-06, REQ-DP-08, REQ-US-10: file cấu hình và script trong deploy/.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { configFromEnv, loadConfig } = require('../../src/config');

const DEPLOY = path.resolve(__dirname, '../../../deploy');
const read = (p) => fs.readFileSync(path.join(DEPLOY, p), 'utf8');

// Đường dẫn dạng bash (Git Bash trên Windows: C:\x → /c/x)
function sh(p) {
  const posix = process.platform === 'win32' ? p.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`) : p;
  return posix.split(path.sep).join('/');
}

// Một khóa của một section trong file unit systemd
function unitValues(text, key) {
  return [...text.matchAll(new RegExp(`^${key}=(.*)$`, 'gm'))].map((m) => m[1].trim());
}

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return env;
}

test('DP-T11 unit systemd, Nginx và cú pháp các script trong deploy/', () => {
  for (const name of ['vmu-api.service', 'vmu-scheduler.service']) {
    const u = read(`systemd/${name}`);
    assert.deepEqual(unitValues(u, 'User'), ['vmu'], name);
    assert.deepEqual(unitValues(u, 'Restart'), ['always'], name);
    assert.deepEqual(unitValues(u, 'EnvironmentFile'), ['/etc/vmu/vmu.env'], name);
    assert.deepEqual(unitValues(u, 'StartLimitIntervalSec'), ['0'], name);
    assert.ok(Number(unitValues(u, 'RestartSec')[0]) <= 5, `${name}: RestartSec`);
    assert.ok(!/^Environment=.*\bTZ=/m.test(u), `${name} không được đặt TZ (REQ-BK-12)`);
    assert.deepEqual(unitValues(u, 'WantedBy'), ['multi-user.target'], name);
  }
  assert.match(unitValues(read('systemd/vmu-scheduler.service'), 'After')[0], /docker\.service/);
  const timer = read('systemd/vmu-purge.timer');
  assert.deepEqual(unitValues(timer, 'OnCalendar'), ['*-*-* 03:00:00']);
  assert.deepEqual(unitValues(timer, 'Persistent'), ['true']);
  assert.match(unitValues(read('systemd/vmu-purge.service'), 'ExecStart')[0], /cli\.js purge$/);

  const nginx = read('nginx/vmu.conf');
  const http = nginx.match(/server\s*\{[^]*?listen 80;[^]*?\n\}/)[0];
  assert.match(http, /return 301 https:\/\/\$host\$request_uri;/);
  assert.match(nginx, /listen 443 ssl;/);
  assert.match(nginx, /location \/api\/ \{[^}]*proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(nginx, /location \/api\/me\/password \{[^}]*access_log off;/);
  assert.ok(!/\$http_cookie/.test(nginx), 'không ghi Cookie vào log');

  const scripts = ['install.sh', 'vmu-doctor', 'vmu-provision', 'vmu-exec', 'vmu-enter', 'base-image/vmu-sshd'];
  for (const s of scripts) {
    const r = spawnSync('bash', ['-n', sh(path.join(DEPLOY, s))], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${s}: ${r.stderr}`);
  }
});

test('DP-T12 install.sh --print-env: profile test thu nhỏ, prod = mặc định SPEC, profile sai → lỗi', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vmu-install-'));
  const run = (...args) => spawnSync('bash', [sh(path.join(DEPLOY, 'install.sh')), ...args], {
    encoding: 'utf8',
    env: { ...process.env, VMU_ENV_FILE: sh(path.join(tmp, 'khong-co.env')) },
  });

  const t = run('--profile', 'test', '--domain', 'vmu-test.example.org', '--google-client-id', 'abc.apps.googleusercontent.com', '--print-env');
  assert.equal(t.status, 0, t.stderr);
  const env = parseEnv(t.stdout);
  assert.equal(env.SESSION_MEMORY, '256M');
  assert.equal(env.BASE_IMAGE, 'vmu/base:lite');
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.SSH_HOST, 'vmu-test.example.org');
  assert.equal(env.DASHBOARD_URL, 'https://vmu-test.example.org');
  assert.equal(env.GOOGLE_CLIENT_ID, 'abc.apps.googleusercontent.com');
  assert.match(env.PASSWORD_ENC_KEY, /^[0-9a-f]{64}$/);
  assert.match(env.DATABASE_URL, /^postgres:\/\/vmu:[A-Za-z0-9]{24,}@127\.0\.0\.1:5432\/vmu$/);
  const cfg = configFromEnv(env);
  assert.equal(cfg.sessionMemoryBytes, 256 * 1024 ** 2);
  assert.doesNotThrow(() => loadConfig({ ...cfg, passwordEncKey: env.PASSWORD_ENC_KEY }));

  const p = run('--profile', 'prod', '--domain', 'gpu.vimaru.edu.vn', '--print-env');
  assert.equal(p.status, 0, p.stderr);
  const prod = configFromEnv(parseEnv(p.stdout));
  const d = configFromEnv({});
  for (const k of ['sessionMemoryBytes', 'sessionShmBytes', 'hostReservedMemoryBytes', 'hostReservedCpuThreads',
    'userQuotaSoftBytes', 'userQuotaHardBytes', 'userQuotaGraceMs', 'containerWritableLayer', 'baseImage']) {
    assert.equal(prod[k], d[k], k);
  }

  // Chưa có OAuth Client ID: vẫn cài được với giá trị tạm (đăng nhập Google chưa chạy)
  const noId = run('--profile', 'test', '--domain', '222-255-180-51.sslip.io', '--print-env');
  assert.equal(noId.status, 0, noId.stderr);
  assert.equal(parseEnv(noId.stdout).GOOGLE_CLIENT_ID, 'chua-cau-hinh.apps.googleusercontent.com');

  assert.notEqual(run('--print-env').status, 0, 'thiếu --profile');
  assert.notEqual(run('--profile', 'lab', '--print-env').status, 0, 'profile lạ');
});
