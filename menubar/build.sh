#!/bin/bash
# Build the Codex Switch menu bar app:  bash menubar/build.sh  (or npm run menubar)
# Output: menubar/CodexSwitchBar.app — open it once, it lives in the menu bar.
set -euo pipefail
cd "$(dirname "$0")"

APP="CodexSwitchBar.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
swiftc -O -o "$APP/Contents/MacOS/CodexSwitchBar" main.swift
cp Info.plist "$APP/Contents/Info.plist"

echo "Built $APP"
echo "Chạy:  open '$PWD/$APP'"
