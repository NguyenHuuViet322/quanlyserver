// Tiến trình Scheduler (vmu-scheduler.service) — docs/10-design/scheduler.md
const os = require('node:os');
const { createDb } = require('../db');
const { defaults } = require('../config');
const { createDocker } = require('../container/docker');
const { runTick, reconcile } = require('./tick');

async function main() {
  const cfg = defaults;
  // REQ-DP-03: tổng giới hạn RAM container không được lấn phần dành cho host
  const need = cfg.maxConcurrentSessions * cfg.sessionMemoryBytes;
  if (need > os.totalmem() - cfg.hostReservedMemoryBytes) {
    throw new Error(`RAM không đủ: ${cfg.maxConcurrentSessions} × phiên cần ${need} byte, host chỉ còn ${os.totalmem() - cfg.hostReservedMemoryBytes}`);
  }

  const env = {
    db: createDb(process.env.DATABASE_URL),
    docker: createDocker(),
    clock: { now: () => new Date() },
    cfg,
    host: { cpuThreads: os.availableParallelism() },
  };

  await reconcile(env);
  console.log('Scheduler đã reconcile, bắt đầu tick');
  // Nhịp cố định; ca nào đến giờ do truy vấn so sánh thời điểm quyết định, không phải biểu thức cron
  setInterval(() => {
    runTick(env).catch((e) => console.error('tick lỗi:', e));
  }, cfg.schedulerTickMs);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
