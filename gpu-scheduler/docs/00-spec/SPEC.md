# SPEC — Hệ thống đặt lịch GPU Server VMU

Nguồn: [`ke-hoach-server-vmu.md`](../../../ke-hoach-server-vmu.md). Tài liệu này là **nguồn sự thật duy nhất**: docs, test case và code đều phải truy ngược về một `REQ-…` ở đây.

- Từ khóa MUST / SHOULD theo nghĩa RFC 2119.
- Mọi con số lấy từ **bảng cấu hình (mục 1)**, ký hiệu `CFG.<TÊN>`. Không ghi số trực tiếp trong yêu cầu.
- Trạng thái: **Đã duyệt 2026-09-28** (xem Gate Bước 1 ở cuối).

---

## 1. Bảng cấu hình

| Khóa | Giá trị mặc định | Ý nghĩa |
|---|---|---|
| `ALLOWED_EMAIL_DOMAIN` | `vimaru.edu.vn` | Tên miền email duy nhất được đăng nhập |
| `MAX_USERS` | 30 | Số tài khoản được duyệt tối đa |
| `USERNAME_MAX_LENGTH` | 32 | Độ dài tối đa username |
| `RESERVED_USERNAMES` | `root, admin, docker, nginx, postgres, nobody, daemon, bin, sys, www-data, ubuntu` | Tên không được dùng |
| `PASSWORD_LENGTH` | 16 | Độ dài mật khẩu SSH sinh ngẫu nhiên |
| `PORT_BASE` | 10000 | Cổng đầu tiên của user thứ 1 |
| `PORT_RANGE_SIZE` | 100 | Số cổng mỗi user |
| `MAX_CONCURRENT_SESSIONS` | 2 | Số phiên chạy đồng thời tối đa |
| `MAX_GPU_SESSIONS` | 1 | Số phiên GPU đồng thời tối đa |
| `SLOT_STEP` | 1 giờ | Ca đăng ký theo giờ tròn: mốc bắt đầu/kết thúc là `HH:00:00` theo `TIMEZONE`; ca ngắn nhất 1 giờ |
| `SLOT_MAX` | 8 giờ | Độ dài ca tối đa |
| `BOOKING_HORIZON` | 7 ngày | Đặt trước tối đa |
| `GPU_WEEKLY_QUOTA` | 10 giờ | Hạn mức giờ GPU mỗi user mỗi tuần |
| `GPU_QUOTA_FREE_WINDOW` | 24 giờ | Ca GPU bắt đầu trong khoảng này tính từ hiện tại được đặt vượt hạn mức |
| `WEEK_START` | Thứ Hai 00:00 | Mốc bắt đầu tuần tính hạn mức |
| `TIMEZONE` | `Asia/Ho_Chi_Minh` | Múi giờ nghiệp vụ (tên IANA, không ghi cứng `+07:00`): hiển thị, giờ tròn, ranh giới ngày/tuần |
| `SCHEDULER_TICK` | 60 giây | Chu kỳ Scheduler |
| `END_WARNING` | 15 phút | Cảnh báo trước khi hết ca |
| `STOP_TIMEOUT` | 120 giây | `docker stop -t` |
| `SESSION_MEMORY` | 28 GiB | Giới hạn RAM mỗi phiên (swap = RAM, tức không swap) |
| `SESSION_SHM` | 8 GiB | `--shm-size`, tính trong `SESSION_MEMORY` |
| `HOST_RESERVED_MEMORY` | 8 GiB | RAM luôn dành cho host |
| `HOST_RESERVED_CPU_THREADS` | 2 | Luồng CPU dành cho host |
| `USER_QUOTA_SOFT` | 80 GiB | Soft quota thư mục user |
| `USER_QUOTA_HARD` | 100 GiB | Hard quota thư mục user |
| `USER_QUOTA_GRACE` | 7 ngày | Thời gian được vượt soft quota |
| `SHARED_STORAGE` | 300 GiB | Dung lượng `/data/shared` |
| `CONTAINER_WRITABLE_LAYER` | 20 GB | Giới hạn writable layer mỗi container |
| `IMAGE_RETENTION` | 30 ngày | Image không dùng quá hạn này bị dọn |
| `LOG_RETENTION` | 30 ngày | Thời gian giữ log container (Q1) |
| `DELETED_USER_RETENTION` | 30 ngày | Giữ dữ liệu user đã xóa trước khi xóa hẳn (Q2) |
| `SESSION_TTL` | 30 ngày | Thời hạn phiên đăng nhập Dashboard (cookie `sid`) |
| `ALLOWED_IMAGES` | danh sách do admin quản lý | Image được phép dùng |

Các giá trị kế hoạch chưa nêu đã được chốt ở mục 10.

## 2. Thuật ngữ

- **Ca (booking):** khoảng thời gian nửa mở `[start, end)` một user đăng ký theo giờ tròn ("từ 8 giờ đến 11 giờ" = `[08:00, 11:00)` giờ Việt Nam), kèm cờ `use_gpu`. Ca được phép qua nửa đêm (vd 22:00 – 02:00 hôm sau).
- **Giờ Việt Nam:** giờ theo `CFG.TIMEZONE`. Mọi quy tắc nghiệp vụ (giờ tròn, "hôm nay", tuần) tính theo giờ Việt Nam, **không** theo múi giờ của server, của CSDL hay của trình duyệt.
- **Thời điểm (instant):** một điểm tuyệt đối trên trục thời gian, lưu và so sánh dưới dạng UTC.
- **Ca hiệu lực:** ca ở trạng thái `scheduled`, `starting`, `running`, `exited` hoặc `stopping`. Ca `cancelled`, `completed`, `failed` không chiếm chỗ.
- **Phiên:** container ứng với một ca đang chạy.
- **Hai ca chồng nhau:** `a.start < b.end && b.start < a.end`. Ca kề nhau (`a.end = b.start`) không chồng.

## 3. M1 — Người dùng & xác thực (`US`)

### REQ-US-01 — Xác thực ID token Google
Backend MUST xác thực ID token Google: chữ ký, `aud` bằng client ID của hệ thống, `exp` chưa hết hạn. Tham số `hd` trên URL đăng nhập MUST NOT được dùng làm cơ chế kiểm tra.
- Given ID token sai chữ ký, sai `aud` hoặc đã hết hạn — When gọi đăng nhập — Then `401 INVALID_TOKEN`.

### REQ-US-02 — Email đã xác minh
Backend MUST từ chối token có `email_verified ≠ true`.
- Given token hợp lệ với `email_verified = false` — Then `403 EMAIL_NOT_VERIFIED`.

### REQ-US-03 — Giới hạn tên miền
Backend MUST chỉ chấp nhận khi **cả hai** điều kiện đúng: claim `hd` = `CFG.ALLOWED_EMAIL_DOMAIN`, và email (chữ thường) kết thúc đúng bằng `@` + `CFG.ALLOWED_EMAIL_DOMAIN`.
- Given email `@gmail.com`, `@sv.vimaru.edu.vn` hoặc `abc@vimaru.edu.vn.evil.com` — Then `403 DOMAIN_NOT_ALLOWED`.

### REQ-US-04 — Thông tin hồ sơ
Hệ thống MUST lấy họ tên, email, ảnh đại diện từ ID token và cập nhật mỗi lần đăng nhập.

### REQ-US-05 — Tên đăng nhập
Username MUST là phần trước `@` của email, chuyển chữ thường. Username MUST khớp `^[a-z][a-z0-9._-]*$`, dài ≤ `CFG.USERNAME_MAX_LENGTH`, không thuộc `CFG.RESERVED_USERNAMES`. Nếu không hợp lệ, tài khoản vẫn được lưu ở `pending` nhưng việc duyệt MUST thất bại với `400 INVALID_USERNAME` và không tạo gì trên hệ thống.
- Given `VietNH@vimaru.edu.vn` — Then username `vietnh`.

### REQ-US-06 — Tài khoản chờ duyệt
Lần đăng nhập đầu MUST tạo tài khoản trạng thái `pending`. Tài khoản `pending` MUST NOT dùng được API đặt ca, mật khẩu, SSH key (`403 ACCOUNT_PENDING`).

### REQ-US-07 — Cấp phát khi duyệt
Khi admin duyệt, hệ thống MUST tạo trong một thao tác nguyên tử: tài khoản Linux với UID riêng, thư mục `/data/users/<username>` thuộc UID đó, project quota (REQ-ST-01), dải cổng (REQ-US-09), mật khẩu ban đầu (REQ-US-10). Bất kỳ bước nào lỗi thì MUST rollback toàn bộ các bước trước và giữ trạng thái `pending`.

### REQ-US-08 — Giới hạn số tài khoản
Số tài khoản `active` + `locked` MUST ≤ `CFG.MAX_USERS`. Duyệt vượt số này MUST trả `409 USER_LIMIT_REACHED`.

### REQ-US-09 — Dải cổng
User được cấp chỉ số `i` (1..`MAX_USERS`, chỉ số nhỏ nhất còn trống) MUST nhận dải `[PORT_BASE + PORT_RANGE_SIZE·(i−1), PORT_BASE + PORT_RANGE_SIZE·i − 1]`. Hai user không được có dải trùng nhau.

### REQ-US-10 — Mật khẩu SSH ban đầu
- MUST sinh bằng CSPRNG (`crypto.randomBytes`), dài `CFG.PASSWORD_LENGTH`.
- MUST chỉ hiển thị cho đến khi user xác nhận đã lưu; sau đó API MUST trả `404 NOT_FOUND`.
- Bản rõ MUST NOT được lưu trong CSDL, ghi vào log backend hay log Nginx; chỉ lưu tạm dạng mã hóa cho tới khi user xác nhận, hệ thống Linux chỉ giữ bản băm trong `/etc/shadow`.
- Response chứa mật khẩu MUST có `Cache-Control: no-store`.

### REQ-US-11 — Bắt đổi mật khẩu lần đầu
Mật khẩu ban đầu và mật khẩu cấp lại MUST hết hạn ngay (`chage -d 0`), user phải đổi ở lần SSH đầu.

### REQ-US-12 — Cấp lại mật khẩu
User `active` MUST cấp lại được mật khẩu qua Dashboard. Mật khẩu cũ MUST hết hiệu lực ngay; mật khẩu mới tuân theo REQ-US-10, REQ-US-11.

### REQ-US-13 — SSH key
User SHOULD thêm/xóa SSH public key qua Dashboard; key MUST được ghi vào `~/.ssh/authorized_keys` của user. Key sai định dạng → `400 INVALID_SSH_KEY`.

### REQ-US-14 — Phân quyền
Có hai vai trò `user` và `admin`. API admin MUST trả `403 FORBIDDEN` cho vai trò `user`.

### REQ-US-15 — Khóa tài khoản
Admin khóa user thì MUST: chặn đăng nhập Dashboard (`403 ACCOUNT_LOCKED`) và SSH, chuyển các ca `scheduled` sang `cancelled`, dừng phiên đang chạy theo REQ-SC-03.

### REQ-US-16 — Xóa tài khoản
Xóa user MUST khóa tài khoản như REQ-US-15 và giải phóng chỉ số cổng; dữ liệu `/data/users/<username>` MUST được giữ `CFG.DELETED_USER_RETENTION` rồi mới xóa hẳn.

## 4. M2 — Đặt lịch (`BK`)

### REQ-BK-01 — Hợp lệ thời gian
Ca mới MUST thỏa, theo thứ tự kiểm tra:
1. `start`, `end` có múi giờ tường minh (xem REQ-BK-11) — nếu không: `MISSING_TIMEZONE`
2. `start`, `end` là giờ tròn theo giờ Việt Nam (phút = giây = mili giây = 0) — nếu không: `NOT_ALIGNED`
3. `end > start` — nếu không: `END_BEFORE_START`
4. `end − start ≤ SLOT_MAX` — nếu không: `TOO_LONG`
5. `start ≥ now` — nếu không: `IN_PAST` (đang 09:20 thì không đặt được ca bắt đầu 09:00)
6. `start ≤ now + BOOKING_HORIZON` — nếu không: `BEYOND_HORIZON`

Vi phạm → `400 INVALID_TIME` với `details.reason` là mã tương ứng.

### REQ-BK-02 — Tối đa 2 phiên đồng thời
Tại mọi thời điểm `t ∈ [start, end)` của ca mới, số ca hiệu lực chứa `t` cộng 1 MUST ≤ `CFG.MAX_CONCURRENT_SESSIONS`. Phải kiểm tra theo từng mốc thời gian, không đếm số ca chồng. Vi phạm → `409 SLOT_FULL`.
- Given A 08:00–10:00 và B 10:00–12:00 — When đặt 09:00–11:00 — Then `201`.

### REQ-BK-03 — Tối đa 1 phiên GPU
Ca mới có `use_gpu = true` MUST NOT chồng với ca hiệu lực nào có `use_gpu = true`. Vi phạm → `409 GPU_BUSY`. Nếu vừa vi phạm REQ-BK-02 vừa vi phạm REQ-BK-03, trả `GPU_BUSY`.
- Given đã có ca GPU 08:00–10:00 — When user khác đặt ca GPU 09:00–11:00 — Then `409 GPU_BUSY`.

### REQ-BK-04 — Không tự chồng
Một user MUST NOT có hai ca hiệu lực chồng nhau → `409 USER_OVERLAP`.

### REQ-BK-05 — Hạn mức GPU theo tuần
Giờ GPU của user trong một tuần = giờ thực dùng của ca GPU đã `completed` + độ dài đầy đủ của ca GPU hiệu lực, cắt theo ranh giới tuần. Ca GPU mới làm tổng vượt `CFG.GPU_WEEKLY_QUOTA` MUST bị từ chối `409 GPU_QUOTA_EXCEEDED`, **trừ khi** `start < now + GPU_QUOTA_FREE_WINDOW`. Ca không GPU không tính vào hạn mức.

### REQ-BK-06 — An toàn khi đồng thời
Kiểm tra REQ-BK-01..05 và việc ghi ca MUST nằm trong cùng một transaction có khóa. Với N request đồng thời tranh K chỗ trống, đúng K request thành công.

### REQ-BK-07 — Quyền trên ca
Chỉ chủ ca hoặc admin MUST được hủy/kết thúc sớm/khởi động lại ca. Người khác → `403 FORBIDDEN`. Ca không tồn tại → `404 NOT_FOUND`.

### REQ-BK-08 — Hủy và kết thúc sớm
- Hủy ca `scheduled` → `cancelled`, khung giờ được giải phóng ngay.
- Kết thúc sớm ca `running`/`exited` → dừng như REQ-SC-03, trạng thái `completed`, giờ GPU chỉ tính phần đã dùng.
- Thao tác không hợp lệ với trạng thái hiện tại (vd hủy ca `completed`) → `409 INVALID_STATE`.

### REQ-BK-09 — Ca không hiệu lực
Ca `cancelled`, `completed`, `failed` MUST NOT được tính trong REQ-BK-02..04.

### REQ-BK-10 — Dữ liệu đặt ca
Request MUST có `use_gpu` (boolean, không mặc định) và `image` thuộc `CFG.ALLOWED_IMAGES`. Có thể có `ports`: danh sách cổng container cần publish, mỗi cổng MUST nằm trong dải của user. Thiếu `use_gpu` → `400 VALIDATION_ERROR`; image không hợp lệ → `400 IMAGE_NOT_ALLOWED`; cổng ngoài dải → `400 PORT_NOT_ALLOWED`.

### REQ-BK-11 — Định dạng thời gian ở API
- Mọi thời điểm gửi lên API MUST là ISO 8601 có múi giờ tường minh (`Z` hoặc `±HH:MM`). Chuỗi không có múi giờ (vd `2026-10-05T09:00:00`) MUST bị từ chối `400 INVALID_TIME` (`MISSING_TIMEZONE`), không được đoán theo múi giờ server.
- Chấp nhận mọi offset; hai chuỗi cùng một thời điểm (`…T02:00:00Z` và `…T09:00:00+07:00`) MUST cho kết quả như nhau.
- Mọi thời điểm API trả về MUST ở dạng giờ Việt Nam có offset (`…T09:00:00+07:00`).
- CSDL MUST lưu thời điểm dạng `timestamptz` (UTC).

### REQ-BK-12 — Tính theo giờ Việt Nam, không phụ thuộc môi trường
- Giờ tròn, ranh giới ngày và tuần (REQ-BK-01, REQ-BK-05) MUST tính theo `CFG.TIMEZONE` bằng cơ sở dữ liệu múi giờ IANA, không cộng cứng 7 giờ.
- Kết quả của mọi quy tắc MUST giống nhau bất kể biến `TZ` của tiến trình Node.js, `timezone` của PostgreSQL hay múi giờ của hệ điều hành.
- Tuần tính hạn mức GPU bắt đầu **Thứ Hai 00:00 giờ Việt Nam** (= Chủ nhật 17:00 UTC). Ca vắt qua ranh giới tuần được chia giờ cho từng tuần.

## 5. M3 — Scheduler (`SC`)

### REQ-SC-01 — Khởi chạy đúng giờ
Ca `scheduled` đến `start` MUST có container ở trạng thái `running` trong ≤ `CFG.SCHEDULER_TICK` (chu trình `scheduled → starting → running`).

### REQ-SC-02 — Cảnh báo hết ca
Tại `end − END_WARNING`, user MUST nhận đúng một cảnh báo: thông báo trên Dashboard, thông điệp in ra **mọi terminal SSH đang mở trong container** (`/dev/pts/*`), và ghi vào log container.

### REQ-SC-03 — Dừng khi hết ca
Tại `end`, Scheduler MUST chạy `docker stop -t STOP_TIMEOUT` (`stopping`), sau khi container dừng thì xóa container, giải phóng GPU/CPU/RAM, lưu log, chuyển sang `completed`.

### REQ-SC-04 — Không tạo trùng container
Mỗi tick MUST giữ khóa; hai tick chồng nhau MUST NOT tạo hai container cho một ca. Tên container MUST xác định theo ID ca (`vmu-bk-<id>`).

### REQ-SC-05 — Reconcile khi khởi động
Khi Scheduler khởi động: container `vmu-bk-*` không ứng với ca đang diễn ra MUST bị dừng; ca đang diễn ra (`starting`/`running`) mà thiếu container MUST được khởi chạy lại. Ca `exited` giữ nguyên.

### REQ-SC-06 — Lỗi tạo container
Tạo container lỗi → ca `failed`, lưu lỗi vào log, user nhận thông báo.

### REQ-SC-07 — Container tự thoát
Container thoát trước `end` → ca `exited`, MUST NOT tự khởi động lại. Chủ ca MAY khởi động lại trong ca, dùng đúng cấu hình cũ (`exited → starting → running`).

### REQ-SC-08 — Đồng hồ của Scheduler
- Scheduler MUST so sánh `now` với `start`/`end` dưới dạng thời điểm UTC; MUST NOT dùng biểu thức cron theo giờ địa phương để khởi chạy/dừng ca (`node-cron` chỉ dùng làm nhịp tick).
- Việc định kỳ theo giờ trong ngày (dọn dẹp 03:00) MUST khai báo tường minh `timezone: CFG.TIMEZONE`.
- Container MUST có biến môi trường `TZ = CFG.TIMEZONE` để lệnh `date`, log của người dùng hiện giờ Việt Nam.

## 6. M4 — Container (`CT`)

### REQ-CT-01 — GPU
Chỉ ca `use_gpu = true` MUST được gắn `--gpus device=0`. Ca không GPU MUST NOT thấy thiết bị GPU.

### REQ-CT-02 — Tài nguyên
Mỗi container MUST có `--memory = --memory-swap = SESSION_MEMORY`, `--shm-size = SESSION_SHM`, `--cpus = ⌊(N − HOST_RESERVED_CPU_THREADS) / MAX_CONCURRENT_SESSIONS⌋` với `N` là số luồng CPU của host. Vượt RAM chỉ gây OOM trong container.

### REQ-CT-03 — Cách ly dữ liệu
Container MUST chỉ mount `/data/users/<username>` → `/workspace` (rw) và `/data/shared` → `/shared` (ro).

### REQ-CT-04 — Bảo mật
Container MUST chạy với UID:GID của user, MUST NOT `--privileged`, MUST NOT mount `docker.sock`, MUST dùng `--security-opt no-new-privileges`.

### REQ-CT-05 — Cổng
Container MUST chỉ publish các cổng trong dải của user (REQ-US-09, REQ-BK-10), và chỉ trên `127.0.0.1` (`-p 127.0.0.1:p:p`): cổng không mở ra mạng, chỉ tới được qua SSH tunnel (REQ-CT-10).

### REQ-CT-06 — Image
Container MUST chỉ được tạo từ image thuộc `CFG.ALLOWED_IMAGES`.

### REQ-CT-07 — Chạy song song
Một phiên GPU và một phiên không GPU MUST chạy song song được, mỗi phiên giữ đúng giới hạn của mình.

### REQ-CT-08 — Vào container bằng SSH
- User SSH bằng `<username>@<server>` (username theo REQ-US-05, mật khẩu theo REQ-US-10 hoặc SSH key theo REQ-US-13).
- User MUST NOT có shell trên máy chủ. Mọi phiên SSH của nhóm `vmu-users` MUST đi qua `ForceCommand vmu-enter`.
- Có ca đang chạy (container `running` mang label `vmu.user=<username>`): phiên SSH MUST vào đúng container đó, chạy với UID của user, thư mục `/workspace`, `HOME=/workspace`. Không có lệnh → login shell có TTY; có lệnh (vd `ssh user@server nvidia-smi`, VS Code Remote-SSH) → lệnh chạy trong container.
- User MUST NOT vào được container của người khác.
- Không có ca đang chạy: MUST in thông báo tiếng Việt "Bạn chưa có ca đang chạy…" kèm địa chỉ Dashboard, thoát với mã khác 0, không mở shell nào.
- sshd MUST tắt X11 forwarding, agent forwarding, `PermitTunnel`; chỉ cho TCP forwarding chiều local (REQ-CT-10).

### REQ-CT-09 — Chép file mọi lúc
Chép file bằng SFTP (kể cả `scp` bản mới), `scp -t/-f` bản cũ và `rsync` MUST hoạt động **cả khi không có ca**. Các lệnh này MUST chạy trên máy chủ với quyền của user, bắt đầu tại `/data/users/<username>` (chính là `/workspace` trong container). Lệnh được tách thành tham số, MUST NOT đi qua shell (không chèn được lệnh khác). User MUST NOT đọc hoặc ghi được thư mục của user khác (thư mục `0700`).

### REQ-CT-10 — Cổng chỉ qua SSH tunnel
User MUST dùng được `ssh -L <p>:localhost:<p> <username>@<server>` với mọi cổng `p` trong dải của mình. sshd MUST từ chối forward tới cổng ngoài dải của user (`PermitOpen` riêng cho từng user). Từ máy khác trong mạng, `<server>:<p>` MUST không kết nối được.

## 7. M5 — Lưu trữ (`ST`)

### REQ-ST-01 — Project quota
Mỗi `/data/users/<username>` MUST có XFS project quota soft `USER_QUOTA_SOFT`, hard `USER_QUOTA_HARD`. Ghi vượt hard → `EDQUOT`.

### REQ-ST-02 — Vượt soft quota
Vượt soft quota MUST hiện cảnh báo trên Dashboard kèm hạn dọn dẹp. Sau `USER_QUOTA_GRACE` mà vẫn vượt, user MUST không ghi thêm được cho tới khi xuống dưới soft quota (grace period của XFS).

### REQ-ST-03 — Writable layer
Writable layer mỗi container MUST giới hạn `CONTAINER_WRITABLE_LAYER` (`--storage-opt size=…`).

### REQ-ST-04 — Dữ liệu bền vững
Dữ liệu trong `/workspace` MUST còn nguyên sau khi ca kết thúc và có mặt ở ca kế tiếp.

### REQ-ST-05 — Báo cáo dung lượng
Dung lượng đã dùng hiển thị trên Dashboard MUST lệch ≤ 1% so với `xfs_quota`.

## 8. M6 — Giám sát & log (`MN`)

### REQ-MN-01 — Số liệu phiên
Dashboard MUST hiện CPU, RAM, GPU (nếu có) của phiên đang chạy, cập nhật ≤ 60 giây.

### REQ-MN-02 — Log container
Log container MUST xem được sau khi ca kết thúc, trong `LOG_RETENTION`.

### REQ-MN-03 — Audit log
Mọi thao tác đặt, hủy, kết thúc sớm, khởi động lại, duyệt, khóa, xóa, cấp lại mật khẩu MUST được ghi audit log: ai, lúc nào, thao tác, đối tượng.

### REQ-MN-04 — Lý do dừng
Container bị OOM MUST được hiển thị rõ lý do `OOM` trên Dashboard.

## 9. M7 — Dashboard (`UI`) và M8 — Triển khai (`DP`)

- **REQ-UI-01** Form đặt ca MUST bắt buộc chọn "Dùng GPU: Có/Không", không có giá trị mặc định.
- **REQ-UI-02** Lịch MUST hiển thị khung đã đủ 2 phiên và khung đã có ca GPU.
- **REQ-UI-03** Mỗi mã lỗi `409` và `400` MUST có thông báo tiếng Việt dễ hiểu.
- **REQ-UI-04** User MUST thấy giờ GPU còn lại trong tuần.
- **REQ-UI-05** User MUST thấy username, dải cổng, dung lượng đã dùng / quota.
- **REQ-UI-06** User MUST hủy ca và kết thúc sớm được từ giao diện.
- **REQ-UI-07** Có nút "Đăng nhập bằng Google"; tài khoản `pending` thấy màn hình chờ duyệt.
- **REQ-UI-08** Màn hình mật khẩu lần đầu có nút sao chép, cảnh báo lưu lại, nút "Tôi đã lưu".
- **REQ-UI-09** Admin có trang duyệt, khóa, xóa tài khoản.
- **REQ-UI-10** Dashboard MUST hiển thị và nhận giờ theo giờ Việt Nam, kèm nhãn "(GMT+7)", **bất kể múi giờ của trình duyệt**. Form đặt ca MUST chỉ cho chọn ngày + giờ tròn (00–23 giờ, giờ kết thúc cho phép "24:00" = 00:00 hôm sau), gửi lên API chuỗi có offset. Ca qua nửa đêm MUST hiển thị rõ ngày kết thúc (vd "22:00 – 02:00 (+1 ngày)").
- **REQ-DP-01** Backend và Scheduler MUST chạy dưới systemd, tự khởi động lại khi crash và khi reboot.
- **REQ-DP-02** Dashboard/API MUST chỉ truy cập qua HTTPS; HTTP chuyển hướng sang HTTPS.
- **REQ-DP-03** Tổng giới hạn RAM của các container MUST ≤ RAM host − `HOST_RESERVED_MEMORY`; host MUST không bị OOM khi hai phiên dùng hết giới hạn.
- **REQ-DP-04** Image không dùng quá `IMAGE_RETENTION` MUST bị dọn định kỳ (hằng ngày); image trong `ALLOWED_IMAGES` đang được ca hiệu lực dùng MUST NOT bị xóa.
- **REQ-DP-05** MUST có tài liệu người dùng: đăng ký, SSH, lưu dữ liệu, tự sao lưu.
- **REQ-DP-06** Đồng hồ server MUST được đồng bộ NTP (chrony hoặc systemd-timesyncd). PostgreSQL MUST đặt `timezone = 'UTC'`. Server cài gói `tzdata`; image trong `ALLOWED_IMAGES` MUST có `tzdata`.

## 10. Quyết định đã chốt

Muốn đổi một quyết định đã chốt thì phải quay lại Bước 1 (sửa spec → docs → test case).

| # | Vấn đề | Nội dung trong spec | Trạng thái |
|---|---|---|---|
| Q1 | Kế hoạch không nêu thời gian giữ log | `LOG_RETENTION = 30 ngày` | ✅ Đã chốt 2026-09-28 |
| Q2 | Kế hoạch không nêu thời gian giữ dữ liệu user bị xóa | `DELETED_USER_RETENTION = 30 ngày` | ✅ Đã chốt 2026-09-28 |
| Q3 | Tuần tính hạn mức GPU bắt đầu khi nào | Thứ Hai 00:00, giờ Việt Nam (REQ-BK-12) | ✅ Đã chốt 2026-09-28 |
| Q4 | Hết 7 ngày vượt soft quota thì sao | Không ghi thêm được (hành vi grace period của XFS) | ✅ Đã chốt 2026-09-28 |
| Q5 | Kênh cảnh báo 15 phút | Dashboard + thông điệp vào container; email để sau | ✅ Đã chốt 2026-09-28 |
| Q6 | Khóa user khi đang có phiên chạy | Dừng phiên ngay | ✅ Đã chốt 2026-09-28 |
| Q7 | CSDL | PostgreSQL (khóa `pg_advisory_xact_lock` cho REQ-BK-06) | ✅ Đã chốt 2026-09-28 |
| Q8 | Có cho đặt ca qua nửa đêm không | Có (vd 22:00 – 02:00), miễn ≤ 8 giờ — REQ-BK-01, BK-T36 | ✅ Đã chốt 2026-09-28 |
| Q9 | Đang 09:20 có đặt được ca "từ 9 giờ" không | Không (`IN_PAST`), bắt buộc đặt từ 10 giờ — REQ-BK-01, BK-T39 | ✅ Đã chốt 2026-09-28 |
| Q10 | Người dùng vào container bằng cách nào | SSH `<username>@<server>` rồi tự vào container của mình (`ForceCommand`) — REQ-CT-08 | ✅ Đã chốt 2026-09-28 |
| Q11 | Ngoài ca có chép file được không | Có: SFTP/scp/rsync chạy trên máy chủ trong `/data/users/<username>` — REQ-CT-09 | ✅ Đã chốt 2026-09-28 |
| Q12 | Truy cập cổng (Jupyter, TensorBoard…) | Chỉ qua SSH tunnel, cổng container chỉ mở trên 127.0.0.1 — REQ-CT-05, REQ-CT-10 | ✅ Đã chốt 2026-09-28 |

## Gate Bước 1

- [x] Mọi yêu cầu có ID duy nhất và tiêu chí chấp nhận đo được
- [x] Các tham số được liệt kê trong bảng cấu hình, không rải rác
- [x] Đã có người review và đồng ý toàn bộ spec (Q1–Q9 đã chốt 2026-09-28)
- [x] Thay đổi 2026-09-28 (REQ-CT-05, REQ-CT-08..10, REQ-SC-02, Q10–Q12) đã được review
