@echo off
chcp 65001 >nul
setlocal
title Tank Arena - tunnel Cloudflare
cd /d "%~dp0"
echo.
echo  ==========================================================
echo    TANK ARENA - serveur + lien Internet (Cloudflare, gratuit)
echo  ==========================================================
echo   Aucune installation ni droit administrateur necessaire.
echo.

REM --- 1. Node.js : dossier "node" a cote du jeu (version portable), sinon Node installe ---
set "NODE=%~dp0node\node.exe"
if not exist "%NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo [ERREUR] Node.js est introuvable.
    echo   Telechargez la version "Windows Binary (.zip)" sur https://nodejs.org/en/download
    echo   et decompressez-la dans un dossier nomme "node" a cote de ce fichier
    echo   (on doit y trouver node\node.exe^). Aucune installation n'est necessaire.
    pause & exit /b 1
  )
  set "NODE=node"
)
echo [OK] Node.js : %NODE%

REM --- 2. server.js ---
if not exist "%~dp0server.js" ( echo [ERREUR] server.js introuvable. & pause & exit /b 1 )

REM --- 3. cloudflared : l'un des deux noms, a cote du jeu ---
set "CF="
if exist "%~dp0cloudflared-windows-amd64.exe" set "CF=%~dp0cloudflared-windows-amd64.exe"
if not defined CF if exist "%~dp0cloudflared.exe" set "CF=%~dp0cloudflared.exe"
if not defined CF (
  echo [INFO] cloudflared absent : telechargement...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%~dp0cloudflared.exe'"
  if exist "%~dp0cloudflared.exe" set "CF=%~dp0cloudflared.exe"
)
if not defined CF (
  echo [ERREUR] Impossible d'obtenir cloudflared. Posez cloudflared.exe a cote de ce fichier.
  pause & exit /b 1
)
echo [OK] Cloudflare : %CF%

REM --- 4. Serveur du jeu ---
echo.
start "Tank Arena - serveur (ne pas fermer)" "%NODE%" "%~dp0server.js"
timeout /t 3 /nobreak >nul

REM --- 5. Tunnel ---
echo  Cherchez la ligne  https://xxxx.trycloudflare.com  ci-dessous et envoyez-la a vos amis.
echo  Vous, ouvrez  http://localhost:3000   -   fermez cette fenetre pour couper le tunnel.
echo.
"%CF%" tunnel --no-autoupdate --url http://localhost:3000
echo.
echo Tunnel termine.
pause
