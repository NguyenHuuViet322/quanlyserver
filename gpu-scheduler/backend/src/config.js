// Bảng cấu hình — docs/00-spec/SPEC.md mục 1. Không ghi số trực tiếp ở nơi khác.
const GiB = 1024 ** 3;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const defaults = Object.freeze({
  allowedEmailDomain: 'vimaru.edu.vn',
  maxUsers: 30,
  usernameMaxLength: 32,
  reservedUsernames: ['root', 'admin', 'docker', 'nginx', 'postgres', 'nobody', 'daemon', 'bin', 'sys', 'www-data', 'ubuntu'],
  passwordLength: 16,
  uidBase: 2001,
  maxConcurrentSessions: 2,
  maxGpuSessions: 1,
  slotStepMs: HOUR,
  slotMaxMs: 8 * HOUR,
  bookingHorizonMs: 7 * DAY,
  gpuWeeklyQuotaMs: 10 * HOUR,
  gpuQuotaFreeWindowMs: 24 * HOUR,
  timezone: 'Asia/Ho_Chi_Minh',
  schedulerTickMs: 60 * 1000,
  endWarningMs: 15 * 60 * 1000,
  stopTimeoutSec: 120,
  sessionMemoryBytes: 28 * GiB,
  sessionShmBytes: 8 * GiB,
  hostReservedMemoryBytes: 8 * GiB,
  hostReservedCpuThreads: 2,
  userQuotaSoftBytes: 80 * GiB,
  userQuotaHardBytes: 100 * GiB,
  userQuotaGraceMs: 7 * DAY,
  containerWritableLayer: '20G',
  baseImage: 'vmu/base:cuda12.8', // image chung (REQ-CT-06) — biến môi trường BASE_IMAGE
  containerNetwork: 'vmu-net', // mạng tắt giao tiếp giữa các container (REQ-CT-05)
  homeRoot: '/home', // ~/.ssh/authorized_keys của user trên máy chủ, mount vào container (REQ-CT-11)
  dataRoot: '/data', // /data/users/<username>, /data/shared
  logDir: '/var/log/vmu/bookings', // log container sau khi ca kết thúc
  imageRetentionMs: 30 * DAY,
  logRetentionMs: 30 * DAY,
  deletedUserRetentionMs: 30 * DAY,
  sessionTtlMs: 30 * DAY,
  sshHost: 'gpu.vimaru.edu.vn', // hiển thị hướng dẫn SSH trên Dashboard — biến môi trường SSH_HOST
  dashboardUrl: 'https://gpu.vimaru.edu.vn', // DASHBOARD_URL
  devLogin: false, // chỉ tools/dev-server.js bật: trang đăng nhập hiện lối vào /__dev
  passwordEncKey: null, // 32 byte hex, bắt buộc — biến môi trường PASSWORD_ENC_KEY
});

function loadConfig(overrides = {}) {
  const cfg = { ...defaults, ...overrides };
  if (!/^[0-9a-f]{64}$/i.test(cfg.passwordEncKey || '')) {
    throw new Error('passwordEncKey phải là 64 ký tự hex (PASSWORD_ENC_KEY)');
  }
  return Object.freeze(cfg);
}

// ---- REQ-DP-07: tham số tài nguyên (⚙ trong SPEC) đọc từ biến môi trường (/etc/vmu/vmu.env) ----
const SIZE_UNITS = { '': 1, K: 1024, M: 1024 ** 2, G: GiB, T: 1024 ** 4 };
const TIME_UNITS = { m: 60 * 1000, h: HOUR, d: DAY };

function bad(name, value, hint) {
  return new Error(`Cấu hình sai: ${name}=${JSON.stringify(value)} — ${hint}`);
}
function parseSize(name, value) {
  const m = /^([1-9][0-9]*)([KMGT]?)$/.exec(value);
  if (!m) throw bad(name, value, 'cần số nguyên dương, có thể kèm K/M/G/T (vd 28G, 512M)');
  return Number(m[1]) * SIZE_UNITS[m[2]];
}
function parseDuration(name, value) {
  const m = /^([1-9][0-9]*)([mhd])$/.exec(value);
  if (!m) throw bad(name, value, 'cần số nguyên dương kèm m/h/d (vd 7d, 10m)');
  return Number(m[1]) * TIME_UNITS[m[2]];
}
function parseCount(name, value) {
  if (!/^[0-9]+$/.test(value)) throw bad(name, value, 'cần số nguyên ≥ 0');
  return Number(value);
}

// Tên biến → [khóa cfg, cách đọc]. CONTAINER_WRITABLE_LAYER giữ nguyên chuỗi cho `--storage-opt size=`.
const ENV_PARAMS = {
  SESSION_MEMORY: ['sessionMemoryBytes', parseSize],
  SESSION_SHM: ['sessionShmBytes', parseSize],
  HOST_RESERVED_MEMORY: ['hostReservedMemoryBytes', parseSize],
  HOST_RESERVED_CPU_THREADS: ['hostReservedCpuThreads', parseCount],
  USER_QUOTA_SOFT: ['userQuotaSoftBytes', parseSize],
  USER_QUOTA_HARD: ['userQuotaHardBytes', parseSize],
  USER_QUOTA_GRACE: ['userQuotaGraceMs', parseDuration],
  CONTAINER_WRITABLE_LAYER: ['containerWritableLayer', (name, v) => { parseSize(name, v); return v; }],
  BASE_IMAGE: ['baseImage', (name, v) => {
    if (!/^[a-z0-9][a-z0-9._/-]*(:[A-Za-z0-9._-]+)?(@sha256:[0-9a-f]{64})?$/.test(v)) throw bad(name, v, 'tên image Docker không hợp lệ');
    return v;
  }],
};

// Bảng cấu hình = mặc định SPEC + biến môi trường. Chưa kiểm PASSWORD_ENC_KEY (Scheduler không cần) — dùng loadConfig khi cần.
function configFromEnv(env) {
  const cfg = { ...defaults };
  for (const [name, [key, parse]] of Object.entries(ENV_PARAMS)) {
    if (env[name] !== undefined) cfg[key] = parse(name, String(env[name]).trim());
  }
  if (env.SSH_HOST) cfg.sshHost = env.SSH_HOST;
  if (env.DASHBOARD_URL) cfg.dashboardUrl = env.DASHBOARD_URL;
  if (env.PASSWORD_ENC_KEY) cfg.passwordEncKey = env.PASSWORD_ENC_KEY;
  if (cfg.sessionShmBytes > cfg.sessionMemoryBytes) throw bad('SESSION_SHM', env.SESSION_SHM, 'không được lớn hơn SESSION_MEMORY');
  if (cfg.userQuotaSoftBytes > cfg.userQuotaHardBytes) throw bad('USER_QUOTA_SOFT', env.USER_QUOTA_SOFT, 'không được lớn hơn USER_QUOTA_HARD');
  return cfg;
}

// REQ-DP-03: tổng giới hạn RAM container không được lấn phần dành cho host
function checkHostMemory(cfg, totalBytes) {
  const need = cfg.maxConcurrentSessions * cfg.sessionMemoryBytes;
  const available = totalBytes - cfg.hostReservedMemoryBytes;
  if (need > available) {
    throw new Error(`RAM không đủ: ${cfg.maxConcurrentSessions} phiên × SESSION_MEMORY cần ${need} byte, host chỉ còn ${available} byte (RAM ${totalBytes} − HOST_RESERVED_MEMORY ${cfg.hostReservedMemoryBytes})`);
  }
}

module.exports = { defaults, loadConfig, configFromEnv, checkHostMemory, GiB, HOUR, DAY };
