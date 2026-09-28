# M8 — Triển khai

- [ ] **DP-T01** (REQ-DP-01) · happy · system — `kill -9` tiến trình backend/scheduler → systemd khởi động lại trong ≤ 10 giây; reboot server → cả hai tự chạy
- [ ] **DP-T02** (REQ-DP-02) · negative · system — Gọi `http://` → chuyển hướng `301` sang `https://`; cổng backend không nghe trên địa chỉ public
- [ ] **DP-T03** (REQ-DP-03, REQ-CT-02) · edge · system — Hai phiên cùng cấp phát hết giới hạn RAM → tổng `Memory` của container = 56 GiB (= 64 − 8), host không bị OOM killer, SSH và Dashboard vẫn phản hồi
- [ ] **DP-T04** (REQ-DP-04) · happy · system — Image không dùng quá 30 ngày bị xóa; image đang được ca hiệu lực dùng không bị xóa
- [ ] **DP-T05** (REQ-DP-05) · happy · manual — Có tài liệu người dùng gồm: đăng ký, SSH, lưu dữ liệu trong `/workspace`, tự sao lưu (server không sao lưu)
- [ ] **DP-T06** (REQ-DP-06) · happy · system — `timedatectl` báo `System clock synchronized: yes`; `psql -c 'SHOW timezone'` = `UTC`; `BASE_IMAGE` có `/usr/share/zoneinfo/Asia/Ho_Chi_Minh`
