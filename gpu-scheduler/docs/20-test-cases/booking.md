# M2 — Đặt lịch (cốt lõi)

Ký hiệu giờ `08–10` là ca 08:00–10:00 cùng một ngày trong 7 ngày tới. Mặc định ca của user khác nhau, `use_gpu = false`, image hợp lệ.

## Hợp lệ dữ liệu & thời gian

- [x] **BK-T01** (REQ-BK-01) · happy · integration — Server trống, đặt ca hợp lệ → `201`, `status = scheduled` ✅ `99b5b82`
- [x] **BK-T02** (REQ-BK-01) · negative · unit — `end ≤ start` → `400 INVALID_TIME`, `reason = END_BEFORE_START` ✅ `99b5b82`
- [x] **BK-T03** (REQ-BK-01) · negative · unit — `start` trong quá khứ → `400 INVALID_TIME`, `reason = IN_PAST` ✅ `99b5b82`
- [x] **BK-T04** (REQ-BK-01) · edge · unit — Ca 9 giờ (08:00–17:00) → `400 INVALID_TIME` (`TOO_LONG`); đúng 8 giờ (08:00–16:00) → hợp lệ ✅ `99b5b82`
- [x] **BK-T24** (REQ-BK-01) · edge · unit — Ca 09:00–09:30 → `400 INVALID_TIME` (`NOT_ALIGNED`); `start = end` → `END_BEFORE_START`; ca ngắn nhất 09:00–10:00 (1 giờ) → hợp lệ ✅ `99b5b82`
- [x] **BK-T05** (REQ-BK-01) · negative · unit — Mốc 09:10, 09:30, 09:00:30, 09:00:00.500 (giờ VN) → `400 INVALID_TIME`, `reason = NOT_ALIGNED` ✅ `99b5b82`
- [x] **BK-T06** (REQ-BK-01) · edge · unit — `start = now + 7 ngày + 1 giờ` → `400 INVALID_TIME` (`BEYOND_HORIZON`); `start` đúng biên 7 ngày → hợp lệ ✅ `99b5b82`
- [x] **BK-T25** (REQ-BK-10) · negative · integration — Thiếu `use_gpu` → `400 VALIDATION_ERROR` ✅ `99b5b82`
- [x] **BK-T31** (REQ-BK-10, REQ-CT-06) · negative · integration — `image = "ubuntu:latest"` (ngoài danh sách) → `400 IMAGE_NOT_ALLOWED` ✅ `99b5b82`
- [x] **BK-T32** (REQ-BK-10, REQ-CT-05) · negative · integration — User dải 10000–10099 xin cổng `10100` → `400 PORT_NOT_ALLOWED`; cổng `10099` → `201` ✅ `99b5b82`

## Giới hạn đồng thời

- [x] **BK-T07** (REQ-BK-02) · happy · unit — Có 1 ca không GPU chồng, đặt ca không GPU → hợp lệ ✅ `99b5b82`
- [x] **BK-T08** (REQ-BK-02, REQ-BK-03) · happy · unit — Có 1 ca GPU chồng, đặt ca không GPU → hợp lệ ✅ `99b5b82`
- [x] **BK-T09** (REQ-BK-03) · negative · integration — Có ca GPU 08–10 của A, B đặt ca GPU 09–11 → `409 GPU_BUSY`, không có bản ghi mới ✅ `99b5b82`
- [x] **BK-T10** (REQ-BK-02) · negative · unit — A 08–10, B 08–10, đặt 09–11 → `409 SLOT_FULL` ✅ `99b5b82`
- [x] **BK-T11** (REQ-BK-02) · edge · unit — A 08–10, B 10–12, đặt 09–11 → hợp lệ (mỗi thời điểm chỉ 2 phiên) ✅ `99b5b82`
- [x] **BK-T12** (REQ-BK-02) · edge · unit — A 08–10, B 09–11, đặt 09–10 → `409 SLOT_FULL` ✅ `99b5b82`
- [x] **BK-T13** (REQ-BK-02, REQ-BK-03) · edge · unit — Ca GPU 08–10, đặt ca GPU 10–12 (kề nhau) → hợp lệ ✅ `99b5b82`
- [x] **BK-T14** (REQ-BK-04) · negative · integration — User A có 08–10, A đặt 09–11 → `409 USER_OVERLAP` ✅ `99b5b82`
- [x] **BK-T15** (REQ-BK-09) · edge · unit — Hai ca 08–10 ở trạng thái `cancelled`, `completed`, `failed` → đặt 08–10 GPU hợp lệ ✅ `99b5b82`
- [x] **BK-T29** (REQ-BK-03) · edge · unit — A 08–10 GPU, B 08–10 không GPU, đặt ca GPU 08–10 → `GPU_BUSY` (ưu tiên hơn `SLOT_FULL`) ✅ `99b5b82`

## Hạn mức GPU

- [x] **BK-T16** (REQ-BK-05) · negative · integration — Đã có 10 giờ GPU trong tuần, đặt ca GPU bắt đầu sau `now + 24h` → `409 GPU_QUOTA_EXCEEDED` ✅ `99b5b82`
- [x] **BK-T17** (REQ-BK-05) · edge · integration — Đã hết hạn mức, đặt ca GPU bắt đầu trước `now + 24h` → `201` ✅ `99b5b82`
- [x] **BK-T18** (REQ-BK-05) · happy · unit — Đã hết hạn mức GPU, đặt ca không GPU → hợp lệ ✅ `99b5b82`
- [x] **BK-T28** (REQ-BK-05) · edge · unit — Ca GPU Chủ nhật 22:00 – Thứ Hai 02:00 (giờ VN) → tính 2 giờ cho tuần cũ, 2 giờ cho tuần mới (ranh giới là Thứ Hai 00:00 VN = Chủ nhật 17:00 UTC) ✅ `99b5b82`

## Đồng thời & quyền

- [x] **BK-T19** (REQ-BK-06) · edge · integration — 2 request đồng thời tranh cùng một khung GPU → đúng 1 `201`, 1 `409 GPU_BUSY` ✅ `99b5b82`
- [x] **BK-T20** (REQ-BK-06) · edge · integration — 3 request đồng thời vào khung còn 1 chỗ → đúng 1 `201`, 2 `409` ✅ `99b5b82`
- [x] **BK-T21** (REQ-BK-07) · negative · integration — B hủy / kết thúc sớm / khởi động lại ca của A → `403 FORBIDDEN` ✅ `99b5b82`
- [x] **BK-T30** (REQ-BK-07) · happy · integration — Admin hủy ca `scheduled` của A → `200`, `cancelled` ✅ `99b5b82`
- [x] **BK-T27** (REQ-BK-07) · negative · integration — Hủy ca `id` không tồn tại → `404 NOT_FOUND` ✅ `99b5b82`
- [x] **BK-T22** (REQ-BK-08) · happy · integration — Hủy ca `scheduled` → `cancelled`; đặt lại ngay đúng khung đó → `201` ✅ `99b5b82`
- [ ] **BK-T23** (REQ-BK-08) · happy · system — Ca GPU 2 giờ, kết thúc sớm sau 30 phút → container dừng, `completed`, `gpu_hours_used ≈ 0,5`
- [x] **BK-T26** (REQ-BK-08) · negative · integration — Hủy ca `completed` → `409 INVALID_STATE` ✅ `99b5b82`

## Múi giờ — xem docs/10-design/time.md

Các test `unit` ở mục này (và toàn bộ unit test) chạy với `TZ=UTC`, `TZ=Asia/Ho_Chi_Minh`, `TZ=America/New_York`.

- [x] **BK-T33** (REQ-BK-11) · negative · integration — `start = "2026-10-05T09:00:00"` (không có múi giờ) → `400 INVALID_TIME`, `reason = MISSING_TIMEZONE` ✅ `99b5b82`
- [x] **BK-T34** (REQ-BK-11) · happy · integration — Đặt bằng `…T01:00:00Z` → `…T04:00:00Z` → `201`, response trả `start = …T08:00:00+07:00`, `end = …T11:00:00+07:00`; cùng user đặt lại khung đó bằng `+07:00` → `409 USER_OVERLAP` ✅ `99b5b82`
- [x] **BK-T35** (REQ-BK-12) · edge · unit — Giờ tròn xét theo giờ VN sau quy đổi: `11:00+09:00` (= 09:00 VN) hợp lệ; `09:00+05:30` (= 10:30 VN) → `NOT_ALIGNED` ✅ `99b5b82`
- [x] **BK-T36** (REQ-BK-12) · happy · unit — Ca qua nửa đêm 22:00 – 02:00 hôm sau (4 giờ) → hợp lệ; 20:00 – 05:00 hôm sau (9 giờ) → `TOO_LONG` ✅ `99b5b82`
- [x] **BK-T37** (REQ-BK-05, REQ-BK-12) · edge · integration — User đã hết 10 giờ GPU tuần này, `now` = Thứ Sáu. Đặt ca GPU Chủ nhật 23:00–24:00 VN → `409 GPU_QUOTA_EXCEEDED`; đặt Thứ Hai 00:00–01:00 VN (tuần mới) → `201` ✅ `99b5b82`
- [x] **BK-T38** (REQ-BK-12) · edge · unit — Chạy toàn bộ kiểm tra thời gian (BK-T02..T06, T24, T28, T35, T36) với 3 giá trị `TZ` của tiến trình → kết quả giống hệt nhau ✅ `99b5b82`
- [x] **BK-T39** (REQ-BK-01) · edge · unit — `now` = 09:20 VN: đặt 09–10 → `IN_PAST`; đặt 10–11 → hợp lệ ✅ `99b5b82`
- [x] **BK-T40** (REQ-BK-01, REQ-BK-12) · edge · unit — `now` = 23:30 VN ngày 05/10: đặt ca 00:00–02:00 ngày 06/10 → hợp lệ (không bị hiểu nhầm là ngày 05/10 theo UTC) ✅ `99b5b82`
