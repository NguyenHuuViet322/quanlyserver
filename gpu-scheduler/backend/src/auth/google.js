// REQ-US-01..03: xác thực ID token Google ở backend.
const { createLocalJWKSet, createRemoteJWKSet, jwtVerify } = require('jose');
const { err } = require('../errors');

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// jwks: truyền JWKS cố định (test); bỏ trống thì tải khóa công khai của Google.
function createGoogleVerifier({ clientId, jwks }) {
  if (!clientId) throw new Error('Thiếu Google client ID');
  const keys = jwks ? createLocalJWKSet(jwks) : createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

  return async function verifyIdToken(token) {
    try {
      const { payload } = await jwtVerify(String(token || ''), keys, {
        issuer: GOOGLE_ISSUERS,
        audience: clientId,
        algorithms: ['RS256'],
      });
      return payload;
    } catch {
      throw err.invalidToken();
    }
  };
}

// REQ-US-02, REQ-US-03. Không dựa vào tham số hd trên URL đăng nhập: chỉ tin claim trong token đã xác thực.
function checkClaims(claims, cfg) {
  if (claims.email_verified !== true) throw err.emailNotVerified();
  const domain = cfg.allowedEmailDomain;
  const email = String(claims.email || '').toLowerCase();
  const parts = email.split('@');
  if (claims.hd !== domain || parts.length !== 2 || parts[0] === '' || parts[1] !== domain) {
    throw err.domainNotAllowed();
  }
  return {
    sub: String(claims.sub),
    email,
    name: String(claims.name || email),
    avatarUrl: claims.picture ? String(claims.picture) : null,
  };
}

module.exports = { createGoogleVerifier, checkClaims };
