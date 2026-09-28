// HTTP API — docs/10-design/api.md
const Fastify = require('fastify');
const { loadConfig } = require('./config');
const { ApiError, err } = require('./errors');
const { createGoogleVerifier, checkClaims } = require('./auth/google');
const users = require('./users/service');
const bookings = require('./booking/service');
const monitoring = require('./monitoring/service');
const { storageOf } = require('./storage/service');

const SID = 'sid';
const NO_STORE = 'no-store';

// Phân quyền theo route — REQ-US-06, REQ-US-14, REQ-US-15
const PUBLIC_ROUTES = new Set(['POST /api/auth/google', 'GET /api/config']);

// Phục vụ Dashboard tĩnh (frontend/src) khi có staticDir; production dùng Nginx — docs/10-design/deployment.md
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

async function serveStatic(staticDir, urlPath, reply) {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const root = path.resolve(staticDir);
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.resolve(root, `.${rel}`);
  if (!file.startsWith(root + path.sep)) return reply.code(404).type('text/plain').send('Not found');
  // Đường dẫn không có phần mở rộng là route của SPA → index.html
  if (!path.extname(file)) file = path.join(root, 'index.html');
  try {
    const body = await fs.readFile(file);
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    return reply.type(type).header('cache-control', type.startsWith('text/html') ? 'no-cache' : 'public, max-age=300').send(body);
  } catch {
    return reply.code(404).type('text/plain').send('Not found');
  }
}
const PENDING_ROUTES = new Set(['GET /api/me', 'POST /api/auth/logout']);

async function buildApp({ db, system, docker, clock = { now: () => new Date() }, google, config = {}, logger = false, staticDir = null }) {
  const cfg = loadConfig(config);
  const verifyIdToken = createGoogleVerifier(google);
  const ctx = { db, system, docker, clock, cfg };

  // Không log body hay header Cookie (REQ-US-10)
  // coerceTypes: false — "use_gpu": "true" (chuỗi) phải bị từ chối, không tự đổi sang boolean
  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: false } } });
  await app.register(require('@fastify/cookie'));
  app.decorateRequest('user', null);

  app.setErrorHandler((e, req, reply) => {
    if (e instanceof ApiError) {
      return reply.code(e.status).send({ error: { code: e.code, message: e.message, details: e.details } });
    }
    if (e.validation || e.statusCode === 400) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: e.message, details: {} } });
    }
    req.log.error(e);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống', details: {} } });
  });

  app.setNotFoundHandler(async (req, reply) => {
    if (staticDir && req.method === 'GET' && !req.url.startsWith('/api/')) return serveStatic(staticDir, req.url, reply);
    throw err.notFound();
  });

  // Cấu hình công khai cho Dashboard (trang đăng nhập cần trước khi có phiên)
  app.get('/api/config', async () => ({
    google_client_id: google.clientId,
    ssh_host: cfg.sshHost,
    dashboard_url: cfg.dashboardUrl,
    timezone: cfg.timezone,
    slot_max_hours: cfg.slotMaxMs / 3600000,
    booking_horizon_days: cfg.bookingHorizonMs / 86400000,
    max_concurrent_sessions: cfg.maxConcurrentSessions,
    ...(cfg.devLogin && { dev_login: true }),
  }));

  app.addHook('onRequest', async (req) => {
    const path = req.url.split('?')[0];
    if (!path.startsWith('/api/')) return;
    const route = `${req.method} ${req.routeOptions?.url || path}`;
    if (PUBLIC_ROUTES.has(route)) return;

    const user = await users.userFromSession(ctx, req.cookies[SID]);
    if (!user) throw err.unauthenticated();
    if (user.status === 'locked' || user.status === 'deleted') throw err.accountLocked();
    req.user = user;

    if (path.startsWith('/api/admin/')) {
      if (user.role !== 'admin') throw err.forbidden();
      return; // admin đầu tiên (tạo bằng lệnh promote-admin) được tự duyệt chính mình
    }
    if (user.status === 'pending' && !PENDING_ROUTES.has(route)) throw err.accountPending();
  });

  // --- Xác thực ---
  app.post('/api/auth/google', {
    schema: { body: { type: 'object', required: ['id_token'], properties: { id_token: { type: 'string' } } } },
  }, async (req, reply) => {
    const claims = await verifyIdToken(req.body.id_token);
    const profile = checkClaims(claims, cfg);
    const user = await users.upsertFromGoogle(ctx, profile);
    const session = await users.createSession(ctx, user.id);
    reply.setCookie(SID, session.token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: session.expires });
    return { user: users.publicUser(user, cfg) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await users.deleteSession(ctx, req.cookies[SID]);
    reply.clearCookie(SID, { path: '/' });
    return reply.code(204).send();
  });

  // --- Tài khoản của tôi ---
  app.get('/api/me', async (req) => {
    const me = users.publicUser(req.user, cfg);
    if (req.user.status === 'active') {
      me.storage = storageOf(req.user, cfg);
    }
    return me;
  });

  app.get('/api/me/password', async (req, reply) => {
    const password = await users.getPendingPassword(ctx, req.user);
    reply.header('cache-control', NO_STORE);
    return { password };
  });

  app.post('/api/me/password/ack', async (req, reply) => {
    await users.ackPassword(ctx, req.user);
    return reply.code(204).send();
  });

  app.post('/api/me/password/reset', async (req, reply) => {
    const password = await users.resetPassword(ctx, req.user);
    reply.header('cache-control', NO_STORE);
    return { password };
  });

  app.get('/api/me/ssh-keys', async (req) => users.listSshKeys(ctx, req.user));

  app.post('/api/me/ssh-keys', {
    schema: { body: { type: 'object', required: ['public_key'], properties: { public_key: { type: 'string' } } } },
  }, async (req, reply) => reply.code(201).send(await users.addSshKey(ctx, req.user, req.body.public_key)));

  app.delete('/api/me/ssh-keys/:id', async (req, reply) => {
    await users.removeSshKey(ctx, req.user, Number(req.params.id) || 0);
    return reply.code(204).send();
  });

  // --- Đặt lịch — REQ-BK-01..12 ---
  const bookingBody = {
    type: 'object',
    required: ['start', 'end', 'use_gpu'],
    properties: {
      start: { type: 'string' },
      end: { type: 'string' },
      use_gpu: { type: 'boolean' },
    },
  };
  const bookingId = (req) => Number(req.params.id) || 0;

  app.get('/api/calendar', async (req) => bookings.calendar(ctx, req.user, req.query));
  app.get('/api/bookings', async (req) => bookings.listBookings(ctx, req.user, req.query));
  app.get('/api/bookings/:id', async (req) => bookings.getBooking(ctx, req.user, bookingId(req)));
  app.post('/api/bookings', { schema: { body: bookingBody } }, async (req, reply) =>
    reply.code(201).send(await bookings.createBooking(ctx, req.user, req.body)));
  app.post('/api/bookings/:id/cancel', async (req) => bookings.cancelBooking(ctx, req.user, bookingId(req)));
  app.post('/api/bookings/:id/end', async (req, reply) =>
    reply.code(202).send(await bookings.endBooking(ctx, req.user, bookingId(req))));
  // --- Giám sát — REQ-MN-01, REQ-MN-02 ---
  app.get('/api/bookings/:id/logs', async (req, reply) => {
    const text = await monitoring.bookingLogs(ctx, req.user, bookingId(req), req.query.tail);
    reply.type('text/plain; charset=utf-8');
    return text;
  });
  app.get('/api/bookings/:id/metrics', async (req) => monitoring.bookingMetrics(ctx, req.user, bookingId(req)));
  app.get('/api/notifications', async (req) => monitoring.listNotifications(ctx, req.user, req.query));
  app.post('/api/notifications/read-all', async (req, reply) => {
    await monitoring.markAllNotificationsRead(ctx, req.user);
    return reply.code(204).send();
  });
  app.post('/api/notifications/:id/read', async (req, reply) => {
    await monitoring.markNotificationRead(ctx, req.user, Number(req.params.id) || 0);
    return reply.code(204).send();
  });
  app.post('/api/bookings/:id/restart', async (req, reply) =>
    reply.code(202).send(await bookings.restartBooking(ctx, req.user, bookingId(req))));

  // --- Admin ---
  const idParam = (req) => Number(req.params.id) || 0;

  app.get('/api/admin/users', async (req) => users.listUsers(ctx, req.query.status));
  app.post('/api/admin/users/:id/approve', async (req) => ({ user: await users.approveUser(ctx, req.user.id, idParam(req)) }));
  app.post('/api/admin/users/:id/lock', async (req) => ({ user: await users.lockUser(ctx, req.user.id, idParam(req)) }));
  app.post('/api/admin/users/:id/unlock', async (req) => ({ user: await users.unlockUser(ctx, req.user.id, idParam(req)) }));
  app.get('/api/admin/audit', async (req) => monitoring.listAudit(ctx, req.query));
  app.delete('/api/admin/users/:id', async (req) => ({ user: await users.deleteUser(ctx, req.user.id, idParam(req)) }));

  return app;
}

module.exports = { buildApp };
