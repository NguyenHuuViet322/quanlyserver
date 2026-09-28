// REQ-CT-01..06, REQ-ST-03, REQ-SC-08: sinh tham số `docker run` — docs/10-design/container.md
const { GiB } = require('../config');

const gib = (bytes) => `${Math.floor(bytes / GiB)}g`;

// booking: { id, use_gpu, image, ports }; user: { username, uid }; ports: dải cổng của user { from, to }
// Lớp bảo vệ thứ hai sau kiểm tra ở API: image hoặc cổng không hợp lệ → ném lỗi, không sinh lệnh.
function buildRunArgs({ booking, user, ports, allowedImages, cpuThreads }, cfg) {
  if (!allowedImages.includes(booking.image)) throw new Error(`Image không được phép: ${booking.image}`);
  for (const p of booking.ports || []) {
    if (!ports || !Number.isInteger(p) || p < ports.from || p > ports.to) throw new Error(`Cổng ${p} ngoài dải của ${user.username}`);
  }
  if (!Number.isInteger(user.uid) || user.uid <= 0) throw new Error(`UID không hợp lệ: ${user.uid}`);

  const cpus = Math.max(1, Math.floor((cpuThreads - cfg.hostReservedCpuThreads) / cfg.maxConcurrentSessions));
  const name = `vmu-bk-${booking.id}`;
  return [
    'run', '-d',
    '--name', name,
    '--label', `vmu.booking=${booking.id}`,
    '--label', `vmu.user=${user.username}`,
    '--user', `${user.uid}:${user.uid}`,
    '--security-opt', 'no-new-privileges',
    '--cpus', String(cpus),
    '--memory', gib(cfg.sessionMemoryBytes),
    '--memory-swap', gib(cfg.sessionMemoryBytes),
    '--shm-size', gib(cfg.sessionShmBytes),
    '--storage-opt', `size=${cfg.containerWritableLayer}`,
    ...(booking.use_gpu ? ['--gpus', 'device=0'] : []),
    '-v', `${cfg.dataRoot}/users/${user.username}:/workspace:rw`,
    '-v', `${cfg.dataRoot}/shared:/shared:ro`,
    '-w', '/workspace',
    '-e', `TZ=${cfg.timezone}`,
    // Chỉ mở trên 127.0.0.1: tới được qua SSH tunnel, không lộ ra mạng — REQ-CT-05, REQ-CT-10
    ...(booking.ports || []).flatMap((p) => ['-p', `127.0.0.1:${p}:${p}`]),
    booking.image,
    'sleep', 'infinity',
  ];
}

module.exports = { buildRunArgs };
