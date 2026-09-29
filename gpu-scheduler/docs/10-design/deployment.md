# Triển khai — REQ-DP-01..09

Một mã nguồn, một script cài đặt [`deploy/install.sh`](../../deploy/install.sh), hai profile:

| | `prod` — máy chủ thật | `test` — VPS thử nghiệm |
|---|---|---|
| Phần cứng | RTX 5090, 64 GiB RAM, nhiều nhân | 1 vCPU, 1 GiB RAM, không GPU (KVM, không dùng OpenVZ/LXC) |
| `/data`, `/var/lib/docker` | Phân vùng XFS có sẵn (admin chuẩn bị, script chỉ kiểm tra) | Script tạo 2 file loop XFS trong `/var/lib/vmu-disks/` |
| GPU | NVIDIA driver có sẵn; script cài NVIDIA Container Toolkit | Không. Ca GPU sẽ `failed` khi đến giờ (Q17) |
| `BASE_IMAGE` | `vmu/base:cuda12.8` (từ `nvidia/cuda`) | `vmu/base:lite` (cùng Dockerfile, `--build-arg BASE=ubuntu:24.04`) |
| Swap | Không đụng tới | Tạo 2 GiB swap nếu RAM < 2 GiB và chưa có swap |

Hệ điều hành: **Ubuntu 24.04 LTS**, chạy script bằng root.

## Tham số tài nguyên — REQ-DP-07

Đọc từ `/etc/vmu/vmu.env` (unit systemd nạp bằng `EnvironmentFile=`) qua một hàm duy nhất `configFromEnv(env)` trong [`backend/src/config.js`](../../backend/src/config.js); `server.js`, `scheduler/main.js`, `cli.js` đều dùng hàm này.

| Biến | `prod` (= mặc định SPEC) | `test` |
|---|---|---|
| `SESSION_MEMORY` | `28G` | `256M` |
| `SESSION_SHM` | `8G` | `64M` |
| `HOST_RESERVED_MEMORY` | `8G` | `384M` |
| `HOST_RESERVED_CPU_THREADS` | `2` | `0` |
| `USER_QUOTA_SOFT` | `80G` | `1G` |
| `USER_QUOTA_HARD` | `100G` | `2G` |
| `USER_QUOTA_GRACE` | `7d` | `10m` |
| `CONTAINER_WRITABLE_LAYER` | `20G` | `2G` |
| `BASE_IMAGE` | `vmu/base:cuda12.8` | `vmu/base:lite` |

- Dung lượng: số byte, hoặc số nguyên kèm `K`/`M`/`G`/`T` (1024). `28GB`, `1.5G`, `-1`, `0` là sai.
- Thời gian: số nguyên kèm `d`/`h`/`m`.
- Sai → ném lỗi `Cấu hình sai: <TÊN_BIẾN> …`; tiến trình thoát mã ≠ 0 (systemd ghi vào journal).
- `CONTAINER_WRITABLE_LAYER` giữ dạng chuỗi cho `--storage-opt size=` (vd `20G`) sau khi đã kiểm tra.

Các biến khác trong `vmu.env`: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `PASSWORD_ENC_KEY`, `SSH_HOST`, `DASHBOARD_URL`, `HOST=127.0.0.1`, `PORT=3000`. File `root:vmu 0640`. Chạy lại script: **chỉ thêm biến còn thiếu**, không sinh lại `PASSWORD_ENC_KEY` hay mật khẩu CSDL (đổi khóa là mất mật khẩu SSH đang chờ hiển thị).

## Bộ nhớ host — REQ-DP-03

`checkHostMemory(cfg, totalBytes)`: `MAX_CONCURRENT_SESSIONS × SESSION_MEMORY ≤ totalBytes − HOST_RESERVED_MEMORY`, sai thì Scheduler từ chối chạy. `prod`: 2 × 28 = 56 ≤ 64 − 8. `test`: 2 × 256 MiB = 512 MiB ≤ ~960 MiB − 384 MiB.

## Bố cục trên máy

| Đường dẫn | Nội dung | Chủ sở hữu |
|---|---|---|
| `/opt/vmu/app` | Mã nguồn (`backend/`, `frontend/src/`, `deploy/`), `node_modules` production | `root:root 0755` |
| `/opt/vmu/node` | Node.js 24 bản chính thức từ nodejs.org (kiểm SHA-256) | `root` |
| `/etc/vmu/vmu.env` | Biến môi trường | `root:vmu 0640` |
| `/var/log/vmu/bookings` | Log container sau khi ca kết thúc | `vmu:vmu 0750` |
| `/data/users/<username>` | `/workspace` của user, XFS project quota | `root:root 0711` / user `0700` |
| `/data/shared` | Dữ liệu chung, mount chỉ đọc vào container | `root:root 0755` |
| `/var/lib/vmu-disks/{data,docker}.img` | Chỉ profile `test`: file loop XFS | `root 0600` |

User hệ thống `vmu` (không login, nhóm `docker`) chạy backend và Scheduler. Nhóm `vmu-users` cho người dùng.

## Script cài đặt — REQ-DP-08

```
sudo deploy/install.sh --profile test --domain vmu-test.duckdns.org --email admin@… --google-client-id 123….apps.googleusercontent.com
sudo deploy/install.sh --profile prod --domain gpu.vimaru.edu.vn --email … --google-client-id …
deploy/install.sh --profile test --print-env     # chỉ in vmu.env sẽ ghi (không cần root, không đổi gì)
```

| Cờ | Ý nghĩa |
|---|---|
| `--profile prod\|test` | Bắt buộc |
| `--domain` | Tên miền trỏ về máy; dùng cho Nginx, chứng chỉ Let's Encrypt, `SSH_HOST`, `DASHBOARD_URL` |
| `--email` | Email nhận thông báo của Let's Encrypt; không có thì `--register-unsafely-without-email` |
| `--google-client-id` | OAuth Client ID (Authorized JavaScript origin: `https://<domain>`). Không có → `chua-cau-hinh.apps.googleusercontent.com` (cài được, đăng nhập chưa chạy); truyền ở lần chạy sau thì ghi đè |
| `--self-signed` | Không xin Let's Encrypt, dùng chứng chỉ tự ký (chỉ để thử; đăng nhập Google sẽ không chạy) |
| `--data-disk 8G`, `--docker-disk 10G` | Chỉ `test`: kích thước 2 file loop |
| `--print-env` | In nội dung `vmu.env` rồi thoát |

Các bước (mỗi bước kiểm tra trạng thái trước khi làm, nên chạy lại an toàn):

1. Kiểm tra: root, Ubuntu 24.04, tham số.
2. Gói hệ thống: `postgresql`, `nginx`, `certbot`, `docker.io`, `docker-buildx`, `xfsprogs`, `quota`, `tzdata`, `chrony`, `openssh-server`, `sudo`, `rsync`, `curl`. Node.js 24 vào `/opt/vmu/node`.
3. Giờ: `timedatectl set-ntp true`, `set-timezone Asia/Ho_Chi_Minh` (chỉ cho log dễ đọc — REQ-DP-06).
4. Swap (chỉ `test`).
5. Đĩa: `prod` kiểm tra `findmnt` `/data` là `xfs` có `prjquota`, `/var/lib/docker` là `xfs` có `pquota` (hoặc `prjquota`), thiếu thì dừng và hướng dẫn. `test`: dừng Docker, tạo file loop, `mkfs.xfs`, thêm `/etc/fstab` (`loop,prjquota` / `loop,pquota`), mount, bật lại Docker. Grace period: `xfs_quota -x -c 'timer -p -b <USER_QUOTA_GRACE>' /data`.
6. Docker daemon (`/etc/docker/daemon.json`): `storage-driver: overlay2`, `features.containerd-snapshotter: false` — Docker 29 mặc định lưu image bằng containerd snapshotter ở `/var/lib/containerd`, không hỗ trợ `--storage-opt size=` (REQ-ST-03); log container `json-file` tối đa 2 × 50 MB. Drop-in `RequiresMountsFor=/var/lib/docker`.
7. User/nhóm: `vmu`, `vmu-users`; thư mục trong bảng bố cục.
8. Mã nguồn: `rsync` thư mục chứa script (bỏ `node_modules`, `.git`, `reports`, `test-results`, `frontend/tests`) vào `/opt/vmu/app`, `npm ci --omit=dev`.
9. Helper và SSH: `vmu-provision`, `vmu-exec` → `/usr/local/sbin`, `vmu-enter` → `/usr/local/bin`; `sshd_config.d/50-vmu.conf`; sudoers kiểm bằng `visudo -cf` trước khi cài; `sshd -t` rồi reload.
10. `vmu.env` (xem trên).
11. PostgreSQL: role + CSDL `vmu`, `ALTER SYSTEM SET timezone = 'UTC'`, chỉ nghe localhost (mặc định Ubuntu), `cli.js migrate`.
12. Docker: `prod` cài NVIDIA Container Toolkit + `nvidia-ctk runtime configure`; mạng `CONTAINER_NETWORK` với `enable_icc=false`; build `BASE_IMAGE` nếu chưa có.
13. systemd: cài unit, `daemon-reload`, `enable --now`.
14. Nginx + TLS: site từ mẫu, `certbot --nginx` (hoặc tự ký), `nginx -t`, reload.
15. Tường lửa `ufw`: cho phép OpenSSH, 80, 443 rồi bật.
16. `vmu-doctor`.

In ra: địa chỉ Dashboard, lệnh `promote-admin` cho admin đầu tiên.

## Dịch vụ — REQ-DP-01

| Unit | Tiến trình | Ghi chú |
|---|---|---|
| [`vmu-api.service`](../../deploy/systemd/vmu-api.service) | `node backend/src/server.js` | `User=vmu`, `Restart=always`, `RestartSec=2`, nghe `127.0.0.1:3000` |
| [`vmu-scheduler.service`](../../deploy/systemd/vmu-scheduler.service) | `node backend/src/scheduler/main.js` | Như trên, `After=docker.service postgresql.service` |
| [`vmu-purge.timer`](../../deploy/systemd/vmu-purge.timer) → `vmu-purge.service` | `node backend/src/cli.js purge` | Hằng ngày 03:00, `Persistent=true`: user đã xóa, log quá hạn, image quá hạn |

Cả hai service: `EnvironmentFile=/etc/vmu/vmu.env`, `StartLimitIntervalSec=0` (không bao giờ bỏ cuộc), **không** đặt `Environment=TZ=…` (REQ-BK-12). Các lệnh cần root đi qua `sudo vmu-provision` (sudoers chỉ cho đúng helper đó).

## Nginx — REQ-DP-02

Mẫu [`deploy/nginx/vmu.conf`](../../deploy/nginx/vmu.conf) (`__DOMAIN__`, `__APP__` được thay khi cài):

- `:80` → `301 https://$host$request_uri` (trừ `/.well-known/acme-challenge/` cho certbot).
- `:443` TLS, phục vụ tĩnh `frontend/src/` (`try_files $uri /index.html`), proxy `/api/` tới `127.0.0.1:3000`.
- `access_log` định dạng riêng không có Cookie; `location /api/me/password` tắt `access_log` (REQ-US-10).

## Dọn image — REQ-DP-04

`cli.js purge` gọi `imagesToRemove(images, { baseImageId, usedImageIds, now, retentionMs })`: xóa image tạo trước `now − IMAGE_RETENTION`, **trừ** `BASE_IMAGE` hiện hành và image có container (chạy hay dừng) đang dùng. Dữ liệu lấy từ `docker image ls` và `docker ps -a`; xóa bằng `docker rmi <id>` (không `-f`).

## `vmu-doctor` — REQ-DP-09

[`deploy/vmu-doctor`](../../deploy/vmu-doctor), đọc `/etc/vmu/vmu.env`. Mỗi mục một dòng `OK  …` / `FAIL …` (kèm gợi ý sửa), cuối cùng là tổng; có `FAIL` thì thoát `1`. Test `system` đính kèm output của lệnh này làm log (`reports/system/<ID>.log`).

| Mục | Cách kiểm |
|---|---|
| Dịch vụ | `systemctl is-active vmu-api vmu-scheduler postgresql nginx docker ssh`, `is-enabled vmu-purge.timer` |
| HTTPS | `curl -sI http://<domain>` → `301` + `Location: https://`; `curl -sk https://<domain>/api/config` → `200` |
| Backend chỉ nghe nội bộ | `ss -ltnH 'sport = :3000'` chỉ có `127.0.0.1` |
| Múi giờ CSDL | `SHOW timezone` = `UTC` |
| NTP | `timedatectl show -p NTPSynchronized` = `yes` |
| Đĩa | `findmnt -no FSTYPE,OPTIONS` cho `/data` (`xfs`, `prjquota`) và `/var/lib/docker` (`xfs`, `pquota`/`prjquota`) |
| Docker | `docker info`: driver `overlay2`, Backing Filesystem `xfs` |
| Mạng container | `docker network inspect` có `enable_icc = false` |
| Image | `docker image inspect $BASE_IMAGE`; `docker run --rm $BASE_IMAGE test -f /usr/share/zoneinfo/Asia/Ho_Chi_Minh` |
| SSH | `sshd -t` |
| GPU (`prod`) | `docker run --rm --gpus all $BASE_IMAGE nvidia-smi -L` |

## Mạng container — REQ-CT-05

`docker network create --driver bridge -o com.docker.network.bridge.enable_icc=false vmu-net`. PostgreSQL và backend chỉ nghe `127.0.0.1`.

## Đồng hồ và múi giờ — REQ-DP-06

- NTP: `chrony`; `timedatectl` phải báo `System clock synchronized: yes`.
- `ALTER SYSTEM SET timezone = 'UTC'` và `log_timezone = 'Asia/Ho_Chi_Minh'`.
- Unit systemd không đặt `TZ`.

## Tài liệu — REQ-DP-05

- Người dùng: [`docs/huong-dan-su-dung.md`](../huong-dan-su-dung.md) — đăng nhập, mật khẩu, SSH, SSH key, đặt ca, VS Code, Jupyter, lưu dữ liệu, **tự sao lưu**.
- Quản trị: [`docs/huong-dan-trien-khai.md`](../huong-dan-trien-khai.md) — thuê VPS / chuẩn bị máy chủ, chạy script, admin đầu tiên, cập nhật phiên bản, chạy test `system`.
