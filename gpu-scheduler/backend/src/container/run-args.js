// REQ-CT-01..06, REQ-CT-11, REQ-ST-03, REQ-SC-08: sinh tham số `docker run` — docs/10-design/container.md
const { GiB } = require('../config');

const gib = (bytes) => `${Math.floor(bytes / GiB)}g`;

// booking: { id, use_gpu }; user: { username, uid }. Image luôn là cfg.baseImage (REQ-CT-06).
function buildRunArgs({ booking, user, cpuThreads }, cfg) {
  if (!Number.isInteger(user.uid) || user.uid <= 0) throw new Error(`UID không hợp lệ: ${user.uid}`);

  const cpus = Math.max(1, Math.floor((cpuThreads - cfg.hostReservedCpuThreads) / cfg.maxConcurrentSessions));
  return [
    'run', '-d',
    '--name', `vmu-bk-${booking.id}`,
    '--label', `vmu.booking=${booking.id}`,
    '--label', `vmu.user=${user.username}`,
    '--user', `${user.uid}:${user.uid}`,
    '--security-opt', 'no-new-privileges',
    // Không mở cổng ra máy chủ; mạng tắt giao tiếp giữa các container — REQ-CT-05
    '--network', cfg.containerNetwork,
    '--cpus', String(cpus),
    '--memory', gib(cfg.sessionMemoryBytes),
    '--memory-swap', gib(cfg.sessionMemoryBytes),
    '--shm-size', gib(cfg.sessionShmBytes),
    '--storage-opt', `size=${cfg.containerWritableLayer}`,
    ...(booking.use_gpu ? ['--gpus', 'device=0'] : []),
    '-v', `${cfg.dataRoot}/users/${user.username}:/workspace:rw`,
    '-v', `${cfg.dataRoot}/shared:/shared:ro`,
    // SSH key của user cho sshd trong container (REQ-CT-11), chỉ đọc
    '-v', `${cfg.homeRoot}/${user.username}/.ssh/authorized_keys:/etc/vmu/authorized_keys:ro`,
    '-w', '/workspace',
    // Phần mềm tự cài (pip, conda, ~/.local, VS Code server) nằm trong /workspace nên được giữ qua các ca
    '-e', 'HOME=/workspace',
    '-e', `TZ=${cfg.timezone}`,
    cfg.baseImage,
    'sleep', 'infinity',
  ];
}

module.exports = { buildRunArgs };
