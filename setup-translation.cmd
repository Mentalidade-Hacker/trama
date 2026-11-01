@echo off
setlocal DisableDelayedExpansion
if not defined TRAMA_APP_ROOT goto local_runtime
if not exist "%TRAMA_APP_ROOT%\server.py" goto local_runtime
if exist "%TRAMA_APP_ROOT%\server.py\" goto local_runtime
if not exist "%TRAMA_APP_ROOT%\launch_trama.py" goto local_runtime
if exist "%TRAMA_APP_ROOT%\launch_trama.py\" goto local_runtime
if not exist "%TRAMA_APP_ROOT%\..\Trama.exe" goto base_runtime
if exist "%TRAMA_APP_ROOT%\..\Trama.exe\" goto base_runtime
set "TRAMA_HELPER_HOST=%TRAMA_APP_ROOT%\..\Trama.exe"
goto runnative
:base_runtime
if not exist "%TRAMA_APP_ROOT%\..\runtime\python.exe" goto local_runtime
if exist "%TRAMA_APP_ROOT%\..\runtime\python.exe\" goto local_runtime
set "TRAMA_HELPER_PYTHON=%TRAMA_APP_ROOT%\..\runtime\python.exe"
goto runbundled
:local_runtime
if not exist "%~dp0server.py" goto local_python
if exist "%~dp0server.py\" goto local_python
if not exist "%~dp0launch_trama.py" goto local_python
if exist "%~dp0launch_trama.py\" goto local_python
if not exist "%~dp0..\Trama.exe" goto local_python
if exist "%~dp0..\Trama.exe\" goto local_python
set "TRAMA_HELPER_HOST=%~dp0..\Trama.exe"
goto runnative
:local_python
if not exist "%~dp0..\runtime\python.exe" goto global_runtime
if exist "%~dp0..\runtime\python.exe\" goto global_runtime
set "TRAMA_HELPER_PYTHON=%~dp0..\runtime\python.exe"
:runbundled
"%TRAMA_HELPER_PYTHON%" -E -s -B "%~dp0setup_translation.py" %*
goto finish
:runnative
"%TRAMA_HELPER_HOST%" --setup-translation %*
exit /b %ERRORLEVEL%
:global_runtime
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
