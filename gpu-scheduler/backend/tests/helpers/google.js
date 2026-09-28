// Giả lập Google làm nhà phát hành ID token: tự sinh cặp khóa RS256 và JWKS.
const { generateKeyPair, exportJWK, SignJWT } = require('jose');

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const ISSUER = 'https://accounts.google.com';

async function createFakeGoogle() {
  const good = await generateKeyPair('RS256');
  const evil = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(good.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

  async function sign(claims = {}, { key = good.privateKey, kid = 'k1', aud = CLIENT_ID, expiresIn = '1h', iat } = {}) {
    const email = claims.email ?? 'vietnh@vimaru.edu.vn';
    const body = {
      email,
      email_verified: true,
      hd: 'vimaru.edu.vn',
      name: 'Nguyễn Hữu Việt',
      picture: 'https://lh3.googleusercontent.com/a/avatar1',
      ...claims,
    };
    for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
    let jwt = new SignJWT(body)
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(ISSUER)
      .setAudience(aud)
      .setSubject(claims.sub ?? `sub-${email}`);
    jwt = iat !== undefined ? jwt.setIssuedAt(iat) : jwt.setIssuedAt();
    return jwt.setExpirationTime(expiresIn).sign(key);
  }

  return {
    clientId: CLIENT_ID,
    jwks: { keys: [jwk] },
    sign,
    signWithWrongKey: (claims) => sign(claims, { key: evil.privateKey }),
  };
}

module.exports = { createFakeGoogle, CLIENT_ID };
