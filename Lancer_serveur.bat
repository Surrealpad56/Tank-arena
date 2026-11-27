@echo off
chcp 65001 >nul
title Tank Arena - serveur
cd /d "%~dp0"
set "NODE=%~dp0node\node.exe"
if not exist "%NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js est introuvable : decompressez la version portable dans un dossier "node" a cote de ce fichier,
    echo ou installez-le depuis https://nodejs.org
    pause & exit /b 1
  )
  set "NODE=node"
)
"%NODE%" "%~dp0server.js"
pause
