# Test case

Checklist gốc của dự án. Mỗi dòng có dạng:

```
- [ ] **<ID>** (<REQ…>) · <loại> · <tầng> — <điều kiện đầu> → <kết quả mong đợi>
```

- **Loại:** `happy` (đúng), `negative` (dữ liệu sai, không có quyền), `edge` (trường hợp biên, đồng thời).
- **Tầng:** `unit`, `integration`, `system` (cần server có GPU), `e2e` (Playwright), `manual` (chỉ cho tài liệu).
- Tên test tự động phải bắt đầu bằng ID, vd `test('BK-T09 từ chối ca GPU chồng lên ca GPU khác', …)`.
- **Không tick bằng tay.** Chạy `node tools/sync-ticks.js reports` để tick hoặc bỏ tick từ báo cáo JUnit. Test `system`/`manual`: đính kèm log vào `reports/system/` và dùng `--manual <ID>`.

| File | Module | Số test case |
|---|---|---|
| [users.md](users.md) | M1 Người dùng & xác thực | 30 |
| [booking.md](booking.md) | M2 Đặt lịch | 40 |
| [scheduler.md](scheduler.md) | M3 Scheduler | 14 |
| [container.md](container.md) | M4 Container | 12 |
| [storage.md](storage.md) | M5 Lưu trữ | 7 |
| [monitoring.md](monitoring.md) | M6 Giám sát & log | 5 |
| [dashboard.md](dashboard.md) | M7 Dashboard | 11 |
| [deployment.md](deployment.md) | M8 Triển khai | 6 |
| | **Tổng** | **125** |

## Gate Bước 3

- [x] Mỗi `REQ-…` có ≥ 1 test case — kiểm bằng [traceability.md](../traceability.md)
- [x] Mỗi mã lỗi trong docs có ≥ 1 test case gây ra nó — kiểm bằng bảng mã lỗi trong [api.md](../10-design/api.md)
