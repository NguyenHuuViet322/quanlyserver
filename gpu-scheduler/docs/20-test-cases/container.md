# M4 — Container

Test `unit` kiểm tra mảng tham số do `buildRunArgs` sinh ra; test `system` chạy trên server có GPU.

- [ ] **CT-T01** (REQ-CT-01) · happy · system — Phiên GPU: `nvidia-smi` trong container thấy RTX 5090
- [ ] **CT-T02** (REQ-CT-01) · negative · system — Phiên không GPU: `torch.cuda.is_available()` trả `False`; `buildRunArgs` không có `--gpus`
- [ ] **CT-T03** (REQ-CT-02) · happy · system — `docker inspect`: `Memory = MemorySwap = 28 GiB`, `ShmSize = 8 GiB`
- [ ] **CT-T04** (REQ-CT-02) · edge · system — Tiến trình cấp phát 30 GB RAM → bị OOM trong container, host vẫn hoạt động, ca `exit_reason = OOM`
- [x] **CT-T05** (REQ-CT-02) · happy · unit — Host N = 32 → `--cpus 15`; N = 16 → `--cpus 7` ✅ `3e9e726`
- [ ] **CT-T06** (REQ-CT-03) · negative · system — Trong container chỉ thấy `/workspace` của mình; `ls /data/users` không tồn tại
- [ ] **CT-T07** (REQ-CT-03) · negative · system — Ghi vào `/shared` → lỗi `Read-only file system`
- [ ] **CT-T08** (REQ-CT-04) · happy · system — `id -u` trong container = UID của user, không phải 0
- [x] **CT-T09** (REQ-CT-04) · negative · unit — `buildRunArgs` không chứa `--privileged`, `--cap-add`, `docker.sock`, `--network=host`, `--restart`, `-p`; có `no-new-privileges`, `--user <uid>:<uid>` ✅ `3e9e726`
- [x] **CT-T10** (REQ-CT-05) · negative · unit — `buildRunArgs` không có `-p`/`--publish`, luôn có `--network vmu-net` ✅ `3e9e726`
- [x] **CT-T11** (REQ-CT-06) · happy · unit — `buildRunArgs` luôn dùng `BASE_IMAGE` (bỏ qua mọi image khác), đặt `HOME=/workspace` và `TZ`; đúng 3 mount: `/workspace` (rw), `/shared` (ro), `authorized_keys` → `/etc/vmu/authorized_keys` (ro) ✅ `3e9e726`
- [ ] **CT-T12** (REQ-CT-07) · edge · system — Phiên GPU và phiên không GPU chạy song song, cả hai tải tối đa → mỗi phiên giữ đúng giới hạn, không phiên nào bị dừng

## Truy cập SSH — xem docs/10-design/ssh.md

- [ ] **CT-T13** (REQ-CT-08) · happy · system — User có ca đang chạy: `ssh vietnh@server` → shell trong container (`id -u` = UID của user, `pwd` = `/workspace`, `cat /proc/1/cmdline` là `sleep infinity`); `ssh vietnh@server nvidia-smi` chạy trong container
- [ ] **CT-T14** (REQ-CT-08) · negative · system — User không có ca: `ssh vietnh@server` và `ssh vietnh@server id` → in "Bạn chưa có ca đang chạy", mã thoát ≠ 0, không lệnh nào chạy trên máy chủ
- [ ] **CT-T15** (REQ-CT-08) · negative · system — A và B cùng có ca: B SSH vào container của B; `sudo vmu-exec` gọi trực tiếp kèm tên container của A → vẫn chỉ vào container của B
- [ ] **CT-T16** (REQ-CT-09) · happy · system — Không có ca: `sftp`, `scp`, `rsync` chép lên/xuống `/data/users/vietnh` được; đọc `/data/users/<user khác>` → `Permission denied`
- [x] **CT-T17** (REQ-CT-09) · negative · unit — `vmu-enter` với lệnh `rsync --server . ; id`, `scp -t x && id`, `rsync --server $(id)` → rsync/scp nhận `;`, `&&`, `$(id)` như tham số thường, không có shell nào trên máy chủ thực thi chúng; lệnh khác (`nvidia-smi`) được chuyển nguyên cho `vmu-exec` ✅ `3e9e726`
- [ ] **CT-T19** (REQ-CT-05) · negative · system — Từ container A kết nối tới IP:cổng của container B → thất bại; tới PostgreSQL/backend của máy chủ → thất bại; từ máy khác trong mạng không tới được cổng nào của container; container vẫn `pip install` được (Internet chiều ra)
- [x] **CT-T20** (REQ-CT-11) · happy · unit — `vmu-enter` với lệnh đúng `vmu-connect` → `sudo -n /usr/local/sbin/vmu-exec --connect`; `vmu-connect ; id` hay `vmu-connect x` không được coi là `vmu-connect` ✅ `3e9e726`
- [ ] **CT-T21** (REQ-CT-11) · happy · system — Có ca: `ssh -o ProxyCommand="ssh vietnh@server vmu-connect" vmu` bằng key → shell trong container (UID của user, `/workspace`); `-L 8888:localhost:8888` tới Jupyter chạy trên `127.0.0.1` trong container; VS Code Remote-SSH kết nối và mở terminal
- [ ] **CT-T22** (REQ-CT-11) · negative · system — Chỉ có mật khẩu, không có key → sshd trong container từ chối; key của user khác → từ chối; không có ca → thông báo "Bạn chưa có ca đang chạy"; host key trong container giống nhau ở hai ca liên tiếp
- [x] **CT-T23** (REQ-CT-11) · happy · integration — Sau `docker run`, Scheduler chạy đúng một lệnh bằng root trong container thêm `<username>:x:<uid>:<uid>::/workspace:/bin/bash` vào `/etc/passwd` và `<username>:x:<uid>:` vào `/etc/group`; khởi động lại ca thì thêm lại cho container mới ✅ `3e9e726`
