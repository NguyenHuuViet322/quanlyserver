# GPU Scheduler — Server VMU

Hệ thống đặt lịch dùng GPU RTX 5090 cho ~30 người dùng tại Đại học Hàng hải Việt Nam.

- Kế hoạch: [`../ke-hoach-server-vmu.md`](../ke-hoach-server-vmu.md)
- Quy trình phát triển: [`../quy-trinh-phat-trien.md`](../quy-trinh-phat-trien.md)

## Trạng thái

| Bước | Trạng thái |
|---|---|
| 1. Spec | ✅ Đã duyệt 2026-09-28 |
| 2. Docs | ✅ Đã duyệt 2026-09-28 |
| 3. Test case | ✅ 125 test case, đã duyệt 2026-09-28 |
| 4. Code | Đang làm M1 |

Ma trận truy vết: [docs/traceability.md](docs/traceability.md).

## Cấu trúc

```
docs/00-spec/SPEC.md        yêu cầu REQ-…, bảng cấu hình
docs/10-design/             API, CSDL, thời gian/múi giờ, scheduler, container, storage, dashboard, deployment
docs/20-test-cases/         checklist test case — tick bằng tools/sync-ticks.js
docs/traceability.md        tự sinh bởi tools/trace.js
backend/src/                time, auth, users, booking, scheduler, container, storage, monitoring
backend/tests/              unit, integration, system
frontend/src, tests/e2e     Dashboard, Playwright
deploy/                     systemd, nginx
reports/                    báo cáo JUnit; reports/system/<ID>.log cho test chạy tay
tools/                      trace.js, sync-ticks.js
```

## Lệnh

```bash
npm run trace:check        # Gate Bước 2–3 (tạm thời chưa có CI: chạy tay trước khi commit)
npm run trace              # sinh lại docs/traceability.md
npm run test:unit
npm run test:unit:tz        # unit test với 3 múi giờ (UTC, VN, New York) — chạy trước khi tick
npm run db:test            # khởi động PostgreSQL test trong Docker (cổng 55432)
npm run test:integration   # cần PostgreSQL, DATABASE_URL
npm run test:system        # trên server có GPU
npm run test:e2e
npm run sync-ticks         # tick/bỏ tick từ reports/*.xml
node tools/sync-ticks.js --manual SC-T04   # test system, cần reports/system/SC-T04.log
```
