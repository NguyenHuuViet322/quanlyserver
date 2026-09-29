#!/usr/bin/env node
// Lệnh quản trị:
//   node backend/src/cli.js migrate                  tạo schema nếu CSDL còn trống
//   node backend/src/cli.js promote-admin <email>    cấp quyền admin (user phải đăng nhập Dashboard ít nhất một lần)
//   node backend/src/cli.js purge                    hằng ngày (vmu-purge.timer): user đã xóa quá hạn, log quá hạn, image quá hạn — REQ-US-16, MN-02, DP-04
const { createDb, migrate } = require('./db');
const { loadConfig, configFromEnv } = require('./config');
const { createDocker } = require('./container/docker');
const { pruneImages } = require('./container/images');
const { createLinuxSystem } = require('./system/linux');
const { purgeDeletedUsers } = require('./users/service');
const { purgeOldLogs } = require('./monitoring/service');

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const db = createDb(process.env.DATABASE_URL);
  try {
    if (cmd === 'migrate') {
      const { rows } = await db.query(`SELECT to_regclass('public.users') AS t`);
      if (rows[0].t) console.log('Schema đã tồn tại, bỏ qua');
      else { await migrate(db); console.log('Đã tạo schema'); }
    } else if (cmd === 'promote-admin') {
      const { rowCount } = await db.query(`UPDATE users SET role = 'admin' WHERE email = lower($1)`, [arg || '']);
      if (!rowCount) throw new Error(`Không có user ${arg}. Hãy đăng nhập Dashboard một lần trước.`);
      await db.query(`INSERT INTO audit_log (actor_id, action, target) SELECT NULL, 'user.promote_admin', 'user:' || id FROM users WHERE email = lower($1)`, [arg]);
      console.log(`${arg} đã là admin`);
    } else if (cmd === 'purge') {
      const cfg = loadConfig(configFromEnv(process.env));
      const clock = { now: () => new Date() };
      const n = await purgeDeletedUsers({ db, system: createLinuxSystem(), clock, cfg });
      console.log(`Đã xóa hẳn ${n} user`);
      const logs = await purgeOldLogs({ db, clock, cfg });
      console.log(`Đã xóa ${logs} file log quá hạn`); // REQ-MN-02
      const images = await pruneImages({ docker: createDocker(), cfg, clock });
      console.log(`Đã xóa ${images} image quá hạn`); // REQ-DP-04
    } else {
      console.error('Lệnh: migrate | promote-admin <email> | purge');
      process.exitCode = 2;
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
