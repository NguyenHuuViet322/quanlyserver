# Container — REQ-CT-01..07, REQ-ST-03

## Lệnh sinh ra

Hàm thuần `buildRunArgs(booking, user, host, cfg)` ở `backend/src/container/run-args.js` trả về mảng tham số `docker run`. Unit test so khớp mảng này; system test chạy thật.

Ví dụ: host `N = 32` luồng, user `vietnh` (UID 2001, dải 10000–10099), ca 42 có GPU, `ports = [10001, 10006]`:

```bash
docker run -d \
  --name vmu-bk-42 \
  --label vmu.booking=42 --label vmu.user=vietnh \
  --user 2001:2001 \
  --security-opt no-new-privileges \
  --cpus 15 \
  --memory 28g --memory-swap 28g \
  --shm-size 8g \
  --storage-opt size=20G \
  --gpus device=0 \
  -v /data/users/vietnh:/workspace:rw \
  -v /data/shared:/shared:ro \
  -w /workspace \
  -e TZ=Asia/Ho_Chi_Minh \
  -p 127.0.0.1:10001:10001 -p 127.0.0.1:10006:10006 \
  vmu/pytorch:2.8-cuda12.8 \
  sleep infinity
```

| Tham số | Quy tắc | REQ |
|---|---|---|
| `--cpus` | `⌊(N − 2) / 2⌋` = 15 khi N = 32 | REQ-CT-02 |
| `--memory`, `--memory-swap` | bằng nhau = `SESSION_MEMORY` | REQ-CT-02 |
| `--shm-size` | `SESSION_SHM` | REQ-CT-02 |
| `--gpus device=0` | **chỉ khi `use_gpu = true`** | REQ-CT-01 |
| `--user` | UID:GID của user, không bao giờ `0` | REQ-CT-04 |
| `-v` | chỉ đúng 2 mount trên; không có `docker.sock` | REQ-CT-03, CT-04 |
| `-p` | mỗi cổng `p` → `127.0.0.1:p:p`, `p` thuộc dải của user; chỉ tới được qua SSH tunnel ([ssh.md](ssh.md)) | REQ-CT-05, REQ-CT-10 |
| image | thuộc `ALLOWED_IMAGES` | REQ-CT-06 |
| `--storage-opt size` | `CONTAINER_WRITABLE_LAYER` | REQ-ST-03 |
| `-e TZ` | `CFG.TIMEZONE`; image phải có `tzdata` | REQ-SC-08, REQ-DP-06 |

**Không bao giờ có:** `--privileged`, `--cap-add`, `--pid=host`, `--network=host`, `--restart` (REQ-SC-07: không tự khởi động lại).

Phiên không GPU giống hệt, chỉ bỏ `--gpus`. Trong container `torch.cuda.is_available()` trả `False`.

`buildRunArgs` phải ném lỗi (không sinh lệnh) nếu cổng ngoài dải hoặc image không được phép: đây là lớp bảo vệ thứ hai sau kiểm tra ở API.

## Yêu cầu host

- `/var/lib/docker` trên XFS mount với `pquota` (bắt buộc cho `--storage-opt size`).
- NVIDIA driver hỗ trợ RTX 5090 + NVIDIA Container Toolkit.
- Người dùng Linux của hệ thống **không** thuộc nhóm `docker`. Chỉ service backend/scheduler gọi Docker.
