// Tiến trình Scheduler (vmu-scheduler.service) — docs/10-design/scheduler.md
const os = require('node:os');
const { createDb } = require('../db');
const { configFromEnv, checkHostMemory } = require('../config');
const { createDocker } = require('../container/docker');
const { runTick, reconcile } = require('./tick');
const { createLinuxSystem } = require('../system/linux');
const { refreshStorage } = require('../storage/service');

const STORAGE_REFRESH_MS = 5 * 60 * 1000; // docs/10-design/storage.md

async function main() {
  const cfg = configFromEnv(process.env); // REQ-DP-07
  checkHostMemory(cfg, os.totalmem()); // REQ-DP-03

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

  // REQ-ST-02, REQ-ST-05: đọc quota, cảnh báo vượt soft quota
  const storageCtx = { db: env.db, system: createLinuxSystem(), clock: env.clock, cfg };
  const refresh = () => refreshStorage(storageCtx).catch((e) => console.error('đọc quota lỗi:', e));
  refresh();
  setInterval(refresh, STORAGE_REFRESH_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
