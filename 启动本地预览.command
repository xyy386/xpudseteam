#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${project_dir}/scripts/ensure-local-preview.sh"
open "http://localhost:5173"
