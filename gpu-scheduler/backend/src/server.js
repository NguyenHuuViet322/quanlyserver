// Tiến trình API (vmu-api.service) — docs/10-design/deployment.md
const { buildApp } = require('./app');
const { createDb } = require('./db');
const { createLinuxSystem } = require('./system/linux');
const { createDocker } = require('./container/docker');

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name}`);
  return v;
}

async function main() {
  const db = createDb(required('DATABASE_URL'));
  const app = await buildApp({
    db,
    system: createLinuxSystem(),
    docker: createDocker(),
    google: { clientId: required('GOOGLE_CLIENT_ID') },
    config: {
      passwordEncKey: required('PASSWORD_ENC_KEY'),
      ...(process.env.SSH_HOST && { sshHost: process.env.SSH_HOST }),
      ...(process.env.DASHBOARD_URL && { dashboardUrl: process.env.DASHBOARD_URL }),
    },
    // Production: Nginx phục vụ frontend/src; đặt STATIC_DIR để backend tự phục vụ (chạy thử)
    staticDir: process.env.STATIC_DIR || null,
    logger: { level: process.env.LOG_LEVEL || 'info' },
  });
  await app.listen({ host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 3000) });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
