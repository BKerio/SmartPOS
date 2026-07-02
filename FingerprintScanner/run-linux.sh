#!/usr/bin/env bash
# Linux setup for ZKTeco FingerprintScanner
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v dotnet >/dev/null; then
  echo "Install .NET 8 SDK first: https://dotnet.microsoft.com/download/dotnet/8.0"
  exit 1
fi

if ! dpkg -s libusb-1.0-0 >/dev/null 2>&1; then
  echo "Installing libusb-1.0-0 (required by ZKTeco Linux SDK)..."
  sudo apt-get update -qq
  sudo apt-get install -y libusb-1.0-0
fi

if ! command -v patchelf >/dev/null; then
  echo "Installing patchelf (sets RPATH on SDK .so files)..."
  sudo apt-get install -y patchelf
fi

dotnet build

LIBS="bin/Debug/net8.0/libs"
for f in "$LIBS"/*.so*; do
  patchelf --set-rpath '$ORIGIN' "$f" 2>/dev/null || true
done

echo "Starting fingerprint scanner service..."
dotnet run "$@"
