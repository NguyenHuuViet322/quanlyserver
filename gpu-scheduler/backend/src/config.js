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
  portBase: 10000,
  portRangeSize: 100,
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
  dataRoot: '/data', // /data/users/<username>, /data/shared
  logDir: '/var/log/vmu/bookings', // log container sau khi ca kết thúc
  imageRetentionMs: 30 * DAY,
  logRetentionMs: 30 * DAY,
  deletedUserRetentionMs: 30 * DAY,
  sessionTtlMs: 30 * DAY,
  sshHost: 'gpu.vimaru.edu.vn', // hiển thị hướng dẫn SSH trên Dashboard — biến môi trường SSH_HOST
  dashboardUrl: 'https://gpu.vimaru.edu.vn', // DASHBOARD_URL
  passwordEncKey: null, // 32 byte hex, bắt buộc — biến môi trường PASSWORD_ENC_KEY
});

function loadConfig(overrides = {}) {
  const cfg = { ...defaults, ...overrides };
  if (!/^[0-9a-f]{64}$/i.test(cfg.passwordEncKey || '')) {
    throw new Error('passwordEncKey phải là 64 ký tự hex (PASSWORD_ENC_KEY)');
  }
  return Object.freeze(cfg);
}

module.exports = { defaults, loadConfig, GiB, HOUR, DAY };
