# Lưu trữ — REQ-ST-01..05, REQ-US-07, REQ-US-16

## Bố cục

```
/data                         XFS, mount với prjquota
├── users/<username>/         owner <uid>:<uid>, mode 0700 → /workspace
└── shared/                   owner root, mode 0755 → /shared (ro)
/var/lib/docker               XFS, mount với pquota
/var/log/vmu/bookings/        log container sau khi ca kết thúc (LOG_RETENTION)
```

## Cấp phát khi duyệt user — REQ-US-07

Các bước chạy theo thứ tự; nếu một bước lỗi thì hoàn tác các bước đã làm theo thứ tự ngược lại:

| # | Làm | Hoàn tác |
|---|---|---|
| 1 | Chọn `slot_index` nhỏ nhất còn trống; UID = UID lớn nhất đã dùng (kể cả user `deleted` chưa purge) + 1, bắt đầu từ 2001 | — |
| 2 | `useradd -u <uid> -U -G vmu-users -m -s /bin/bash <username>` | `userdel -r <username>` |
| 3 | `mkdir /data/users/<username>`, `chown <uid>:<uid>`, `chmod 0700` | `rm -rf` thư mục |
| 4 | `xfs_quota -x -c 'project -s -p /data/users/<username> <uid>' /data` | `project -C` |
| 5 | `xfs_quota -x -c 'limit -p bsoft=80g bhard=100g <uid>' /data` | `limit -p bsoft=0 bhard=0` |
| 6 | Sinh mật khẩu, `chpasswd`, `chage -d 0 <username>` | — (user đã bị xóa ở bước 2) |
| 7 | Cập nhật CSDL: `status = active`, `slot_index`, `linux_uid`, `pending_password_enc` | transaction rollback |
| 8 | Ghi lại `/etc/ssh/sshd_config.d/40-vmu-users.conf` (`PermitOpen` theo dải cổng — [ssh.md](ssh.md)) | ghi lại theo CSDL sau rollback |

UID không gắn với `slot_index`: chỉ số cổng được tái sử dụng khi user bị xóa, còn UID thì không, để dữ liệu chờ purge của user cũ không bị user mới nhận nhầm. Project ID = UID để truy vết đơn giản. Grace period đặt một lần cho cả filesystem: `xfs_quota -x -c 'timer -p -b 7d' /data`.

Các lệnh trên cần root: backend gọi qua một helper nhỏ (`vmu-provision`) được phép chạy bằng `sudo` với danh sách lệnh cố định, không cho backend quyền root trực tiếp.

## Quota — REQ-ST-01, ST-02, ST-05

- Đọc dung lượng: `xfs_quota -x -c 'report -p -b -N' /data`, định kỳ 5 phút, lưu vào bộ nhớ đệm cho `GET /me`.
- Vượt `bsoft` → ghi `over_soft_since`, tạo notification `SOFT_QUOTA` với hạn `over_soft_since + 7 ngày`.
- Sau grace period, XFS tự chặn ghi cho tới khi dung lượng xuống dưới `bsoft`.

## Xóa user — REQ-US-16

`status = deleted`, khóa Linux (`usermod -L -e 1`), giải phóng `slot_index`, ghi lại cấu hình sshd (bỏ `PermitOpen` của user), `purge_after = now + DELETED_USER_RETENTION`. Cron hằng ngày xóa hẳn thư mục, quota project và tài khoản Linux của user đã quá `purge_after`.

## Dữ liệu dùng chung

`/data/shared` do admin quản lý, giới hạn `SHARED_STORAGE` bằng một project quota riêng (ID 1000).

> Server **không sao lưu** dữ liệu người dùng (REQ-DP-05 yêu cầu ghi rõ trong tài liệu người dùng).
