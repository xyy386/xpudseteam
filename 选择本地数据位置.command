#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
selected_path="$(osascript -e 'POSIX path of (choose folder with prompt "选择本地网站内容、图片和附件的存储文件夹")')"
if [[ -z "${selected_path}" ]]; then exit 0; fi
node "${project_dir}/scripts/move-local-data.mjs" "${selected_path}"
printf '\n按回车键关闭窗口…'
read -r
