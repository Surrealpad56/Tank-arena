@echo off
title TankArena - tunnel
ssh -o StrictHostKeyChecking=accept-new -R 80:127.0.0.1:3000 nokey@localhost.run
pause