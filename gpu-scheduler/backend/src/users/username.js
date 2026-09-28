// REQ-US-05
const USERNAME_RE = /^[a-z][a-z0-9._-]*$/;

function deriveUsername(email) {
  return String(email).split('@')[0].toLowerCase();
}

// Trả về null nếu hợp lệ, ngược lại là lý do
function usernameProblem(username, cfg) {
  if (!USERNAME_RE.test(username)) return 'FORMAT';
  if (username.length > cfg.usernameMaxLength) return 'TOO_LONG';
  if (cfg.reservedUsernames.includes(username)) return 'RESERVED';
  return null;
}

module.exports = { deriveUsername, usernameProblem };
