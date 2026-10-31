@echo off
setlocal
where py >nul 2>nul
if errorlevel 1 goto use_python
py -3 "%~dp0setup_translation.py" %*
goto finish
:use_python
python "%~dp0setup_translation.py" %*
:finish
set "TRAMA_SETUP_EXIT=%ERRORLEVEL%"
if not "%TRAMA_SETUP_EXIT%"=="0" echo A instalacao nao foi concluida. Confira a mensagem acima.
if "%~1"=="" pause
exit /b %TRAMA_SETUP_EXIT%
