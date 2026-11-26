#!/usr/bin/env sh
# 인프라덱스 시연 모드 (macOS/Linux): 화면을 빌드해 서버 하나(8000번)로 실행
set -e
cd "$(dirname "$0")/frontend" && npm run build
cd ../backend && STATIC_DIR="$(pwd)/../frontend/dist" python3 -m uvicorn app.main:app --port 8000
