# M3 — Scheduler

Test `integration` dùng Docker giả (fake adapter) và đồng hồ giả; test `system` chạy Docker thật.

- [ ] **SC-T01** (REQ-SC-01) · happy · system — Ca đến giờ → container `vmu-bk-<id>` được tạo trong ≤ 60 giây, `status = running`
- [x] **SC-T02** (REQ-SC-02) · happy · integration — Còn 15 phút → đúng 1 notification `END_WARNING` dù chạy thêm 5 tick ✅ `958a25c`
- [x] **SC-T03** (REQ-SC-03) · happy · integration — Hết giờ → gọi `docker stop -t 120`, lưu log, `docker rm`, `status = completed` ✅ `958a25c`
- [ ] **SC-T04** (REQ-SC-03) · edge · system — Container bỏ qua SIGTERM → bị kill sau ~120 giây, ca vẫn `completed`
- [x] **SC-T05** (REQ-SC-04) · edge · integration — Hai tick chạy chồng nhau → chỉ 1 lần gọi `docker run` cho 1 ca ✅ `958a25c`
- [x] **SC-T06** (REQ-SC-05) · edge · integration — Khởi động Scheduler khi có container `vmu-bk-*` của ca `completed` → container bị dừng ✅ `958a25c`
- [x] **SC-T07** (REQ-SC-05) · edge · integration — Khởi động Scheduler khi ca `running` đang diễn ra mà thiếu container → container được tạo lại ✅ `958a25c`
- [x] **SC-T08** (REQ-SC-06) · negative · integration — `docker run` lỗi (image hỏng) → `status = failed`, có log lỗi, có notification `START_FAILED` ✅ `958a25c`
- [x] **SC-T09** (REQ-SC-07) · edge · integration — Container tự thoát trước giờ → `status = exited`, `exit_reason = EXITED`, không có lần `docker run` thứ hai ✅ `958a25c`
- [x] **SC-T10** (REQ-SC-07) · happy · integration — Ca `exited`, chủ ca gọi restart → `docker run` với tham số giống hệt lần đầu, `status = running` ✅ `958a25c`
- [x] **SC-T11** (REQ-SC-07) · negative · integration — Restart ca đang `running` hoặc ca đã quá `end` → `409 INVALID_STATE` ✅ `958a25c`
- [x] **SC-T12** (REQ-SC-01) · edge · integration — Scheduler tắt suốt thời gian của một ca, bật lại sau `end` → ca chuyển `failed`, không tạo container ✅ `958a25c`
- [x] **SC-T13** (REQ-SC-08) · edge · integration — Tiến trình chạy với `TZ=UTC`, ca 09:00–11:00 giờ VN → container khởi chạy lúc 02:00Z (± 60 giây), cảnh báo lúc 03:45Z, dừng lúc 04:00Z; không lệch 7 giờ ✅ `958a25c`
- [ ] **SC-T14** (REQ-SC-08) · happy · system — Trong container `echo $TZ` = `Asia/Ho_Chi_Minh`, `date +%z` = `+0700`; cảnh báo hết ca ghi "11:00 (GMT+7)"
