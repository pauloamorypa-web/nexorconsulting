@echo off
rem Demonstracao Nexor (Windows): sobe todos os sistemas com dados ficticios e abre o navegador.
cd /d "%~dp0.."
where node >nul 2>nul || (echo Instale o Node 22 ou mais novo em nodejs.org e rode de novo. & pause & exit /b 1)
node demo\iniciar.mjs %*
pause
