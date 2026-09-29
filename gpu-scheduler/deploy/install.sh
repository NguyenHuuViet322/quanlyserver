#!/bin/bash
# Cài đặt VMU GPU Server trên Ubuntu 24.04 — REQ-DP-08, docs/10-design/deployment.md
#
#   sudo deploy/install.sh --profile test --domain vmu-test.duckdns.org --email ban@gmail.com --google-client-id 123….apps.googleusercontent.com
#   sudo deploy/install.sh --profile prod --domain gpu.vimaru.edu.vn  --email …                --google-client-id …
#   deploy/install.sh --profile test --domain x.example.org --print-env      # chỉ in /etc/vmu/vmu.env sẽ ghi
#
# Chạy lại nhiều lần được: bước nào đã xong thì bỏ qua; không sinh lại khóa, mật khẩu đã có trong vmu.env.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC=$(cd "$SCRIPT_DIR/.." && pwd)            # thư mục gpu-scheduler
APP=/opt/vmu/app
NODE_DIR=/opt/vmu/node
ENV_FILE=${VMU_ENV_FILE:-/etc/vmu/vmu.env}
DISK_DIR=/var/lib/vmu-disks

PROFILE=''
DOMAIN=''
EMAIL=''
GOOGLE_CLIENT_ID_ARG=''
SELF_SIGNED=0
PRINT_ENV=0
DATA_DISK=6G
DOCKER_DISK=10G

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die() { printf '\033[1;31mLỗi:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  cat <<'EOF'
Cờ:
  --profile prod|test       bắt buộc
  --domain <tên miền>       bắt buộc; trỏ DNS về máy này
  --email <email>           email nhận thông báo của Let's Encrypt (không bắt buộc)
  --google-client-id <id>   OAuth Client ID (origin https://<tên miền>); chưa có thì bỏ qua, thêm sau
  --self-signed             dùng chứng chỉ tự ký thay Let's Encrypt (đăng nhập Google sẽ không chạy)
  --data-disk 6G            profile test: kích thước ổ XFS cho /data
  --docker-disk 10G         profile test: kích thước ổ XFS cho /var/lib/docker
  --print-env               in nội dung vmu.env rồi thoát (không cần root)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE=${2:-}; shift 2 ;;
    --domain) DOMAIN=${2:-}; shift 2 ;;
    --email) EMAIL=${2:-}; shift 2 ;;
    --google-client-id) GOOGLE_CLIENT_ID_ARG=${2:-}; shift 2 ;;
    --self-signed) SELF_SIGNED=1; shift ;;
    --data-disk) DATA_DISK=${2:-}; shift 2 ;;
    --docker-disk) DOCKER_DISK=${2:-}; shift 2 ;;
    --print-env) PRINT_ENV=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "cờ không hỗ trợ: $1" ;;
  esac
done

[[ "$PROFILE" == prod || "$PROFILE" == test ]] || { usage >&2; die "--profile phải là prod hoặc test"; }
[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "--domain không hợp lệ hoặc bị thiếu"
[[ "$DATA_DISK" =~ ^[1-9][0-9]*G$ && "$DOCKER_DISK" =~ ^[1-9][0-9]*G$ ]] || die "--data-disk/--docker-disk dạng <số>G"

# ---- Tham số tài nguyên theo profile — REQ-DP-07 (prod = mặc định SPEC) ----
if [[ "$PROFILE" == prod ]]; then
  P_SESSION_MEMORY=28G;  P_SESSION_SHM=8G;   P_HOST_RESERVED_MEMORY=8G;   P_HOST_RESERVED_CPU_THREADS=2
  P_USER_QUOTA_SOFT=80G; P_USER_QUOTA_HARD=100G; P_USER_QUOTA_GRACE=7d;   P_CONTAINER_WRITABLE_LAYER=20G
  P_BASE_IMAGE=vmu/base:cuda12.8
else
  P_SESSION_MEMORY=256M; P_SESSION_SHM=64M;  P_HOST_RESERVED_MEMORY=384M; P_HOST_RESERVED_CPU_THREADS=0
  P_USER_QUOTA_SOFT=1G;  P_USER_QUOTA_HARD=2G;   P_USER_QUOTA_GRACE=10m;  P_CONTAINER_WRITABLE_LAYER=2G
  P_BASE_IMAGE=vmu/base:lite
fi

# Chưa có OAuth Client ID: cài được, nhưng đăng nhập Google chưa chạy. Có ID thì chạy lại với --google-client-id (ghi đè).
NO_CLIENT_ID=chua-cau-hinh.apps.googleusercontent.com

gen_hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
gen_password() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32 || true; }

# Giá trị đang có trong vmu.env (rỗng nếu chưa có)
env_get() {
  [[ -r "$ENV_FILE" ]] || return 0
  grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- || true
}
# Giữ giá trị cũ nếu có, không thì dùng giá trị mới
keep() { local v; v=$(env_get "$1"); printf '%s' "${v:-$2}"; }

render_env() {
  local db_url enc_key
  db_url=$(env_get DATABASE_URL)
  [[ -n "$db_url" ]] || db_url="postgres://vmu:$(gen_password)@127.0.0.1:5432/vmu"
  enc_key=$(env_get PASSWORD_ENC_KEY)
  [[ -n "$enc_key" ]] || enc_key=$(gen_hex 32)
  cat <<EOF
# /etc/vmu/vmu.env — sinh bởi deploy/install.sh (profile $PROFILE). root:vmu 0640, không đưa lên git.
# Chạy lại install.sh chỉ thêm biến còn thiếu; muốn đổi giá trị thì sửa file này rồi: systemctl restart vmu-api vmu-scheduler
VMU_PROFILE=$(keep VMU_PROFILE "$PROFILE")
DATABASE_URL=$db_url
PASSWORD_ENC_KEY=$enc_key
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID_ARG:-$(keep GOOGLE_CLIENT_ID "$NO_CLIENT_ID")}
SSH_HOST=$(keep SSH_HOST "$DOMAIN")
DASHBOARD_URL=$(keep DASHBOARD_URL "https://$DOMAIN")
HOST=127.0.0.1
PORT=3000

# Tham số tài nguyên (REQ-DP-07)
SESSION_MEMORY=$(keep SESSION_MEMORY "$P_SESSION_MEMORY")
SESSION_SHM=$(keep SESSION_SHM "$P_SESSION_SHM")
HOST_RESERVED_MEMORY=$(keep HOST_RESERVED_MEMORY "$P_HOST_RESERVED_MEMORY")
HOST_RESERVED_CPU_THREADS=$(keep HOST_RESERVED_CPU_THREADS "$P_HOST_RESERVED_CPU_THREADS")
USER_QUOTA_SOFT=$(keep USER_QUOTA_SOFT "$P_USER_QUOTA_SOFT")
USER_QUOTA_HARD=$(keep USER_QUOTA_HARD "$P_USER_QUOTA_HARD")
USER_QUOTA_GRACE=$(keep USER_QUOTA_GRACE "$P_USER_QUOTA_GRACE")
CONTAINER_WRITABLE_LAYER=$(keep CONTAINER_WRITABLE_LAYER "$P_CONTAINER_WRITABLE_LAYER")
BASE_IMAGE=$(keep BASE_IMAGE "$P_BASE_IMAGE")
EOF
}

if [[ $PRINT_ENV -eq 1 ]]; then
  render_env
  exit 0
fi

# =====================================================================
[[ $EUID -eq 0 ]] || die "cần chạy bằng root (sudo)"
. /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 24.04 ]] || die "chỉ hỗ trợ Ubuntu 24.04 (máy này: ${PRETTY_NAME:-?})"
export DEBIAN_FRONTEND=noninteractive

step_packages() {
  log "Cài gói hệ thống"
  apt-get update -qq
  apt-get install -y -qq postgresql nginx certbot docker.io docker-buildx xfsprogs tzdata chrony openssh-server \
    sudo rsync curl ca-certificates xz-utils ufw iproute2 openssl gnupg >/dev/null
}

# Docker 29 mặc định lưu image bằng containerd snapshotter (/var/lib/containerd), không hỗ trợ
# --storage-opt size= (REQ-ST-03). Dùng graphdriver overlay2 trên /var/lib/docker (XFS pquota).
step_docker_daemon() {
  log "Docker: overlay2 trên /var/lib/docker, giới hạn log container"
  install -d /etc/docker
  cat > /etc/docker/daemon.json <<'JSON'
{
  "storage-driver": "overlay2",
  "features": { "containerd-snapshotter": false },
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "2" }
}
JSON
  # Docker chỉ chạy khi /var/lib/docker (XFS pquota) đã mount
  install -d /etc/systemd/system/docker.service.d
  printf '[Unit]\nRequiresMountsFor=/var/lib/docker\n' > /etc/systemd/system/docker.service.d/vmu.conf
  systemctl daemon-reload
  systemctl restart docker
}

step_node() {
  if [[ -x "$NODE_DIR/bin/node" && "$("$NODE_DIR/bin/node" -v)" == v24.* ]]; then
    note "Node.js $("$NODE_DIR/bin/node" -v) đã có"; return
  fi
  log "Cài Node.js 24 (bản chính thức, kiểm SHA-256)"
  local arch base file tmp
  case "$(uname -m)" in x86_64) arch=x64 ;; aarch64) arch=arm64 ;; *) die "kiến trúc không hỗ trợ: $(uname -m)" ;; esac
  base=https://nodejs.org/dist/latest-v24.x
  tmp=$(mktemp -d)
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file=$(grep -oE "node-v24\.[0-9]+\.[0-9]+-linux-$arch\.tar\.xz" "$tmp/SHASUMS256.txt" | head -1)
  [[ -n "$file" ]] || die "không tìm thấy bản Node.js 24 cho $arch"
  curl -fsSL "$base/$file" -o "$tmp/$file"
  (cd "$tmp" && grep " $file\$" SHASUMS256.txt | sha256sum -c --quiet -) || die "sai SHA-256 của $file"
  rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR"
  tar -xJf "$tmp/$file" -C "$NODE_DIR" --strip-components=1
  rm -rf "$tmp"
  note "$("$NODE_DIR/bin/node" -v)"
}

step_time() {
  log "Đồng hồ: NTP (chrony), múi giờ hệ thống Asia/Ho_Chi_Minh (chỉ cho log) — REQ-DP-06"
  systemctl enable --now chrony >/dev/null 2>&1 || true
  timedatectl set-ntp true 2>/dev/null || true
  timedatectl set-timezone Asia/Ho_Chi_Minh
}

step_swap() {
  [[ "$PROFILE" == test ]] || return 0
  local mem_kb
  mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
  if (( mem_kb < 2 * 1024 * 1024 )) && [[ -z "$(swapon --noheadings --show)" ]]; then
    log "Tạo 2 GiB swap (RAM < 2 GiB)"
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
}

# fstype + tùy chọn mount có quota project
has_xfs_quota() { # <mountpoint> <regex tùy chọn>
  local line
  line=$(findmnt -n -o TARGET,FSTYPE,OPTIONS --target "$1" 2>/dev/null | head -1) || return 1
  [[ $(awk '{print $1}' <<<"$line") == "$1" && $(awk '{print $2}' <<<"$line") == xfs && $(awk '{print $3}' <<<"$line") =~ $2 ]]
}

loop_xfs() { # <tên> <mountpoint> <kích thước> <tùy chọn quota>
  local img="$DISK_DIR/$1.img"
  mkdir -p "$DISK_DIR" "$2"
  chmod 0700 "$DISK_DIR"
  if [[ ! -f "$img" ]]; then
    fallocate -l "$3" "$img"
    chmod 0600 "$img"
    mkfs.xfs -q "$img"
  fi
  # Không dùng nofail: mount có nofail không được xếp trước local-fs.target, Docker có thể chạy trước khi ổ sẵn sàng
  grep -q "^$img " /etc/fstab || echo "$img $2 xfs loop,$4 0 0" >> /etc/fstab
  mountpoint -q "$2" || mount "$2"
}

step_disks() {
  log "Đĩa XFS có project quota cho /data và /var/lib/docker"
  if [[ "$PROFILE" == prod ]]; then
    has_xfs_quota /data 'prjquota|pquota' \
      || die "/data phải là phân vùng XFS mount với prjquota (vd trong /etc/fstab: UUID=… /data xfs defaults,prjquota 0 2)"
    has_xfs_quota /var/lib/docker 'prjquota|pquota' \
      || die "/var/lib/docker phải là phân vùng XFS mount với pquota (cần cho --storage-opt size=)"
    note "đạt"
    return
  fi
  if ! has_xfs_quota /data 'prjquota|pquota' || ! has_xfs_quota /var/lib/docker 'prjquota|pquota'; then
    local need avail
    need=$(( ${DATA_DISK%G} + ${DOCKER_DISK%G} + 2 ))
    avail=$(df --output=avail -BG /var/lib | tail -1 | tr -dc '0-9')
    (( avail >= need )) || die "cần ~${need}G trống trong /var/lib, hiện còn ${avail}G (giảm --data-disk/--docker-disk)"
  fi
  has_xfs_quota /data 'prjquota|pquota' || loop_xfs data /data "$DATA_DISK" prjquota
  if ! has_xfs_quota /var/lib/docker 'prjquota|pquota'; then
    systemctl stop docker.socket docker 2>/dev/null || true
    if [[ -d /var/lib/docker ]] && ! mountpoint -q /var/lib/docker && [[ -n "$(ls -A /var/lib/docker)" ]]; then
      mv /var/lib/docker "/var/lib/docker.bak-$(date +%Y%m%d%H%M%S)"
      note "đã chuyển /var/lib/docker cũ sang /var/lib/docker.bak-*"
    fi
    loop_xfs docker /var/lib/docker "$DOCKER_DISK" pquota
    systemctl start docker
  fi
  note "/data: $(findmnt -n -o SOURCE,FSTYPE,OPTIONS /data)"
  note "/var/lib/docker: $(findmnt -n -o SOURCE,FSTYPE,OPTIONS /var/lib/docker)"
}

step_users_dirs() {
  log "User hệ thống vmu, nhóm vmu-users, thư mục"
  id vmu >/dev/null 2>&1 || useradd --system --home-dir /opt/vmu --no-create-home --shell /usr/sbin/nologin --user-group vmu
  usermod -aG docker vmu
  getent group vmu-users >/dev/null || groupadd vmu-users
  install -d -o root -g root -m 0755 /opt/vmu
  install -d -o root -g vmu -m 0750 "$(dirname "$ENV_FILE")"
  install -d -o root -g root -m 0711 /data/users
  install -d -o root -g root -m 0755 /data/shared
  install -d -o root -g root -m 0755 /var/log/vmu
  install -d -o vmu -g vmu -m 0750 /var/log/vmu/bookings
  # Grace period của soft quota (REQ-ST-02), tính bằng giây
  local grace secs
  grace=$(keep USER_QUOTA_GRACE "$P_USER_QUOTA_GRACE")
  case "${grace: -1}" in m) secs=$(( ${grace%m} * 60 )) ;; h) secs=$(( ${grace%h} * 3600 )) ;; d) secs=$(( ${grace%d} * 86400 )) ;; *) die "USER_QUOTA_GRACE sai: $grace" ;; esac
  xfs_quota -x -c "timer -p -b $secs" /data
}

step_app() {
  log "Mã nguồn vào $APP"
  if [[ "$SRC" != "$APP" ]]; then
    mkdir -p "$APP"
    rsync -a --delete \
      --exclude node_modules --exclude .git --exclude reports --exclude test-results \
      --exclude playwright-report --exclude frontend/tests \
      "$SRC/" "$APP/"
  fi
  chown -R root:root "$APP"
  (cd "$APP" && PATH="$NODE_DIR/bin:$PATH" npm ci --omit=dev --no-audit --no-fund --update-notifier=false --loglevel=error)
}

step_helpers() {
  log "Helper, sudoers, sshd — docs/10-design/ssh.md"
  install -o root -g root -m 0755 "$APP/deploy/vmu-provision" /usr/local/sbin/vmu-provision
  install -o root -g root -m 0755 "$APP/deploy/vmu-exec" /usr/local/sbin/vmu-exec
  install -o root -g root -m 0755 "$APP/deploy/vmu-doctor" /usr/local/sbin/vmu-doctor
  install -o root -g root -m 0755 "$APP/deploy/vmu-cli" /usr/local/sbin/vmu-cli
  install -o root -g root -m 0755 "$APP/deploy/vmu-enter" /usr/local/bin/vmu-enter
  visudo -cf "$APP/deploy/sudoers.d/vmu" >/dev/null || die "deploy/sudoers.d/vmu sai cú pháp"
  install -o root -g root -m 0440 "$APP/deploy/sudoers.d/vmu" /etc/sudoers.d/vmu
  install -o root -g root -m 0644 "$APP/deploy/sshd/50-vmu.conf" /etc/ssh/sshd_config.d/50-vmu.conf
  grep -Eqi '^\s*UsePAM\s+yes' /etc/ssh/sshd_config || die "/etc/ssh/sshd_config cần UsePAM yes (REQ-US-11)"
  mkdir -p /run/sshd
  sshd -t || die "cấu hình sshd lỗi"
  systemctl reload ssh 2>/dev/null || systemctl restart ssh
}

step_env() {
  log "Biến môi trường $ENV_FILE"
  local tmp
  tmp=$(mktemp)
  render_env > "$tmp"
  install -o root -g vmu -m 0640 "$tmp" "$ENV_FILE"
  rm -f "$tmp"
  set -a; . "$ENV_FILE"; set +a
  "$NODE_DIR/bin/node" -e "require('$APP/backend/src/config').configFromEnv(process.env)" || die "vmu.env có tham số sai (xem thông báo ở trên)"
}

step_postgres() {
  log "PostgreSQL: CSDL vmu, timezone UTC — REQ-DP-06"
  systemctl enable --now postgresql >/dev/null
  local pw
  pw=$(sed -E 's#^postgres://vmu:([^@]+)@.*#\1#' <<<"$DATABASE_URL")
  [[ "$pw" =~ ^[A-Za-z0-9]+$ ]] || die "DATABASE_URL trong vmu.env không đúng dạng postgres://vmu:<mật khẩu chữ-số>@…"
  runuser -u postgres -- psql -q -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vmu') THEN CREATE ROLE vmu LOGIN; END IF;
END \$\$;
ALTER ROLE vmu PASSWORD '$pw';
ALTER SYSTEM SET timezone = 'UTC';
ALTER SYSTEM SET log_timezone = 'Asia/Ho_Chi_Minh';
SELECT pg_reload_conf();
SQL
  runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'vmu'" | grep -q 1 \
    || runuser -u postgres -- createdb -O vmu vmu
  vmu_cli migrate
}

vmu_cli() { bash "$APP/deploy/vmu-cli" "$@"; }

step_docker() {
  log "Docker: mạng ${CONTAINER_NETWORK:-vmu-net}, image $BASE_IMAGE"
  systemctl enable --now docker >/dev/null
  if [[ "$PROFILE" == prod ]]; then
    command -v nvidia-smi >/dev/null || die "chưa có NVIDIA driver (cài driver cho RTX 5090, khởi động lại, rồi chạy lại script)"
    if ! command -v nvidia-ctk >/dev/null; then
      note "Cài NVIDIA Container Toolkit"
      curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
      curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
        | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
        > /etc/apt/sources.list.d/nvidia-container-toolkit.list
      apt-get update -qq && apt-get install -y -qq nvidia-container-toolkit >/dev/null
    fi
    nvidia-ctk runtime configure --runtime=docker >/dev/null
    systemctl restart docker
  fi
  docker network inspect vmu-net >/dev/null 2>&1 \
    || docker network create --driver bridge -o com.docker.network.bridge.enable_icc=false vmu-net >/dev/null
  if ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
    note "Build $BASE_IMAGE (lần đầu mất vài phút)"
    if [[ "$PROFILE" == prod ]]; then
      docker build -q -t "$BASE_IMAGE" "$APP/deploy/base-image"
    else
      docker build -q --build-arg BASE=ubuntu:24.04 -t "$BASE_IMAGE" "$APP/deploy/base-image"
    fi
  fi
}

step_systemd() {
  log "Dịch vụ systemd — REQ-DP-01"
  install -o root -g root -m 0644 "$APP"/deploy/systemd/vmu-{api,scheduler,purge}.service "$APP"/deploy/systemd/vmu-purge.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable vmu-api vmu-scheduler vmu-purge.timer >/dev/null 2>&1
  systemctl restart vmu-api vmu-scheduler
  systemctl start vmu-purge.timer
}

step_nginx() {
  log "Nginx + HTTPS — REQ-DP-02"
  local cert key
  mkdir -p /var/www/html
  if [[ $SELF_SIGNED -eq 1 ]]; then
    cert=/etc/vmu/tls/cert.pem; key=/etc/vmu/tls/key.pem
    if [[ ! -f "$cert" ]]; then
      install -d -m 0700 /etc/vmu/tls
      openssl req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=$DOMAIN" \
        -addext "subjectAltName=DNS:$DOMAIN" -keyout "$key" -out "$cert" 2>/dev/null
    fi
  else
    cert=/etc/letsencrypt/live/$DOMAIN/fullchain.pem; key=/etc/letsencrypt/live/$DOMAIN/privkey.pem
    if [[ ! -f "$cert" ]]; then
      # Lần đầu: site mặc định của Ubuntu phục vụ /var/www/html trên cổng 80 cho thử thách ACME
      systemctl start nginx
      local contact=(--email "$EMAIL")
      [[ -n "$EMAIL" ]] || contact=(--register-unsafely-without-email)
      certbot certonly --webroot -w /var/www/html -d "$DOMAIN" "${contact[@]}" --agree-tos -n \
        --deploy-hook 'systemctl reload nginx' \
        || die "không xin được chứng chỉ: kiểm tra DNS của $DOMAIN trỏ về máy này và cổng 80 mở"
    fi
  fi
  sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__APP__#$APP#g" -e "s#__CERT__#$cert#g" -e "s#__KEY__#$key#g" \
    "$APP/deploy/nginx/vmu.conf" > /etc/nginx/sites-available/vmu
  ln -sf /etc/nginx/sites-available/vmu /etc/nginx/sites-enabled/vmu
  rm -f /etc/nginx/sites-enabled/default
  nginx -t 2>/dev/null || { nginx -t; die "cấu hình Nginx lỗi"; }
  systemctl enable nginx >/dev/null 2>&1
  systemctl reload nginx 2>/dev/null || systemctl restart nginx
}

step_firewall() {
  log "Tường lửa: chỉ mở SSH, 80, 443"
  local port
  for port in $(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}'); do ufw allow "$port/tcp" >/dev/null; done
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
}

step_packages
step_node
step_time
step_swap
step_disks
step_docker_daemon
step_users_dirs
step_app
step_helpers
step_env
step_postgres
step_docker
step_systemd
step_nginx
step_firewall

log "Kiểm tra toàn hệ thống (vmu-doctor)"
sleep 3
doctor_ok=0
bash /usr/local/sbin/vmu-doctor && doctor_ok=1

cat <<EOF

Xong. Dashboard: https://$DOMAIN
  1. Đăng nhập bằng tài khoản @vimaru.edu.vn của admin.
  2. Cấp quyền admin:   sudo vmu-cli promote-admin <email>
  3. Kiểm tra lại bất cứ lúc nào:   sudo vmu-doctor
EOF
[[ "$PROFILE" == test ]] && echo "  Profile test: không có GPU — ca có GPU sẽ báo lỗi khởi chạy."
[[ "$GOOGLE_CLIENT_ID" == "$NO_CLIENT_ID" ]] && echo "  CHƯA có Google Client ID: đăng nhập chưa chạy. Tạo Client ID (origin https://$DOMAIN) rồi chạy lại script với --google-client-id <id>."
[[ $doctor_ok -eq 1 ]] || { echo; die "vmu-doctor còn mục FAIL, xem ở trên"; }
