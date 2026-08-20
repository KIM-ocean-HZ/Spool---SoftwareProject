#!/usr/bin/env bash
# 编译 `spool-ai` 并按 Tauri 要的名字放到 src-tauri/binaries/。
#
# Tauri 的 externalBin 认的是「基名 + 目标三元组」这个文件名（跨平台交叉打包时同一个目录里
# 会躺着好几份），所以这里必须问一次 rustc 当前的三元组，不能写死。
#
# ⚠️ 这一步产出的二进制会**跟主程序一起被签名和公证**（macOS）。手工塞一个进去而不走这个
# 脚本，装机后会因为签名不完整而起不来。
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
triple="$(rustc -vV | awk '/^host:/{print $2}')"
ext=""
case "$triple" in *windows*) ext=".exe";; esac

echo "building spool-ai for $triple"
cargo build --release --manifest-path "$here/src-tauri/sidecar/Cargo.toml"

mkdir -p "$here/src-tauri/binaries"
cp "$here/src-tauri/sidecar/target/release/spool-ai$ext" \
   "$here/src-tauri/binaries/spool-ai-$triple$ext"
echo "→ src-tauri/binaries/spool-ai-$triple$ext"
