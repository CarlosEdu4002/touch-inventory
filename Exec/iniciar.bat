@echo off
setlocal

set "APP_DIR=%~dp0..\Backend\api"
cd /d "%APP_DIR%"

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js nao foi encontrado. Instale o Node.js 22 ou superior.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo Nao foi possivel instalar as dependencias.
        pause
        exit /b 1
    )
)

netstat -ano | findstr ":3000 " >nul
if errorlevel 1 (
    start "Touch Inventory" /b node server.js
) else (
    echo O servidor ja esta rodando na porta 3000.
)

timeout /t 2 >nul
start "" http://localhost:3000
endlocal
