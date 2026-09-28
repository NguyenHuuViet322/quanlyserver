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
- [ ] **CT-T10** (REQ-CT-05) · negative · unit — `buildRunArgs` với cổng ngoài dải → ném lỗi, không sinh lệnh; cổng trong dải → `-p 127.0.0.1:p:p` (không bao giờ `-p p:p`)
- [x] **CT-T11** (REQ-CT-06) · negative · unit — `buildRunArgs` với image ngoài danh sách → ném lỗi, không sinh lệnh ✅ `958a25c`
- [ ] **CT-T12** (REQ-CT-07) · edge · system — Phiên GPU và phiên không GPU chạy song song, cả hai tải tối đa → mỗi phiên giữ đúng giới hạn, không phiên nào bị dừng

## Truy cập SSH — xem docs/10-design/ssh.md

- [ ] **CT-T13** (REQ-CT-08) · happy · system — User có ca đang chạy: `ssh vietnh@server` → shell trong container (`id -u` = UID của user, `pwd` = `/workspace`, `cat /proc/1/cmdline` là `sleep infinity`); `ssh vietnh@server nvidia-smi` chạy trong container
- [ ] **CT-T14** (REQ-CT-08) · negative · system — User không có ca: `ssh vietnh@server` và `ssh vietnh@server id` → in "Bạn chưa có ca đang chạy", mã thoát ≠ 0, không lệnh nào chạy trên máy chủ
- [ ] **CT-T15** (REQ-CT-08) · negative · system — A và B cùng có ca: B SSH vào container của B; `sudo vmu-exec` gọi trực tiếp kèm tên container của A → vẫn chỉ vào container của B
- [ ] **CT-T16** (REQ-CT-09) · happy · system — Không có ca: `sftp`, `scp`, `rsync` chép lên/xuống `/data/users/vietnh` được; đọc `/data/users/<user khác>` → `Permission denied`
- [ ] **CT-T17** (REQ-CT-09) · negative · unit — `vmu-enter` với lệnh `rsync --server . ; id`, `scp -t x && id`, `rsync --server $(id)` → rsync/scp nhận `;`, `&&`, `$(id)` như tham số thường, không có shell nào trên máy chủ thực thi chúng; lệnh khác (`nvidia-smi`) được chuyển nguyên cho `vmu-exec`
- [ ] **CT-T18** (REQ-CT-10) · happy · unit — `renderSshdUsers`: mỗi user `active`/`locked` có `Match User` với `PermitOpen` đúng 200 mục (`localhost` và `127.0.0.1` × 100 cổng trong dải); user `pending`/`deleted` không có khối nào
- [ ] **CT-T19** (REQ-CT-10) · negative · system — `ssh -L 10001:localhost:10001` (trong dải) tới được Jupyter; `-L 10101:localhost:10101` (dải người khác) → `administratively prohibited`; từ máy khác `curl http://<server>:10001` → không kết nối được
