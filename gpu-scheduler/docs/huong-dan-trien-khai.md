# Hướng dẫn triển khai — dành cho quản trị viên

Cùng một script [`deploy/install.sh`](../deploy/install.sh) cài được lên **VPS thử nghiệm** (profile `test`) và **máy chủ GPU thật** (profile `prod`). Thiết kế chi tiết: [10-design/deployment.md](10-design/deployment.md).

## 1. Chuẩn bị

### 1a. VPS thử nghiệm (profile `test`)

| Yêu cầu | Ghi chú |
|---|---|
| **Ảo hóa KVM** | Hỏi nhà cung cấp trước khi thuê. OpenVZ/LXC **không** chạy được Docker đầy đủ và không tạo được ổ loop XFS |
| Ubuntu **24.04** LTS, quyền root | Cài mới, chưa cài gì thêm |
| ≥ 1 vCPU, ≥ 1 GB RAM | 1 GB chạy được (script tự thêm 2 GB swap); 2 GB thì dễ thở hơn |
| Ổ đĩa ≥ 20 GB | Script tạo 2 file: 6 GB cho `/data`, 10 GB cho Docker (đổi bằng `--data-disk`, `--docker-disk`) |
| Tên miền trỏ về IP của VPS | Tên miền miễn phí kiểu `ten-ban.duckdns.org` cũng được. Cần cho HTTPS và đăng nhập Google |

Profile `test` **không có GPU**: đặt ca có GPU vẫn được nhưng đến giờ sẽ báo "Lỗi khởi chạy". Giới hạn cũng được thu nhỏ: mỗi phiên 256 MiB RAM, quota 1/2 GiB, grace 10 phút.

### 1b. Máy chủ thật (profile `prod`)

1. Cài Ubuntu 24.04 Server.
2. Cài **NVIDIA driver** cho RTX 5090 (vd `sudo ubuntu-drivers install`), khởi động lại, kiểm tra `nvidia-smi`.
3. Chuẩn bị **2 phân vùng XFS** (script chỉ kiểm tra, không đụng vào ổ đĩa thật):

   ```
   sudo mkfs.xfs /dev/nvme0n1p3            # cho /data (dữ liệu người dùng)
   sudo mkfs.xfs /dev/nvme0n1p4            # cho /var/lib/docker
   ```
   Thêm vào `/etc/fstab` (dùng `blkid` để lấy UUID):
   ```
   UUID=<…p3>  /data            xfs  defaults,prjquota  0 2
   UUID=<…p4>  /var/lib/docker  xfs  defaults,pquota    0 2
   ```
   rồi `sudo mkdir -p /data /var/lib/docker && sudo mount -a`.
4. Tên miền `gpu.vimaru.edu.vn` trỏ về máy, mở cổng 22, 80, 443 từ mạng trường.

### 1c. Google OAuth Client ID (cả hai profile)

1. <https://console.cloud.google.com/> → APIs & Services → Credentials → **Create credentials → OAuth client ID** → *Web application*.
2. **Authorized JavaScript origins**: `https://<tên miền>` (không có dấu `/` ở cuối).
3. Chép **Client ID** (dạng `123…apps.googleusercontent.com`).

## 2. Cài đặt

Đăng nhập VPS/máy chủ bằng SSH (user có sudo), rồi:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/NguyenHuuViet322/quanlyserver.git
cd quanlyserver/gpu-scheduler

# VPS thử nghiệm
sudo bash deploy/install.sh --profile test \
  --domain ten-ban.duckdns.org --email email-cua-ban@gmail.com \
  --google-client-id 123….apps.googleusercontent.com

# Máy chủ thật
sudo bash deploy/install.sh --profile prod \
  --domain gpu.vimaru.edu.vn --email admin@vimaru.edu.vn \
  --google-client-id 123….apps.googleusercontent.com
```

> Lấy mã bằng `git clone`, **không** chép thư mục từ máy Windows lên: file chép từ Windows có kết thúc dòng CRLF làm bash lỗi.

Lần đầu mất khoảng 10–20 phút (phần lâu nhất là build image). Script kết thúc bằng bảng `vmu-doctor`; mọi dòng phải là `OK`.

Chưa có tên miền? Có thể thử tạm bằng `--domain <IP> --self-signed`: Dashboard mở được (trình duyệt cảnh báo chứng chỉ) nhưng **đăng nhập Google sẽ không chạy**.

## 3. Admin đầu tiên

1. Mở `https://<tên miền>`, đăng nhập bằng tài khoản `@vimaru.edu.vn` của bạn (sẽ ở trạng thái chờ duyệt).
2. Trên máy chủ: `sudo vmu-cli promote-admin ten@vimaru.edu.vn`
3. Tải lại trang: có mục **Quản trị**; tự duyệt chính mình ở tab Duyệt tài khoản, rồi duyệt người khác.

## 4. Vận hành hằng ngày

| Việc | Lệnh |
|---|---|
| Kiểm tra toàn hệ thống | `sudo vmu-doctor` |
| Xem log backend / scheduler | `journalctl -u vmu-api -f`, `journalctl -u vmu-scheduler -f` |
| Khởi động lại | `sudo systemctl restart vmu-api vmu-scheduler` |
| Đổi tham số (RAM phiên, quota…) | Sửa `/etc/vmu/vmu.env` rồi khởi động lại hai dịch vụ trên |
| Dọn dẹp thủ công (chạy tự động 03:00) | `sudo vmu-cli purge` |

**Cập nhật phiên bản:** `cd quanlyserver && git pull && sudo bash gpu-scheduler/deploy/install.sh --profile <như lần đầu> --domain … ` — chạy lại an toàn, giữ nguyên khóa, mật khẩu CSDL và dữ liệu.

**Thêm phần mềm cần root vào image chung:** sửa `deploy/base-image/Dockerfile`, build với tag mới (vd `vmu/base:cuda12.8-v2`), đổi `BASE_IMAGE` trong `/etc/vmu/vmu.env`, khởi động lại `vmu-scheduler`. Ca bắt đầu sau đó dùng image mới; image cũ tự bị dọn sau 30 ngày không dùng.

## 5. Chạy test `system`

Các test case `system` trong [20-test-cases/](20-test-cases/README.md) chạy trên máy đã cài. Lưu output làm bằng chứng rồi tick bằng `--manual`:

```bash
sudo vmu-doctor | tee reports/system/DP-T13.log
node tools/sync-ticks.js --manual DP-T13 --commit <commit đã cài>
```

Trên VPS (profile `test`) **không tick** các test phụ thuộc GPU hoặc số liệu thật (CT-T01, CT-T12, MN-T01, BK-T23; số 28 GiB / 80–100 GiB trong CT-T03, CT-T04, DP-T03, ST-T01, ST-T02, ST-T07, US-T12): chạy lại trên máy chủ thật (Q17).

## 6. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Script dừng ở "không xin được chứng chỉ" | DNS chưa trỏ đúng IP, hoặc cổng 80 bị chặn ở tường lửa của nhà cung cấp |
| `FAIL /data là XFS có prjquota` (prod) | Xem mục 1b bước 3; mount lại rồi chạy lại script |
| `FAIL đồng hồ đồng bộ NTP` | Chờ vài phút sau khi cài; `chronyc tracking`. Một số VPS chặn NTP ra ngoài |
| Đăng nhập Google báo lỗi origin | Authorized JavaScript origins phải đúng `https://<tên miền>` |
| Ca GPU "Lỗi khởi chạy" trên VPS | Đúng như thiết kế (profile `test` không có GPU) |
