# Hướng dẫn sử dụng VMU GPU Server

Máy chủ GPU RTX 5090 dùng chung của trường. Mỗi người đặt **ca** theo giờ; trong ca bạn có một máy riêng (container) với GPU (nếu chọn), RAM và CPU dành riêng, và thư mục `/workspace` của bạn.

Địa chỉ: **https://gpu.vimaru.edu.vn** · Mọi giờ trên hệ thống là **giờ Việt Nam (GMT+7)**.

## 1. Đăng ký tài khoản

1. Mở Dashboard → **Đăng nhập bằng Google** bằng email **@vimaru.edu.vn**.
2. Tài khoản mới ở trạng thái **chờ duyệt**. Quản trị viên duyệt xong thì bạn đăng nhập lại.
3. Lần đầu sau khi được duyệt, Dashboard hiện **mật khẩu SSH** — **chỉ hiện một lần**. Lưu vào trình quản lý mật khẩu rồi bấm "Tôi đã lưu".

Tên đăng nhập SSH là phần trước `@` của email, viết thường (vd `VietNH@vimaru.edu.vn` → `vietnh`).

Quên mật khẩu: **Tài khoản & Key → Tạo lại mật khẩu SSH ngẫu nhiên** (mật khẩu cũ hết hiệu lực ngay).

## 2. Đặt ca

1. Trang **Lịch đặt ca**: bấm vào giờ trống, hoặc nút **Đặt ca mới**.
2. Chọn ngày, từ giờ, đến giờ (giờ tròn, 1–8 giờ, được qua nửa đêm). Bật **Sử dụng GPU RTX 5090** nếu cần GPU.
3. Hộp thoại kiểm tra ngay 4 điều kiện; tất cả ✓ thì bấm **Xác nhận đặt ca**.

Quy tắc:

- Cùng lúc tối đa **2 người** dùng máy, trong đó **1 người** dùng GPU.
- Mỗi tuần (từ Thứ Hai) tối đa **10 giờ GPU**. Hết hạn mức vẫn đặt được ca GPU còn trống trong **24 giờ tới**.
- Đặt trước tối đa 7 ngày. Đang 09:20 thì chỉ đặt được từ 10:00.
- Không dùng nữa thì **Hủy ca** (ca sắp tới) hoặc **Kết thúc sớm** (ca đang chạy) để nhường người khác.

## 3. Vào máy trong ca

### Terminal

```
ssh vietnh@gpu.vimaru.edu.vn
```

Lần SSH đầu tiên hệ thống bắt đổi mật khẩu. Có ca đang chạy thì bạn vào thẳng máy của mình, tại `/workspace`. Không có ca: "Bạn chưa có ca đang chạy" (vẫn chép file được, xem mục 5).

### SSH key (khuyên dùng, bắt buộc cho VS Code)

1. Trên máy bạn: `ssh-keygen -t ed25519` (Enter hết).
2. Mở file `~/.ssh/id_ed25519.pub` (Windows: `C:\Users\<bạn>\.ssh\id_ed25519.pub`), chép cả dòng.
3. Dashboard → **Tài khoản & Key** → dán vào **Khóa public**, đặt **Tên gợi nhớ** → **Thêm SSH Key**.

### VS Code

> **Làm trước một lần:** SSH bằng terminal (`ssh vietnh@gpu.vimaru.edu.vn`) và đổi mật khẩu theo yêu cầu. Khi mật khẩu chưa đổi, máy chủ từ chối cả đăng nhập bằng key từ VS Code (báo `Password change required but no TTY available`).

1. Cài extension **Remote - SSH**.
2. Thêm vào `~/.ssh/config` trên máy bạn (Dashboard → Ca của tôi → Hướng dẫn kết nối có nút sao chép sẵn):
   ```
   Host vmu
     HostName gpu.vimaru.edu.vn
     User vietnh
     ProxyCommand ssh -T vietnh@gpu.vimaru.edu.vn vmu-connect
   ```
3. VS Code → **Remote-SSH: Connect to Host…** → `vmu`. Terminal, extension, notebook đều chạy trong máy của bạn.

### Jupyter / TensorBoard

Chạy trong máy (vd `jupyter lab --no-browser --port 8888`). VS Code tự chuyển cổng; không dùng VS Code thì:

```
ssh -L 8888:localhost:8888 vmu
```
rồi mở `http://localhost:8888` trên máy bạn.

## 4. Cài phần mềm

Không có quyền root, nhưng mọi thứ cài vào `/workspace` đều **còn ở ca sau**:

```
pip install --user torch transformers
conda create -n ml python=3.12 && conda activate ml
conda install -c conda-forge ffmpeg gcc cmake nodejs
```

Phần mềm bắt buộc cài bằng `apt`: nhờ quản trị viên thêm vào image chung.

## 5. Lưu dữ liệu và **tự sao lưu**

- Chỉ **`/workspace`** được giữ lại giữa các ca. File để ngoài `/workspace` mất khi ca kết thúc.
- Dung lượng: 80 GiB thoải mái; vượt 80 GiB có **7 ngày** để dọn, quá hạn thì không ghi thêm được; chạm 100 GiB là không ghi được. Xem ở **Tài khoản & Key**.
- ⚠️ **Máy chủ KHÔNG sao lưu.** Tự tải kết quả quan trọng (model, số liệu, code) về máy mình hoặc lên Git/Drive.

Chép file (dùng được **cả khi không có ca**):

```
scp  model.pt vietnh@gpu.vimaru.edu.vn:/data/users/vietnh/          # lên máy chủ
scp  vietnh@gpu.vimaru.edu.vn:/data/users/vietnh/ket-qua.zip .      # về máy bạn
rsync -av du-lieu/ vietnh@gpu.vimaru.edu.vn:/data/users/vietnh/du-lieu/
```

Hoặc dùng **WinSCP** / **FileZilla** (giao thức SFTP, máy chủ `gpu.vimaru.edu.vn`, cổng 22).

## 6. Khi ca sắp hết

- Còn **15 phút**: Dashboard hiện popup đếm ngược, terminal trong máy in thông báo. **Lưu checkpoint ngay.**
- Hết giờ: chương trình nhận tín hiệu dừng, có **2 phút** để lưu rồi máy tắt.
- Huấn luyện dài: lưu checkpoint thường xuyên (vd mỗi epoch) và viết code chạy tiếp được từ checkpoint (`--resume`).

## 7. Lỗi thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| "Bạn chưa có ca đang chạy" | Chưa đến giờ ca, hoặc ca đã hết. Xem **Ca của tôi** |
| Ca "Dừng do hết RAM" | Chương trình dùng quá 28 GiB RAM. Giảm batch size / số worker DataLoader, đọc dữ liệu theo từng phần |
| VS Code báo `Permission denied (publickey)` | Chưa thêm SSH key, hoặc thêm nhầm file (phải là file `.pub`) |
| VS Code báo `Password change required but no TTY available` | Chưa đổi mật khẩu lần đầu: SSH bằng terminal một lần để đổi |
| Không ghi được file | Hết dung lượng: xem **Tài khoản & Key**, xóa bớt hoặc tải về máy |
| Ca "Lỗi khởi chạy" | Báo quản trị viên kèm mã ca (`#…`) |
