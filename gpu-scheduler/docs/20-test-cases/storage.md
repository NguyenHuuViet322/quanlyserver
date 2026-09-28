# M5 — Lưu trữ

- [ ] **ST-T01** (REQ-ST-01) · happy · system — Duyệt user → `xfs_quota report` có project UID với `bsoft = 80g`, `bhard = 100g`
- [ ] **ST-T02** (REQ-ST-01) · negative · system — Ghi vượt 100 GiB → lỗi `EDQUOT` (Disk quota exceeded)
- [ ] **ST-T03** (REQ-ST-02) · happy · integration — Dung lượng vượt 80 GiB → `GET /me` có `over_soft_since` và `grace_deadline = over_soft_since + 7 ngày`; có notification `SOFT_QUOTA`
- [ ] **ST-T07** (REQ-ST-02) · edge · system — Vượt 80 GiB quá grace period (đặt timer 1 phút khi test) → không ghi thêm được; xóa bớt xuống dưới 80 GiB → ghi lại được
- [ ] **ST-T04** (REQ-ST-03) · negative · system — Ghi > 20 GB vào writable layer (ngoài `/workspace`) → bị chặn
- [ ] **ST-T05** (REQ-ST-04) · happy · system — Tạo file trong `/workspace` ở ca 1 → còn nguyên ở ca 2
- [ ] **ST-T06** (REQ-ST-05) · happy · system — Dung lượng trên `GET /me` lệch ≤ 1% so với `xfs_quota`
