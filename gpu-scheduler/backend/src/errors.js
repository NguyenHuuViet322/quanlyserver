// Mã lỗi API — docs/10-design/api.md#mã-lỗi
class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const err = {
  validation: (message, details) => new ApiError(400, 'VALIDATION_ERROR', message, details),
  invalidUsername: (reason) => new ApiError(400, 'INVALID_USERNAME', 'Tên đăng nhập không hợp lệ', { reason }),
  invalidSshKey: () => new ApiError(400, 'INVALID_SSH_KEY', 'SSH public key không đúng định dạng'),
  unauthenticated: () => new ApiError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập'),
  invalidToken: () => new ApiError(401, 'INVALID_TOKEN', 'ID token không hợp lệ'),
  emailNotVerified: () => new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Email chưa được Google xác minh'),
  domainNotAllowed: () => new ApiError(403, 'DOMAIN_NOT_ALLOWED', 'Chỉ chấp nhận tài khoản @vimaru.edu.vn'),
  accountPending: () => new ApiError(403, 'ACCOUNT_PENDING', 'Tài khoản đang chờ quản trị viên duyệt'),
  accountLocked: () => new ApiError(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa'),
  accountRejected: () => new ApiError(403, 'ACCOUNT_REJECTED', 'Tài khoản đã bị từ chối'),
  forbidden: () => new ApiError(403, 'FORBIDDEN', 'Không có quyền'),
  notFound: () => new ApiError(404, 'NOT_FOUND', 'Không tìm thấy'),
  userLimitReached: (max) => new ApiError(409, 'USER_LIMIT_REACHED', `Đã đủ ${max} tài khoản`),
  invalidState: (message = 'Thao tác không hợp lệ với trạng thái hiện tại') => new ApiError(409, 'INVALID_STATE', message),
  provisioningFailed: () => new ApiError(500, 'PROVISIONING_FAILED', 'Cấp phát tài khoản thất bại, đã hoàn tác'),
};

module.exports = { ApiError, err };
