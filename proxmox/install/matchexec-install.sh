#!/usr/bin/env bash
# Copyright (c) 2021-2026 community-scripts ORG
# Author: slamanna212
# License: MIT | https://github.com/community-scripts/ProxmoxVED/raw/main/LICENSE
# Source: https://github.com/slamanna212/matchexec

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"

color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt-get install -y \
  curl \
  git \
  ffmpeg
msg_ok "Installed Dependencies"

msg_info "Installing Node.js 24"
curl -fsSL https://deb.nodesource.com/setup_24.x | bash - &>/dev/null
$STD apt-get install -y nodejs
msg_ok "Installed Node.js 24"

msg_info "Fetching Latest Release"
RELEASE=$(curl -s https://api.github.com/repos/slamanna212/matchexec/releases/latest | grep "tag_name" | awk -F'"' '{print $4}')
msg_ok "Latest Release: ${RELEASE}"

msg_info "Cloning MatchExec ${RELEASE}"
$STD git clone --branch "$RELEASE" --depth 1 https://github.com/slamanna212/matchexec.git /opt/matchexec
msg_ok "Cloned MatchExec"

msg_info "Installing Node Dependencies"
cd /opt/matchexec
$STD npm ci
msg_ok "Installed Node Dependencies"

msg_info "Building Application"
cd /opt/matchexec
$STD npm run build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/static
$STD npm prune --omit=dev
msg_ok "Built Application"

msg_info "Setting Up Data Directory"
mkdir -p /opt/matchexec/app_data/data
msg_ok "Set Up Data Directory"

msg_info "Running Database Migrations"
cd /opt/matchexec
node dist/migrator.js
msg_ok "Ran Database Migrations"

msg_info "Creating Services"
cat <<EOF >/etc/systemd/system/matchexec-web.service
[Unit]
Description=MatchExec Web
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/matchexec/.next/standalone
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=DATABASE_PATH=/opt/matchexec/app_data/data/matchexec.db
Environment=TZ=UTC

[Install]
WantedBy=multi-user.target
EOF

cat <<EOF >/etc/systemd/system/matchexec-discord-bot.service
[Unit]
Description=MatchExec Discord Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/matchexec
ExecStart=/usr/bin/node dist/discord-bot.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=DATABASE_PATH=/opt/matchexec/app_data/data/matchexec.db
Environment=TZ=UTC

[Install]
WantedBy=multi-user.target
EOF

cat <<EOF >/etc/systemd/system/matchexec-scheduler.service
[Unit]
Description=MatchExec Scheduler
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/matchexec
ExecStart=/usr/bin/node dist/scheduler.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=DATABASE_PATH=/opt/matchexec/app_data/data/matchexec.db
Environment=TZ=UTC

[Install]
WantedBy=multi-user.target
EOF

cat <<EOF >/etc/systemd/system/matchexec-stats-processor.service
[Unit]
Description=MatchExec Stats Processor
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/matchexec
ExecStart=/usr/bin/node dist/stats-processor.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=DATABASE_PATH=/opt/matchexec/app_data/data/matchexec.db
Environment=TZ=UTC

[Install]
WantedBy=multi-user.target
EOF

systemctl enable -q --now matchexec-web matchexec-discord-bot matchexec-scheduler matchexec-stats-processor
msg_ok "Created Services"

motd_ssh
customize
cleanup_lxc
