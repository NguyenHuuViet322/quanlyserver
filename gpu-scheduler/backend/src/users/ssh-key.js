// REQ-US-13: kiểm tra định dạng SSH public key (một dòng OpenSSH).
const crypto = require('node:crypto');
const { err } = require('../errors');

const KEY_TYPES = new Set([
  'ssh-ed25519',
  'ssh-rsa',
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
  'sk-ssh-ed25519@openssh.com',
  'sk-ecdsa-sha2-nistp256@openssh.com',
]);

// Trả về { publicKey, fingerprint } đã chuẩn hóa, hoặc ném INVALID_SSH_KEY
function parseSshKey(input) {
  const line = String(input ?? '').trim();
  if (!line || /[\r\n]/.test(line)) throw err.invalidSshKey();
  const [type, b64, ...comment] = line.split(/\s+/);
  if (!KEY_TYPES.has(type) || !b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw err.invalidSshKey();
  const blob = Buffer.from(b64, 'base64');
  // Blob bắt đầu bằng chuỗi SSH: uint32 độ dài + tên loại key, phải khớp phần đầu dòng
  if (blob.length < 4) throw err.invalidSshKey();
  const n = blob.readUInt32BE(0);
  if (n !== type.length || blob.length < 4 + n || blob.toString('latin1', 4, 4 + n) !== type) throw err.invalidSshKey();
  const fingerprint = 'SHA256:' + crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
  return { publicKey: [type, b64, ...comment].join(' '), fingerprint };
}

module.exports = { parseSshKey };
