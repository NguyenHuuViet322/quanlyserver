# M6 — Giám sát & log

- [ ] **MN-T01** (REQ-MN-01) · happy · system — Phiên GPU đang chạy → `GET /bookings/:id/metrics` có CPU, RAM, GPU; `sampled_at` cách hiện tại ≤ 60 giây
- [ ] **MN-T02** (REQ-MN-02) · happy · integration — Ca đã `completed` → `GET /bookings/:id/logs` trả log của container
- [ ] **MN-T05** (REQ-MN-02) · edge · integration — Log quá 30 ngày (đồng hồ giả) → bị dọn, API trả `404 NOT_FOUND`
- [ ] **MN-T03** (REQ-MN-03) · happy · integration — Đặt, hủy, kết thúc sớm, khởi động lại, duyệt, khóa, xóa, cấp lại mật khẩu → mỗi thao tác có 1 dòng audit với actor, thời gian, action, target; không dòng nào chứa mật khẩu
- [x] **MN-T04** (REQ-MN-04) · happy · integration — Container bị OOM (`State.OOMKilled = true`) → ca `exited`, `exit_reason = OOM`, có notification `OOM` ✅ `958a25c`
