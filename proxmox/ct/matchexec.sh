#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVED/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: slamanna212
# License: MIT | https://github.com/community-scripts/ProxmoxVED/raw/main/LICENSE
# Source: https://github.com/slamanna212/matchexec

APP="MatchExec"
var_tags="${var_tags:-discord;gaming;tournament}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-2048}"
var_disk="${var_disk:-8}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/matchexec ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  RELEASE=$(curl -s https://api.github.com/repos/slamanna212/matchexec/releases/latest | grep "tag_name" | awk -F'"' '{print $4}')
  INSTALLED="v$(node -p "require('/opt/matchexec/package.json').version" 2>/dev/null || echo "none")"

  if [[ "$RELEASE" == "$INSTALLED" ]]; then
    msg_ok "No update available. Already on ${RELEASE}"
    exit
  fi

  msg_info "Stopping Services"
  systemctl stop matchexec-web matchexec-discord-bot matchexec-scheduler matchexec-stats-processor
  msg_ok "Stopped Services"

  msg_info "Backing Up Data"
  cp -r /opt/matchexec/app_data /tmp/matchexec-data-bak
  msg_ok "Backed Up Data"

  msg_info "Updating to ${RELEASE}"
  rm -rf /opt/matchexec
  git clone --branch "$RELEASE" --depth 1 -q https://github.com/slamanna212/matchexec.git /opt/matchexec
  cp -r /tmp/matchexec-data-bak /opt/matchexec/app_data
  rm -rf /tmp/matchexec-data-bak
  msg_ok "Updated Source to ${RELEASE}"

  msg_info "Installing Dependencies"
  cd /opt/matchexec
  $STD npm ci
  msg_ok "Installed Dependencies"

  msg_info "Building Application"
  cd /opt/matchexec
  $STD npm run build
  cp -r public .next/standalone/
  cp -r .next/static .next/standalone/.next/static
  $STD npm prune --omit=dev
  msg_ok "Built Application"

  msg_info "Running Migrations"
  cd /opt/matchexec
  node dist/migrator.js
  msg_ok "Ran Migrations"

  msg_info "Starting Services"
  systemctl start matchexec-web matchexec-discord-bot matchexec-scheduler matchexec-stats-processor
  msg_ok "Started Services"

  msg_ok "Updated Successfully to ${RELEASE}!"
  exit
}

start
build_container
description

msg_ok "Completed Successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:3000${CL}"
