# Truy cập SSH — REQ-CT-05, REQ-CT-08, REQ-CT-09, REQ-CT-11, REQ-SC-02

Người dùng chỉ có một cách vào máy: SSH với tên `<username>` (phần trước `@vimaru.edu.vn`). Họ không bao giờ có shell trên máy chủ.

Có hai cách dùng, cùng đi qua `ForceCommand vmu-enter`:

| Cách | Lệnh | Xác thực | Dùng cho |
|---|---|---|---|
| **Terminal nhanh** | `ssh vietnh@server` | Mật khẩu hoặc key | Gõ lệnh, `tmux`, xem `nvidia-smi` |
| **SSH thẳng vào container** | `ssh vmu` (qua `ProxyCommand … vmu-connect`) | Key ở máy chủ **và** key trong container | VS Code Remote-SSH, chuyển tiếp cổng (Jupyter, TensorBoard) |

```mermaid
flowchart TD
    A([ssh vietnh@server …]) --> B[sshd máy chủ: mật khẩu / key<br/>lần đầu bắt đổi mật khẩu qua PAM<br/>tắt mọi chuyển tiếp cổng]
    B --> C[ForceCommand /usr/local/bin/vmu-enter<br/>chạy bằng quyền của vietnh]
    C --> D{SSH_ORIGINAL_COMMAND}
    D -- sftp-server / internal-sftp --> E[sftp-server -d /data/users/vietnh<br/>trên máy chủ]
    D -- "scp -t/-f …, rsync --server …" --> F[scp / rsync trên máy chủ<br/>tách tham số, không qua shell]
    D -- vmu-connect --> G1[sudo vmu-exec --connect]
    D -- rỗng hoặc lệnh khác --> G[sudo vmu-exec -- lệnh]
    G1 --> H{container running<br/>label vmu.user=vietnh?}
    G --> H
    H -- không --> J[Bạn chưa có ca đang chạy… → exit 1]
    H -- có, --connect --> K[docker exec -i -u UID … /usr/sbin/sshd -i<br/>sshd của chính user trong container]
    H -- có, lệnh --> I[docker exec -u UID -w /workspace<br/>shell hoặc lệnh]
```

## `vmu-enter` (quyền user) — [`deploy/vmu-enter`](../../deploy/vmu-enter)

1. Tách `SSH_ORIGINAL_COMMAND` thành mảng tham số (chỉ theo khoảng trắng, không hiểu `;` `&&` `|` `$()` `` ` ``). **Không bao giờ** đưa chuỗi vào `sh -c` trên máy chủ.
2. Chép file (REQ-CT-09), chạy trên máy chủ tại `/data/users/<username>`: `internal-sftp` / `*/sftp-server` → `sftp-server -d …`; `scp` có `-t`/`-f`; `rsync --server …`.
3. Đúng một từ `vmu-connect` → `exec sudo -n /usr/local/sbin/vmu-exec --connect`.
4. Còn lại → `exec sudo -n /usr/local/sbin/vmu-exec -- "$SSH_ORIGINAL_COMMAND"`.

## `vmu-exec` (root qua sudo) — [`deploy/vmu-exec`](../../deploy/vmu-exec)

- User lấy từ `SUDO_USER`; **không** nhận tên user hay container từ tham số.
- Tìm container `running` có label `vmu.user=$SUDO_USER`. Không có → thông báo, `exit 1`.
- `--connect` (REQ-CT-11): `docker exec -i -u <uid>:<uid> <container> /usr/local/sbin/vmu-sshd`. Script trong image chạy `sshd -i -f /etc/vmu/sshd_config` bằng UID của user; stdin/stdout của phiên SSH ngoài trở thành một phiên SSH mới bên trong container.
- Lệnh thường: `docker exec [-t] -i -u <uid>:<uid> -w /workspace -e HOME=/workspace -e TERM <container>` rồi `bash -l` (không có lệnh) hoặc `sh -c "<lệnh>"` bên trong container.
- sudoers: `%vmu-users ALL=(root) NOPASSWD: /usr/local/sbin/vmu-exec`.

## sshd trong container — REQ-CT-11

`/etc/vmu/sshd_config` (có sẵn trong `BASE_IMAGE`):

```
Port 22                              # không nghe cổng nào: chỉ chạy kiểu inetd (sshd -i)
HostKey /workspace/.vmu/ssh_host_ed25519_key
AuthorizedKeysFile /etc/vmu/authorized_keys
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
UsePAM no
StrictModes no
AllowTcpForwarding local
X11Forwarding no
AllowAgentForwarding no
PermitTunnel no
PidFile none
Subsystem sftp internal-sftp
```

- `vmu-sshd` tạo host key ở lần đầu (`ssh-keygen -t ed25519 -N '' -f /workspace/.vmu/ssh_host_ed25519_key`) và dùng lại ở các ca sau, nên VS Code không báo đổi host key.
- `/etc/vmu/authorized_keys` là file `~/.ssh/authorized_keys` của user trên máy chủ, mount **chỉ đọc** (REQ-US-13: thêm/xóa key trên Dashboard là có hiệu lực ngay).
- sshd chạy bằng UID của user nên chỉ user đó đăng nhập được, không có quyền root.
- Chuyển tiếp cổng chiều local tới `localhost:<p>` là tới **bên trong container**: Jupyter chạy mặc định trên `127.0.0.1` vẫn tới được.

## Cấu hình phía người dùng (Dashboard hiện sẵn — REQ-UI-11)

```
Host vmu
  HostName gpu.vimaru.edu.vn
  User vietnh
  ProxyCommand ssh -T vietnh@gpu.vimaru.edu.vn vmu-connect
```

VS Code: **Remote-SSH: Connect to Host… → `vmu`**. Jupyter/TensorBoard: VS Code tự chuyển tiếp cổng, hoặc `ssh -L 8888:localhost:8888 vmu`.

## sshd máy chủ

`/etc/ssh/sshd_config.d/50-vmu.conf` (cố định, [`deploy/sshd/50-vmu.conf`](../../deploy/sshd/50-vmu.conf)):

```
Match Group vmu-users
    ForceCommand /usr/local/bin/vmu-enter
    PasswordAuthentication yes
    KbdInteractiveAuthentication yes
    PermitUserEnvironment no
    X11Forwarding no
    AllowAgentForwarding no
    AllowTcpForwarding no
    AllowStreamLocalForwarding no
    PermitTunnel no
    GatewayPorts no
```

`UsePAM yes` trong cấu hình chính: mật khẩu hết hạn (`chage -d 0`) được đổi trong bước xác thực, trước khi `ForceCommand` chạy (REQ-US-11).

## Mạng — REQ-CT-05

- Tạo một lần: `docker network create --driver bridge -o com.docker.network.bridge.enable_icc=false vmu-net`.
- Container không có `-p`: không cổng nào của container mở ra máy chủ hay mạng trường.
- PostgreSQL, backend nghe trên `127.0.0.1` của máy chủ: container không tới được (địa chỉ loopback của container là của riêng container).

## Cảnh báo hết ca trên terminal — REQ-SC-02

Scheduler chạy trong container (bằng UID của user):

```sh
for t in /dev/pts/[0-9]*; do [ -w "$t" ] && printf '\n[VMU] %s\n' "$MSG" > "$t"; done
echo "[VMU] $MSG" > /proc/1/fd/1
```

Cả phiên `docker exec -t` lẫn phiên của sshd trong container đều có pts thuộc user nên nhận được thông điệp.

## Quyền thư mục — REQ-CT-09

- `/data/users`: `root:root 0711` (đi qua được, không liệt kê được).
- `/data/users/<username>`: `<uid>:<uid> 0700`.
- User thuộc nhóm `vmu-users`, **không** thuộc nhóm `docker`.
