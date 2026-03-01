#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
BACKEND_VENV="${BACKEND_DIR}/.venv"
BACKEND_LOG="${ROOT_DIR}/.context/backend-local.log"
BACKEND_URL="http://127.0.0.1:8000"
BACKEND_PID=""
STARTED_BACKEND="false"

mkdir -p "${ROOT_DIR}/.context"

if [[ -z "${VITE_NEMOTRON_API_KEY:-}" ]]; then
  cat <<'EOF'
Missing VITE_NEMOTRON_API_KEY.

Run like this:
  VITE_NEMOTRON_API_KEY='your_nvidia_key' npm run dev:local
EOF
  exit 1
fi

if [[ ! -d "${BACKEND_VENV}" ]]; then
  python3 -m venv "${BACKEND_VENV}"
fi

source "${BACKEND_VENV}/bin/activate"
pip install -q -r "${BACKEND_DIR}/requirements.txt"

export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:5174,http://localhost:5173,http://localhost:3000}"
export VITE_NEMOTRON_API_KEY

port_in_use() {
  lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_backend() {
  local attempts=0
  while [[ ${attempts} -lt 20 ]]; do
    if curl -fsS "${BACKEND_URL}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
    attempts=$((attempts + 1))
  done
  return 1
}

if port_in_use; then
  echo "Backend port 8000 already in use. Reusing existing backend."
  if ! wait_for_backend; then
    echo "Port 8000 is occupied but backend health check failed."
    echo "Stop the conflicting process and run again."
    exit 1
  fi
else
  cd "${BACKEND_DIR}"
  python -m uvicorn server:app --host 127.0.0.1 --port 8000 > "${BACKEND_LOG}" 2>&1 &
  BACKEND_PID=$!
  STARTED_BACKEND="true"
  cd "${ROOT_DIR}"
  if ! wait_for_backend; then
    echo "Backend failed to start. Check log: ${BACKEND_LOG}"
    exit 1
  fi
fi

cleanup() {
  if [[ "${STARTED_BACKEND}" == "true" ]] && [[ -n "${BACKEND_PID}" ]] && ps -p "${BACKEND_PID}" > /dev/null 2>&1; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "Backend ready at ${BACKEND_URL} (log: ${BACKEND_LOG})"

cd "${ROOT_DIR}"
npm run dev
