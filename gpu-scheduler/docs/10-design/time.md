# Thời gian và múi giờ — REQ-BK-01, REQ-BK-11, REQ-BK-12, REQ-SC-08, REQ-UI-10, REQ-DP-06

Người dùng đăng ký ca theo giờ tròn, ví dụ "từ 8 giờ đến 11 giờ". Server, CSDL và trình duyệt có thể chạy ở múi giờ khác nhau, nên tài liệu này quy định rõ ở đâu dùng UTC, ở đâu dùng giờ Việt Nam.

## Nguyên tắc

| Lớp | Biểu diễn | Ghi chú |
|---|---|---|
| CSDL | `timestamptz`, session `timezone = 'UTC'` | Chỉ lưu thời điểm tuyệt đối |
| Backend — so sánh, sắp xếp, cộng trừ | Thời điểm UTC (epoch ms) | `now`, `start`, `end`, chồng lịch, tick Scheduler |
| Backend — quy tắc nghiệp vụ theo lịch | Giờ Việt Nam qua IANA `Asia/Ho_Chi_Minh` | Giờ tròn, ngày, tuần, "trong 7 ngày" |
| API | Nhận mọi offset, trả `+07:00` | Không nhận chuỗi thiếu múi giờ |
| Dashboard | Luôn giờ Việt Nam, nhãn "(GMT+7)" | Không dùng múi giờ trình duyệt |
| Container | `TZ=Asia/Ho_Chi_Minh` | Chỉ để người dùng đọc giờ quen thuộc |

**Thư viện:** dùng [Luxon](https://moment.github.io/luxon/) (`DateTime.fromISO(s, { setZone: true })`, `.setZone(CFG.TIMEZONE)`), hoặc `Temporal` khi Node.js hỗ trợ ổn định. Tất cả quy đổi nằm trong một module duy nhất `backend/src/time/`; phần code còn lại chỉ làm việc với thời điểm UTC.

## Những lỗi thường gặp phải tránh

| Sai | Hậu quả | Cách đúng |
|---|---|---|
| `new Date('2026-10-05T09:00:00')` (thiếu offset) | JS hiểu theo múi giờ của **máy chạy code**: server UTC ra 09:00Z = 16:00 VN | Bắt buộc có offset; từ chối `MISSING_TIMEZONE` |
| `date.getHours()`, `date.getDay()` | Trả giờ theo `TZ` của tiến trình, server UTC thì lệch 7 giờ | `DateTime.fromMillis(ms, { zone: CFG.TIMEZONE }).hour` |
| Kiểm tra giờ tròn bằng `ms % 3600000 === 0` | Chỉ đúng vì VN là +7 giờ chẵn; sai nếu cấu hình múi giờ lệch nửa giờ | Kiểm tra `minute = second = millisecond = 0` sau khi đổi sang giờ VN |
| `date_trunc('week', start_at)` trong PostgreSQL | Tính tuần theo UTC: Thứ Hai 00:00 UTC = 07:00 VN | `date_trunc('week', start_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'` |
| `start_at::date` | Ra ngày UTC; ca 01:00 VN bị tính sang hôm trước | `(start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` |
| Cộng cứng `+ 7 * 3600 * 1000` | Sai khi đổi `CFG.TIMEZONE`, khó đọc | Dùng thư viện IANA |
| `cron.schedule('0 3 * * *', …)` không có `timezone` | Chạy 03:00 theo giờ server (UTC) = 10:00 VN | Truyền `{ timezone: CFG.TIMEZONE }` |
| Dashboard dùng `toLocaleString()` mặc định | Người dùng ở nước ngoài hoặc máy đặt sai múi giờ thấy giờ lệch | `Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })` |
| `<input type="datetime-local">` gửi thẳng lên | Giá trị không có múi giờ | Form chọn ngày + giờ; client ghép thành `YYYY-MM-DDTHH:00:00+07:00` |

## Ví dụ quy đổi

| Người dùng chọn (giờ VN) | Gửi lên API | Lưu trong CSDL (UTC) |
|---|---|---|
| 05/10, 08:00 – 11:00 | `2026-10-05T08:00:00+07:00` → `…T11:00:00+07:00` | `2026-10-05 01:00Z` → `04:00Z` |
| 05/10, 22:00 – 06/10 02:00 | `…05T22:00:00+07:00` → `…06T02:00:00+07:00` | `05 15:00Z` → `05 19:00Z` |
| 05/10, 00:00 – 03:00 | `…05T00:00:00+07:00` → `…05T03:00:00+07:00` | `04 17:00Z` → `04 20:00Z` (ngày UTC là 04/10!) |
| Kết thúc "24:00" ngày 05/10 | `…06T00:00:00+07:00` | `05 17:00Z` |

## Ranh giới tuần (hạn mức GPU)

Tuần bắt đầu Thứ Hai 00:00 giờ VN = **Chủ nhật 17:00 UTC**. Ca GPU Chủ nhật 23:00 – Thứ Hai 01:00 (giờ VN) tính 1 giờ cho tuần cũ, 1 giờ cho tuần mới.

## Kiểm thử

- Unit test chạy trong CI với **ba** giá trị `TZ`: `UTC`, `Asia/Ho_Chi_Minh`, `America/New_York`. Kết quả phải giống hệt nhau (BK-T38).
- Test phụ thuộc thời gian dùng đồng hồ giả (`now` truyền vào hoặc `mock.timers`), không dùng `Date.now()` thật.
- E2E chạy trình duyệt với `timezoneId: 'America/New_York'` (UI-T10).
