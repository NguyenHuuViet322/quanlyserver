# Image chung cho mọi container — REQ-CT-06, REQ-CT-11, REQ-DP-06. docs/10-design/container.md
# Build máy chủ thật: docker build -t vmu/base:cuda12.8 deploy/base-image
# Build VPS thử (không GPU, REQ-DP-08): docker build --build-arg BASE=ubuntu:24.04 -t vmu/base:lite deploy/base-image
# Người dùng không có root trong container: phần mềm cần root thì thêm vào đây rồi build lại, đổi BASE_IMAGE.
ARG BASE=nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04
FROM ${BASE}

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    TZ=Asia/Ho_Chi_Minh \
    CONDA_DIR=/opt/conda

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash ca-certificates curl wget git git-lfs tmux htop nano vim less unzip zip \
      rsync openssh-server openssh-sftp-server tzdata locales build-essential \
    && rm -rf /var/lib/apt/lists/*

# Miniforge (conda + mamba, kênh conda-forge). Env của người dùng nằm trong /workspace/.conda (HOME=/workspace)
RUN curl -fsSL -o /tmp/miniforge.sh https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh \
    && bash /tmp/miniforge.sh -b -p "$CONDA_DIR" && rm /tmp/miniforge.sh \
    && "$CONDA_DIR/bin/conda" clean -afy
ENV PATH=/opt/conda/bin:$PATH
RUN printf 'envs_dirs:\n  - ~/.conda/envs\npkgs_dirs:\n  - ~/.conda/pkgs\n' > /opt/conda/.condarc \
    && echo '. /opt/conda/etc/profile.d/conda.sh' > /etc/profile.d/conda.sh

# sshd trong container (chạy bằng UID của user, kiểu inetd) — docs/10-design/ssh.md
COPY sshd_config /etc/vmu/sshd_config
COPY vmu-sshd /usr/local/sbin/vmu-sshd
RUN chmod 0644 /etc/vmu/sshd_config && chmod 0755 /usr/local/sbin/vmu-sshd \
    && mkdir -p /run/sshd

CMD ["sleep", "infinity"]
