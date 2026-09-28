# M1 — Người dùng & xác thực

## Đăng nhập Google

- [x] **US-T01** (REQ-US-01, REQ-US-03) · happy · integration — Email `abc@vimaru.edu.vn`, `email_verified = true`, `hd = vimaru.edu.vn` → `200`, có cookie `sid` ✅ `a375761`
- [x] **US-T02** (REQ-US-03) · negative · integration — Email `@gmail.com` → `403 DOMAIN_NOT_ALLOWED` ✅ `a375761`
- [x] **US-T03** (REQ-US-03) · negative · integration — Email `@sv.vimaru.edu.vn` (tên miền con) → `403 DOMAIN_NOT_ALLOWED` ✅ `a375761`
- [x] **US-T04** (REQ-US-03) · edge · integration — Email `abc@vimaru.edu.vn.evil.com` → `403 DOMAIN_NOT_ALLOWED` ✅ `a375761`
- [x] **US-T05** (REQ-US-02) · negative · integration — `email_verified = false` → `403 EMAIL_NOT_VERIFIED` ✅ `a375761`
- [x] **US-T06** (REQ-US-01) · negative · integration — ID token sai chữ ký, sai `aud`, hết hạn (3 trường hợp) → `401 INVALID_TOKEN` ✅ `a375761`
- [x] **US-T07** (REQ-US-01, REQ-US-03) · negative · integration — Token Gmail thật, không có claim `hd` (giả lập việc sửa `hd` trên URL) → `403 DOMAIN_NOT_ALLOWED` ✅ `a375761`
- [x] **US-T08** (REQ-US-04) · happy · integration — Họ tên, email, ảnh đại diện lưu đúng từ token; đăng nhập lại với tên/ảnh mới → được cập nhật ✅ `a375761`

## Tên đăng nhập & tạo tài khoản

- [x] **US-T09** (REQ-US-05) · happy · unit — `VietNH@vimaru.edu.vn` → username `vietnh` ✅ `a375761`
- [x] **US-T10** (REQ-US-05) · negative · integration — Username bắt đầu bằng số, chứa ký tự ngoài `a-z0-9._-`, dài > 32, trùng `root`/`docker` (4 trường hợp) → duyệt trả `400 INVALID_USERNAME`, không tạo tài khoản Linux ✅ `a375761`
- [x] **US-T11** (REQ-US-06) · negative · integration — Đăng nhập lần đầu → `status = pending`; gọi `POST /bookings` → `403 ACCOUNT_PENDING` ✅ `a375761`
- [ ] **US-T12** (REQ-US-07, REQ-ST-01) · happy · system — Admin duyệt → có user Linux, `/data/users/<username>` thuộc UID của user mode `0700`, `xfs_quota` báo soft 80 GiB / hard 100 GiB
- [x] **US-T13** (REQ-US-09) · happy · integration — Duyệt 30 user → user thứ `i` có dải `10000+100(i−1)` đến `+99`, không trùng nhau; user thứ 30 có `12900–12999` ✅ `a375761`
- [x] **US-T14** (REQ-US-08) · negative · integration — Đã có 30 user `active`, duyệt thêm → `409 USER_LIMIT_REACHED` ✅ `a375761`
- [x] **US-T15** (REQ-US-07) · edge · integration — Giả lập bước đặt quota lỗi → `500 PROVISIONING_FAILED`; không còn user Linux, thư mục, quota; user vẫn `pending` ✅ `a375761`
- [x] **US-T29** (REQ-US-09, REQ-US-16) · edge · integration — Xóa user có `slot_index = 3`, duyệt user mới → user mới nhận `slot_index = 3` (dải `10200–10299`) nhưng UID mới ✅ `a375761`

## Mật khẩu SSH

- [x] **US-T16** (REQ-US-10) · happy · integration — Lần đăng nhập đầu sau khi được duyệt → `GET /me/password` trả chuỗi 16 ký tự ✅ `a375761`
- [x] **US-T17** (REQ-US-10) · edge · unit — Sinh 10.000 mật khẩu → không trùng, đều dài 16, chỉ gồm bộ ký tự cho phép ✅ `a375761`
- [x] **US-T18** (REQ-US-10) · happy · integration — Sau `POST /me/password/ack` → `GET /me/password` trả `404 NOT_FOUND` ✅ `a375761`
- [ ] **US-T19** (REQ-US-10) · negative · system — Sau US-T16: tìm mật khẩu trong dump CSDL, log backend, log Nginx → không thấy
- [x] **US-T20** (REQ-US-10) · happy · integration — Response `GET /me/password` và `POST /me/password/reset` có `Cache-Control: no-store` ✅ `a375761`
- [ ] **US-T21** (REQ-US-11) · happy · system — SSH bằng mật khẩu vừa cấp → đăng nhập được và bị yêu cầu đổi mật khẩu ngay
- [ ] **US-T22** (REQ-US-12) · happy · system — Cấp lại mật khẩu → SSH bằng mật khẩu cũ thất bại; mật khẩu mới hiển thị một lần và phải đổi khi SSH
- [x] **US-T31** (REQ-US-07, REQ-CT-10) · happy · integration — Duyệt user → cấu hình sshd được ghi lại, có khối `Match User` của user; xóa user → ghi lại, không còn khối đó ✅ `a375761`
- [ ] **US-T23** (REQ-US-13) · happy · system — Thêm SSH key qua API → SSH bằng key thành công; xóa key → thất bại
- [x] **US-T28** (REQ-US-13) · negative · integration — Thêm key `"not-a-key"` → `400 INVALID_SSH_KEY` ✅ `a375761`

## Phân quyền

- [x] **US-T24** (REQ-US-14) · negative · integration — User thường gọi `GET /admin/users` → `403 FORBIDDEN` ✅ `a375761`
- [x] **US-T25** (REQ-US-15) · happy · integration — Admin khóa user có 1 ca `scheduled` và 1 ca `running` → đăng nhập trả `403 ACCOUNT_LOCKED`, ca `scheduled` thành `cancelled`, ca `running` chuyển `stopping` rồi `completed` ✅ `a375761`
- [x] **US-T26** (REQ-US-16) · happy · integration — Xóa user → dữ liệu còn nguyên, `purge_after = now + 30 ngày`; chạy cron purge với thời gian giả lập +31 ngày → dữ liệu bị xóa ✅ `a375761`
- [x] **US-T27** (REQ-US-14) · negative · integration — Gọi `GET /me` không có cookie → `401 UNAUTHENTICATED` ✅ `a375761`
- [x] **US-T30** (REQ-US-14) · happy · integration — Admin gọi `GET /admin/users` → `200` ✅ `a375761`
