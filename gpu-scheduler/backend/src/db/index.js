const fs = require('node:fs');
const path = require('node:path');
const { Pool, types } = require('pg');

// bigint (int8) → Number: id và UID đều nhỏ hơn 2^53
types.setTypeParser(20, Number);

function createDb(connectionString) {
  // REQ-DP-06: phiên CSDL luôn ở UTC, không phụ thuộc cấu hình server.
  // Đặt qua tham số kết nối (không chạy SET sau khi kết nối, tránh chạy chồng với truy vấn đầu tiên)
  return new Pool({ connectionString, options: '-c timezone=UTC' });
}

async function migrate(db) {
  await db.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
}

// Chỉ dùng cho test: xóa sạch rồi tạo lại schema
async function resetSchema(db) {
  await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
}

async function tx(db, fn) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { createDb, migrate, resetSchema, tx };
