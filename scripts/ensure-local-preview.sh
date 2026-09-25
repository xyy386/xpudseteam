#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preview_url="http://127.0.0.1:5173"
log_file="/private/tmp/research-team-site-local-preview.log"

if curl --connect-timeout 2 --max-time 6 -fsS -o /dev/null "${preview_url}/"; then
  printf '本地预览已运行：%s\n' "${preview_url}"
  exit 0
fi

if lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  printf '5173 端口已有进程，但首页没有正常响应。请检查日志或关闭占用端口的进程。\n' >&2
  exit 1
fi

cd "${project_dir}"
nohup npm run dev -- --host 127.0.0.1 >"${log_file}" 2>&1 </dev/null &
preview_pid=$!
for ((attempt=1; attempt<=30; attempt++)); do
  if curl --connect-timeout 2 --max-time 6 -fsS -o /dev/null "${preview_url}/"; then
    printf '本地预览已启动：%s\n' "${preview_url}"
    printf '运行日志：%s\n' "${log_file}"
    exit 0
  fi
  if ! kill -0 "${preview_pid}" 2>/dev/null; then
    printf '本地预览启动失败，最近日志如下：\n' >&2
    tail -n 30 "${log_file}" >&2
    exit 1
  fi
  sleep 1
done

printf '本地预览启动超时，最近日志如下：\n' >&2
tail -n 30 "${log_file}" >&2
exit 1
