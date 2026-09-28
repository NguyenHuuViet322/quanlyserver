// REQ-US-10: mật khẩu SSH ngẫu nhiên, và mã hóa tạm thời cho tới khi user xác nhận đã lưu.
const crypto = require('node:crypto');

// Bỏ các ký tự dễ nhầm: 0 O o 1 l I
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generatePassword(length) {
  let out = '';
  // crypto.randomInt dùng CSPRNG và lấy mẫu đều (không bị lệch do phép modulo)
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

// AES-256-GCM: [iv 12 byte][tag 16 byte][ciphertext]
function encryptPassword(plain, keyHex) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

function decryptPassword(blob, keyHex) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8');
}

module.exports = { PASSWORD_ALPHABET, generatePassword, encryptPassword, decryptPassword };
