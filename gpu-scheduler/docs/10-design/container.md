# Container — REQ-CT-01..07, REQ-CT-11, REQ-ST-03

## Lệnh sinh ra

Hàm thuần `buildRunArgs({ booking, user, cpuThreads }, cfg)` ở `backend/src/container/run-args.js` trả về mảng tham số `docker run`. Unit test so khớp mảng này; system test chạy thật.

Ví dụ: host `N = 32` luồng, user `vietnh` (UID 2001), ca 42 có GPU:

```bash
docker run -d \
  --name vmu-bk-42 \
  --label vmu.booking=42 --label vmu.user=vietnh \
  --user 2001:2001 \
  --security-opt no-new-privileges \
  --network vmu-net \
  --cpus 15 \
  --memory 28g --memory-swap 28g \
  --shm-size 8g \
  --storage-opt size=20G \
  --gpus device=0 \
  -v /data/users/vietnh:/workspace:rw \
  -v /data/shared:/shared:ro \
  -v /home/vietnh/.ssh/authorized_keys:/etc/vmu/authorized_keys:ro \
  -w /workspace \
  -e HOME=/workspace \
  -e TZ=Asia/Ho_Chi_Minh \
  vmu/base:cuda12.8 \
  sleep infinity
```

| Tham số | Quy tắc | REQ |
|---|---|---|
| `--cpus` | `⌊(N − 2) / 2⌋` = 15 khi N = 32 | REQ-CT-02 |
| `--memory`, `--memory-swap` | bằng nhau = `SESSION_MEMORY` | REQ-CT-02 |
| `--shm-size` | `SESSION_SHM` | REQ-CT-02 |
| `--gpus device=0` | **chỉ khi `use_gpu = true`** | REQ-CT-01 |
| `--user` | UID:GID của user, không bao giờ `0` | REQ-CT-04 |
| `--network` | `CONTAINER_NETWORK` (tắt giao tiếp giữa các container); **không có `-p`** | REQ-CT-05 |
| `-v` | đúng 3 mount: `/workspace` (rw), `/shared` (ro), `authorized_keys` (ro, cho sshd trong container); không có `docker.sock` | REQ-CT-03, REQ-CT-04, REQ-CT-11 |
| `-e HOME` | `/workspace`: phần mềm tự cài (`pip`, `conda`, `~/.local`, VS Code server) được giữ qua các ca | REQ-CT-06 |
| image | luôn là `BASE_IMAGE` | REQ-CT-06 |
| `--storage-opt size` | `CONTAINER_WRITABLE_LAYER` | REQ-ST-03 |
| `-e TZ` | `CFG.TIMEZONE`; image phải có `tzdata` | REQ-SC-08, REQ-DP-06 |

**Không bao giờ có:** `--privileged`, `--cap-add`, `--pid=host`, `--network=host`, `-p`, `--restart` (REQ-SC-07: không tự khởi động lại).

Phiên không GPU giống hệt, chỉ bỏ `--gpus`. Trong container `torch.cuda.is_available()` trả `False`.

## Image chung `BASE_IMAGE` — REQ-CT-06

Build từ [`deploy/base-image/Dockerfile`](../../deploy/base-image/Dockerfile): Ubuntu 24.04 + CUDA runtime, Miniforge (conda/mamba), `bash`, `git`, `tmux`, `htop`, `rsync`, `openssh-server`, `tzdata`, `build-essential`, cùng script `/usr/local/sbin/vmu-sshd` và `/etc/vmu/sshd_config` (xem [ssh.md](ssh.md)). Admin cập nhật image (thêm phần mềm cần root theo yêu cầu người dùng) rồi đổi `BASE_IMAGE`; ca bắt đầu sau đó dùng bản mới.

Người dùng tự cài phần mềm không cần root:

| Loại | Cách |
|---|---|
| Thư viện Python | `pip install …`, `conda install …` (env nằm trong `/workspace/.conda`) |
| Công cụ hệ thống | `conda install -c conda-forge ffmpeg gcc cmake nodejs openjdk …` |
| Ngôn ngữ / công cụ có bộ cài cho người dùng | `rustup`, `nvm`, bản `.tar.gz` vào `~/.local` |
| Biên dịch từ mã nguồn | `./configure --prefix=$HOME/.local && make install` |

## Yêu cầu host

- `/var/lib/docker` trên XFS mount với `pquota` (bắt buộc cho `--storage-opt size`).
- NVIDIA driver hỗ trợ RTX 5090 + NVIDIA Container Toolkit.
- Mạng `vmu-net` tạo với `com.docker.network.bridge.enable_icc=false` ([ssh.md](ssh.md#mạng--req-ct-05)).
- Người dùng Linux của hệ thống **không** thuộc nhóm `docker`. Chỉ service backend/scheduler gọi Docker.
