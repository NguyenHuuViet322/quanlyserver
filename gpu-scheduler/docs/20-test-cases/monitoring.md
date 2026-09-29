# M6 — Giám sát & log

- [ ] **MN-T01** (REQ-MN-01) · happy · system — Phiên GPU đang chạy → `GET /bookings/:id/metrics` có CPU, RAM, GPU; `sampled_at` cách hiện tại ≤ 60 giây
- [x] **MN-T02** (REQ-MN-02) · happy · integration — Ca đã `completed` → `GET /bookings/:id/logs` trả log của container ✅ `9542e97`
- [x] **MN-T05** (REQ-MN-02) · edge · integration — Log quá 30 ngày (đồng hồ giả) → bị dọn, API trả `404 NOT_FOUND` ✅ `9542e97`
- [x] **MN-T03** (REQ-MN-03) · happy · integration — Đặt, hủy, kết thúc sớm, khởi động lại, duyệt, khóa, xóa, cấp lại mật khẩu → mỗi thao tác có 1 dòng audit với actor, thời gian, action, target; không dòng nào chứa mật khẩu ✅ `9542e97`
- [x] **MN-T04** (REQ-MN-04) · happy · integration — Container bị OOM (`State.OOMKilled = true`) → ca `exited`, `exit_reason = OOM`, có notification `OOM` ✅ `9542e97`

## Thông báo

- [x] **MN-T06** (REQ-SC-02, REQ-SC-06, REQ-MN-04, REQ-ST-02) · happy · integration — Có thông báo END_WARNING, START_FAILED, OOM, SOFT_QUOTA → `GET /notifications` trả đủ, mới nhất trước, có `kind`, `message`, `booking_id`, `created_at` (+07:00), `read_at`; `unread_count` đúng; `?unread=1` chỉ trả thông báo chưa đọc; `?limit=2` trả 2 ✅ `9542e97`
- [x] **MN-T07** (REQ-SC-02) · negative · integration — User B không thấy thông báo của A; B đánh dấu đã đọc thông báo của A → `404 NOT_FOUND`, thông báo của A vẫn chưa đọc ✅ `9542e97`
- [x] **MN-T08** (REQ-SC-02) · happy · integration — `POST /notifications/:id/read` → `204`, `read_at` được ghi, `unread_count` giảm 1; `POST /notifications/read-all` → mọi thông báo đã đọc, `unread_count = 0` ✅ `9542e97`
- [ ] **MN-T09** (REQ-MN-01) · happy · integration — `GET /bookings/:id/metrics` có `cpus` (số lõi được cấp), `mem_bytes`, `mem_limit_bytes`, `gpu.util_percent`, `gpu.mem_used_bytes`, `gpu.mem_total_bytes`
- [ ] **MN-T10** (REQ-MN-03) · happy · integration — Container bị OOM → audit `booking.oom`; khởi chạy lỗi → audit `booking.start_failed`; cả hai có người thực hiện `system`. `GET /admin/audit` lọc đúng theo `user` (người thực hiện hoặc chủ ca), `action` (đúng tên hoặc tiền tố), `from`/`to`
