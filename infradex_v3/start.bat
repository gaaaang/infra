@echo off
chcp 65001 >nul
REM 인프라덱스 시연 모드: 화면을 빌드해 서버 하나(8000번)로 실행합니다.
REM 코드를 고치는 중이라면 이 파일 대신 frontend 폴더에서 "npm run dev:all"을 쓰세요.
cd /d %~dp0frontend
echo [1/2] 화면 빌드 중...
call npm run build || goto :error
cd /d %~dp0backend
echo [2/2] 서버 시작: http://localhost:8000  (끄려면 Ctrl+C)
set STATIC_DIR=%~dp0frontend\dist
start "" http://localhost:8000
python -m uvicorn app.main:app --port 8000
goto :eof
:error
echo 빌드에 실패했어요. frontend 폴더에서 npm install을 먼저 실행해 주세요.
pause
