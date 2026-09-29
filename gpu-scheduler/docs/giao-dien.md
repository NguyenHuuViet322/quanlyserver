# Thiết kế Giao diện Dashboard — VMU GPU Server

Tài liệu mô tả chi tiết cấu trúc, bố cục, các thành phần giao diện (UI) và luồng tương tác người dùng cho hệ thống **VMU GPU Server**.

Tất cả thiết kế đều tuân thủ **độ tương phản WCAG 2.x AA**, áp dụng hệ thống token màu sắc định nghĩa tại `frontend/src/styles.css` và tối ưu cho màn hình máy tính (Desktop View).

---

## 1. Cấu trúc Tổng thể (App Shell)

Mọi trang trong hệ thống sử dụng chung một khung bố cục cố định (App Shell) giúp người dùng dễ dàng định vị và điều hướng nhanh.

+---------------------------------------------------------------------------------------------------+
| [Logo VMU] VMU GPU Server   Lịch đặt ca    Ca của tôi    Tài khoản & Key    [Admin]      [🔔 2] [VietNH v] |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|                                [NỘI DUNG CHÍNH CỦA TRANG HIỆN TẠI]                                |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+


### Thành phần Thanh điều hướng (Header Navigation Bar)
- **Bên trái (Brand Area):** Logo VMU + Tên hệ thống `VMU GPU Server` (Dẫn về trang Lịch đặt ca).
- **Ở giữa (Navigation Links):**
  - **Lịch đặt ca:** Trang chính xem lịch và đăng ký ca.
  - **Ca của tôi:** Trạng thái ca đang chạy, lịch sử ca, xem log và thông số GPU/CPU.
  - **Tài khoản & Key:** Quản lý SSH Key, mật khẩu SSH, xem dung lượng `/workspace`.
  - **Quản trị (Admin):** Chỉ hiển thị đối với tài khoản Quản trị viên (Duyệt user, xem log hệ thống).
- **Bên phải (User Control & Status Area):**
  - **Nút Thông báo (Chuông):** Có badge đỏ `--vmu-red` hiển thị số thông báo chưa đọc (cảnh báo OOM, hết giờ, vượt quota).
  - **Menu Tài khoản (Profile Dropdown):**
    - Tên hiển thị & Email: `VietNH (vietnh@vimaru.edu.vn)`.
    - Thanh dung lượng nhanh: `32.5 / 100 GiB` (dạng mini progress bar).
    - Lựa chọn: *Đổi mật khẩu SSH*, *Đăng xuất*.

---

## 2. Trang 1: Lịch đặt ca (Trang chính / Homepage)

Đây là giao diện trung tâm giúp người dùng theo dõi và đăng ký khung giờ sử dụng máy chủ.

### 2.1. Thanh công cụ trên cùng (Control Bar)
- **Bộ chọn tuần:** `[ < ]  Tuần này: 29/09 - 06/10/2026  [ > ]` (Cho phép xem tối đa 7 ngày tới).
- **Hạn mức GPU tuần:** Badge nổi bật `Hạn mức GPU: 4/10 giờ` (Tự động chuyển màu cảnh báo `--warning` nếu đã dùng > 8 giờ).
- **Nút hành động:** `[+ Đặt ca mới]` (Button màu thương hiệu `--brand`).
- **Chú giải trạng thái (Legend):**
  - `[ █ Ca của bạn ]` (Nền `--brand`)
  - `[ █ Ca GPU người khác ]` (Nền xám đậm + chip `GPU`)
  - `[ █ Ca CPU người khác ]` (Nền xám nhạt)
  - `[ █ Đã qua / Bận ]` (Kẻ sọc mờ)

### 2.2. Bảng Lịch 8 ngày (Grid Timeline Table)
- **Trục dọc (Y):** Danh sách 24 khung giờ từ `00:00` đến `23:00` (dùng font `tabular-nums` để số không bị dịch chuyển).
- **Trục ngang (X):** 8 cột tương ứng 8 ngày tới. Cột "Hôm nay" được làm nổi bằng màu nền nhạt `--brand-softer`.
- **Vạch thời gian thực (Live Time Indicator):** Một đường kẻ ngang màu đỏ `--vmu-red` có chấm tròn xuyên qua lịch, chỉ chính xác mốc giờ hiện tại.
- **Tương tác trực tiếp:**
  - Click/Rê chuột vào bất kỳ vùng trống nào mở ngay **Modal Đặt ca** với thông tin ngày/giờ đã được điền sẵn.
  - Hover vào khối ca của người khác hiện tooltip ngắn: `Trạng thái: Đã đặt | Loại: Có GPU`.

---

## 3. Trang 2: Ca của tôi & Giám sát phiên đang chạy

Màn hình chuyên biệt dành cho việc theo dõi tài nguyên thực tế, lấy thông tin kết nối SSH/VS Code và xử lý khi gặp sự cố.

### 3.1. Khối Ca đang hoạt động (Active Session Header)
*Chỉ xuất hiện khi người dùng đang có ca chạy ở trạng thái `running` hoặc `starting`.*

+---------------------------------------------------------------------------------------------------+
| 🟢 CA ĐANG CHẠY (#1024) — Kết thúc lúc 17:00 (Còn 01 giờ 25 phút)      [Mở Nhật Ký]  [Kết thúc sớm] |
| Hạn mức: RTX 5090 (1 GPU) | 14/28 GiB RAM | 4 CPU Cores                                           |
+---------------------------------------------------------------------------------------------------+
| [ 📊 Giám sát tài nguyên ]  [ 🔌 Hướng dẫn kết nối ]  [ 📋 Nhật ký container (Logs) ]             |
|                                                                                                   |
|  (Đồ thị dòng thời gian real-time: % GPU Util, VRAM, CPU, RAM)                                   |
+---------------------------------------------------------------------------------------------------+


- **Các tab chức năng:**
  1. **📊 Giám sát tài nguyên (Real-time Metrics):** Biểu đồ thể hiện mức độ tiêu thụ GPU VRAM, GPU Utilisation, CPU, RAM theo thời gian thực (cập nhật mỗi 5 giây).
  2. **🔌 Hướng dẫn kết nối (Quick Connect):**
     - Đoạn mã lệnh SSH kết nối nhanh: `ssh vietnh@gpu.vimaru.edu.vn` (Kèm nút **Copy 1-click**).
     - File cấu hình đề xuất cho `~/.ssh/config` kết nối VS Code Remote SSH qua `vmu-connect`.
  3. **📋 Nhật ký container (Logs):** Cửa sổ hiển thị stdout/stderr thực tế của container.
- **Thao tác nhanh:**
  - `Khởi động lại container`: Dùng khi container bị văng/OOM nhưng ca vẫn trong khung giờ.
  - `Kết thúc sớm`: Trả lại tài nguyên cho hệ thống và giải phóng ca (Nút màu đỏ nhạt `--danger-soft`).

### 3.2. Bảng Danh sách Ca (Upcoming & History)
Bảng lưu trữ lịch sử và các ca đã đăng ký trước:

| Mã ca | Thời gian | GPU | Trạng thái | Thao tác |
| :--- | :--- | :---: | :--- | :--- |
| `#1028` | `20:00 - 22:00` (Hôm nay) | ⚡ Có | `<Badge: Sắp tới>` | `[Hủy ca]` |
| `#1012` | `08:00 - 12:00` (Hôm qua) | ⚡ Có | `<Badge: Hoàn thành>` | `[Xem log]` |
| `#0995` | `14:00 - 18:00` (26/09) | ❌ Không | `<Badge: Dừng OOM>` | `[Xem lý do]` |

---

## 4. Trang 3: Quản lý Dung lượng & Tài khoản SSH

Nơi quản lý dữ liệu lưu trữ cá nhân, khóa xác thực SSH và khôi phục tài khoản.

### 4.1. Thẻ Hạn mức Lưu trữ (Storage Quota Card)
- **Thanh dung lượng (Progress Bar):**
  - Hiển thị mức dùng hiện tại trên thư mục `/workspace` (đọc từ XFS quota).
  - Trạng thái màu sắc tự động:
    - `< 80 GiB`: Màu xanh chủ đạo `--brand`.
    - `80 - 100 GiB`: Màu vàng cảnh báo `--warning` (Kèm thông báo yêu cầu dọn dẹp trong 7 ngày).
    - `≥ 100 GiB`: Màu đỏ nguy hiểm `--danger` (Đĩa bị khóa quyền ghi `Read-Only`).
- **Ghi chú sao lưu:** Hộp thông tin nhắc nhở: *Hệ thống không tự động sao lưu dữ liệu. Vui lòng kết nối SFTP/SCP để tải các file quan trọng về máy cá nhân.*

### 4.2. Thẻ Quản lý SSH Public Keys
- Danh sách các khóa SSH đã thêm vào tài khoản (Tên khóa, Fingerprint, Ngày khởi tạo).
- **Form thêm SSH Key mới:**
  - Ô nhập tên gợi nhớ (ví dụ: `Laptop Macbook Pro`).
  - Ô nhập chuỗi khóa public (`ssh-ed25519 ...` hoặc `ssh-rsa ...`).
  - Nút `[+ Thêm SSH Key]`.

### 4.3. Thẻ Cấp lại Mật khẩu SSH
- Nút bấm `[Tạo lại mật khẩu SSH ngẫu nhiên]`.
- Khi bấm sẽ yêu cầu xác nhận và hiển thị một hộp thoại chứa mật khẩu mới **chỉ hiện 1 lần duy nhất** kèm nút sao lưu.

---

## 5. Trang 4: Bảng Điều khiển Admin (Dành riêng cho Admin)

Chỉ mở rộng cho tài khoản Quản trị viên để kiểm soát toàn bộ máy chủ và người dùng.

### 5.1. Tab Duyệt Tài Khoản (Pending Users)
- Bảng chứa danh sách sinh viên/giảng viên vừa đăng nhập Google `@vimaru.edu.vn` lần đầu.
- Cột thông tin: Email, Họ tên, Thời gian đăng nhập.
- Nút bấm hành động nhanh: `[Duyệt tài khoản]` (Tự động chạy `vmu-provision` khởi tạo user Linux + Quota 100 GiB) hoặc `[Từ chối]`.

### 5.2. Tab Quản lý Người dùng (Users Management)
- Danh sách 30 tài khoản trong hệ thống.
- **Thao tác quản trị:**
  - `Khóa tài khoản`: Tự động ngắt phiên đang chạy và hủy toàn bộ ca đã đặt trong tương lai.
  - `Xóa tài khoản`: Giữ lại thư mục dữ liệu trong 30 ngày trước khi xóa hẳn.
  - `Reset Mật khẩu SSH`: Khôi phục mật khẩu hỗ trợ người dùng.

### 5.3. Tab Nhật ký Hệ thống (Audit Logs)
- Ghi lại mọi thao tác quan trọng trong hệ thống (Duyệt user, hủy ca, cảnh báo OOM, lỗi hệ thống).
- Bộ lọc theo: *Tên người dùng*, *Loại sự kiện*, *Khoảng thời gian*.

---

## 6. Các Hộp thoại Chức năng (Modals & Dialogs)

### 6.1. Modal: Đặt Ca Mới (Booking Modal)
Mở ra khi người dùng bấm nút `[+ Đặt ca mới]` hoặc click vào ô trống trên lịch.

- **Các trường thông tin (Inputs):**
  1. **Ngày đặt:** Dropdown chọn ngày (Chỉ cho phép chọn trong 7 ngày tới).
  2. **Thời gian:** Ô chọn `Từ giờ` và `Đến giờ` (Đảm bảo giờ tròn, dài từ 1–8 tiếng).
  3. **Tùy chọn GPU:** Công tắc Toggle `[x] Sử dụng GPU RTX 5090`.
- **Thanh Kiểm tra Quy tắc Thời gian thực (Live Validation Status):**
  - ✅ Khung giờ hợp lệ (không quá 8 tiếng, không nằm trong quá khứ).
  - ✅ Không bị trùng lịch với ca khác của chính mình (`USER_OVERLAP`).
  - ✅ Máy chủ còn slot trống (Tối đa 2 phiên song song, tối đa 1 GPU) (`SLOT_FULL` / `GPU_BUSY`).
  - ✅ Hạn mức GPU tuần còn đủ (`GPU_QUOTA_EXCEEDED`).
- **Nút điều hướng:** `[Hủy bỏ]` và `[Xác nhận đặt ca]` (Màu `--brand`).

### 6.2. Popup Cảnh báo Sắp Hết Ca (15-Minute Warning)
Tự động xuất hiện ở góc dưới bên phải màn hình khi ca đang chạy còn đúng 15 phút.

+-------------------------------------------------------------+
| ⚠️ SẮP HẾT CA SỬ DỤNG (Còn 14:59)                           |
| Ca làm việc của bạn sẽ kết thúc lúc 17:00.                  |
| Vui lòng lưu dữ liệu checkpoint model (--resume) ngay bây giờ. |
|                                              [Đã hiểu]      |
+-------------------------------------------------------------+


---

## 7. Quy chuẩn Trạng thái UI (Visual Feedback)

Mọi trạng thái trên UI tuân thủ nguyên tắc **Màu sắc + Văn bản minh họa**:

- 🟢 **Chờ chạy / Đang chạy (`running`):** Nền `--success-soft`, chữ & icon `--success` ("Đang chạy").
- 🟡 **Đang khởi động / Đang dừng (`starting` / `stopping`):** Nền `--warning-soft`, chữ & icon `--warning` ("Đang bật container...").
- 🔴 **Lỗi / OOM / Bị hủy (`failed` / `cancelled` / `OOM`):** Nền `--danger-soft`, chữ & icon `--danger` ("Dừng do hết RAM").
- 🔵 **Đã lên lịch (`scheduled`):** Nền `--brand-soft`, chữ & icon `--brand-strong` (