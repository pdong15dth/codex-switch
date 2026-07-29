#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_LABEL="local.codexswitch.server"
MENUBAR_LABEL="local.codexswitch.menubar"
LAUNCH_DOMAIN="gui/$(id -u)"
AGENT_DIR="$HOME/Library/LaunchAgents"
DATA_DIR="$HOME/.codex-switch"
LOG_DIR="$DATA_DIR/logs"
SERVER_PLIST="$AGENT_DIR/$SERVER_LABEL.plist"
MENUBAR_PLIST="$AGENT_DIR/$MENUBAR_LABEL.plist"
APP_PATH="$PROJECT_DIR/menubar/CodexSwitchBar.app"
APP_EXECUTABLE="$APP_PATH/Contents/MacOS/CodexSwitchBar"

find_runtime() {
  NPM_BIN="${CODEX_SWITCH_NPM_BIN:-$(command -v npm || true)}"
  NODE_BIN="${CODEX_SWITCH_NODE_BIN:-$(command -v node || true)}"

  if [[ -z "$NPM_BIN" || ! -x "$NPM_BIN" ]]; then
    echo "Không tìm thấy npm. Hãy mở terminal có Node.js rồi chạy lại." >&2
    exit 1
  fi
  if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
    echo "Không tìm thấy node. Hãy mở terminal có Node.js rồi chạy lại." >&2
    exit 1
  fi

  RUNTIME_BIN_DIR="$(dirname "$NODE_BIN")"
  RUNTIME_PATH="$RUNTIME_BIN_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
}

is_loaded() {
  launchctl print "$LAUNCH_DOMAIN/$1" >/dev/null 2>&1
}

bootout_if_loaded() {
  if is_loaded "$1"; then
    launchctl bootout "$LAUNCH_DOMAIN/$1"
  fi
}

new_plist() {
  local target="$1"
  local tmp
  tmp="$(mktemp "$AGENT_DIR/.codexswitch.XXXXXX")"
  plutil -create xml1 "$tmp"
  printf '%s' "$tmp"
}

finish_plist() {
  local tmp="$1"
  local target="$2"
  plutil -lint "$tmp" >/dev/null
  /usr/bin/install -m 0644 "$tmp" "$target"
  rm -f "$tmp"
}

write_server_plist() {
  local tmp
  tmp="$(new_plist "$SERVER_PLIST")"

  plutil -insert Label -string "$SERVER_LABEL" "$tmp"
  plutil -insert ProgramArguments -array "$tmp"
  plutil -insert ProgramArguments.0 -string "$NPM_BIN" "$tmp"
  plutil -insert ProgramArguments.1 -string "run" "$tmp"
  plutil -insert ProgramArguments.2 -string "start" "$tmp"
  plutil -insert WorkingDirectory -string "$PROJECT_DIR" "$tmp"
  plutil -insert EnvironmentVariables -dictionary "$tmp"
  plutil -insert EnvironmentVariables.HOME -string "$HOME" "$tmp"
  plutil -insert EnvironmentVariables.PATH -string "$RUNTIME_PATH" "$tmp"
  plutil -insert EnvironmentVariables.NODE_ENV -string "production" "$tmp"
  plutil -insert EnvironmentVariables.NPM_CONFIG_UPDATE_NOTIFIER -string "false" "$tmp"
  plutil -insert RunAtLoad -bool true "$tmp"
  plutil -insert KeepAlive -bool true "$tmp"
  plutil -insert ThrottleInterval -integer 10 "$tmp"
  plutil -insert ProcessType -string "Background" "$tmp"
  plutil -insert StandardOutPath -string "$LOG_DIR/server.log" "$tmp"
  plutil -insert StandardErrorPath -string "$LOG_DIR/server.error.log" "$tmp"

  finish_plist "$tmp" "$SERVER_PLIST"
}

write_menubar_plist() {
  local tmp
  tmp="$(new_plist "$MENUBAR_PLIST")"

  plutil -insert Label -string "$MENUBAR_LABEL" "$tmp"
  plutil -insert ProgramArguments -array "$tmp"
  plutil -insert ProgramArguments.0 -string "$APP_EXECUTABLE" "$tmp"
  plutil -insert WorkingDirectory -string "$PROJECT_DIR" "$tmp"
  plutil -insert EnvironmentVariables -dictionary "$tmp"
  plutil -insert EnvironmentVariables.HOME -string "$HOME" "$tmp"
  plutil -insert EnvironmentVariables.PATH -string "$RUNTIME_PATH" "$tmp"
  plutil -insert RunAtLoad -bool true "$tmp"
  plutil -insert KeepAlive -dictionary "$tmp"
  plutil -insert KeepAlive.SuccessfulExit -bool false "$tmp"
  plutil -insert LimitLoadToSessionType -string "Aqua" "$tmp"
  plutil -insert ThrottleInterval -integer 10 "$tmp"
  plutil -insert ProcessType -string "Interactive" "$tmp"
  plutil -insert StandardOutPath -string "$LOG_DIR/menubar.log" "$tmp"
  plutil -insert StandardErrorPath -string "$LOG_DIR/menubar.error.log" "$tmp"

  finish_plist "$tmp" "$MENUBAR_PLIST"
}

print_agent_status() {
  local label="$1"
  local title="$2"
  local details

  if ! details="$(launchctl print "$LAUNCH_DOMAIN/$label" 2>/dev/null)"; then
    echo "$title: chưa cài"
    return
  fi

  local state pid
  state="$(awk '/^[[:space:]]*state =/ { print $3; exit }' <<<"$details")"
  pid="$(awk '/^[[:space:]]*pid =/ { print $3; exit }' <<<"$details")"
  echo "$title: đã nạp · trạng thái ${state:-chờ}${pid:+ · PID $pid}"
}

install_agents() {
  find_runtime
  mkdir -p "$AGENT_DIR" "$LOG_DIR"

  echo "Build dashboard production..."
  "$NPM_BIN" run build
  echo "Build menu bar app..."
  "$NPM_BIN" run menubar

  bootout_if_loaded "$SERVER_LABEL"
  bootout_if_loaded "$MENUBAR_LABEL"
  write_server_plist
  write_menubar_plist

  launchctl bootstrap "$LAUNCH_DOMAIN" "$SERVER_PLIST"
  launchctl bootstrap "$LAUNCH_DOMAIN" "$MENUBAR_PLIST"
  launchctl enable "$LAUNCH_DOMAIN/$SERVER_LABEL"
  launchctl enable "$LAUNCH_DOMAIN/$MENUBAR_LABEL"
  launchctl kickstart -k "$LAUNCH_DOMAIN/$SERVER_LABEL"

  echo
  echo "Đã cài tự khởi động."
  print_agent_status "$SERVER_LABEL" "Dashboard"
  print_agent_status "$MENUBAR_LABEL" "Menu bar"
  echo "Log: $LOG_DIR"
}

uninstall_agents() {
  bootout_if_loaded "$SERVER_LABEL"
  bootout_if_loaded "$MENUBAR_LABEL"
  rm -f "$SERVER_PLIST" "$MENUBAR_PLIST"
  echo "Đã gỡ tự khởi động. Profile và backup không bị xoá."
}

show_status() {
  print_agent_status "$SERVER_LABEL" "Dashboard"
  print_agent_status "$MENUBAR_LABEL" "Menu bar"

  if /usr/bin/curl -fsS --max-time 2 "http://127.0.0.1:6677/api/state" >/dev/null 2>&1; then
    echo "API: hoạt động tại http://127.0.0.1:6677"
  else
    echo "API: chưa phản hồi"
  fi
}

case "${1:-}" in
  install)
    install_agents
    ;;
  uninstall)
    uninstall_agents
    ;;
  status)
    show_status
    ;;
  *)
    echo "Dùng: $0 {install|status|uninstall}" >&2
    exit 2
    ;;
esac
