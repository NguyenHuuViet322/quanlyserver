# M4 — Container

Test `unit` kiểm tra mảng tham số do `buildRunArgs` sinh ra; test `system` chạy trên server có GPU.

- [ ] **CT-T01** (REQ-CT-01) · happy · system — Phiên GPU: `nvidia-smi` trong container thấy RTX 5090
- [ ] **CT-T02** (REQ-CT-01) · negative · system — Phiên không GPU: `torch.cuda.is_available()` trả `False`; `buildRunArgs` không có `--gpus`
- [ ] **CT-T03** (REQ-CT-02) · happy · system — `docker inspect`: `Memory = MemorySwap = 28 GiB`, `ShmSize = 8 GiB`
- [ ] **CT-T04** (REQ-CT-02) · edge · system — Tiến trình cấp phát 30 GB RAM → bị OOM trong container, host vẫn hoạt động, ca `exit_reason = OOM`
- [x] **CT-T05** (REQ-CT-02) · happy · unit — Host N = 32 → `--cpus 15`; N = 16 → `--cpus 7` ✅ `958a25c`
- [ ] **CT-T06** (REQ-CT-03) · negative · system — Trong container chỉ thấy `/workspace` của mình; `ls /data/users` không tồn tại
- [ ] **CT-T07** (REQ-CT-03) · negative · system — Ghi vào `/shared` → lỗi `Read-only file system`
- [ ] **CT-T08** (REQ-CT-04) · happy · system — `id -u` trong container = UID của user, không phải 0
- [x] **CT-T09** (REQ-CT-04) · negative · unit — `buildRunArgs` không chứa `--privileged`, `--cap-add`, `docker.sock`, `--network=host`, `--restart`; có `no-new-privileges` ✅ `958a25c`
- [x] **CT-T10** (REQ-CT-05) · negative · unit — `buildRunArgs` với cổng ngoài dải → ném lỗi, không sinh lệnh ✅ `958a25c`
- [x] **CT-T11** (REQ-CT-06) · negative · unit — `buildRunArgs` với image ngoài danh sách → ném lỗi, không sinh lệnh ✅ `958a25c`
- [ ] **CT-T12** (REQ-CT-07) · edge · system — Phiên GPU và phiên không GPU chạy song song, cả hai tải tối đa → mỗi phiên giữ đúng giới hạn, không phiên nào bị dừng
