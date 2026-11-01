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
"%TRAMA_HELPER_PYTHON%" -E -s -B "%~dp0setup_proofreader.py" %*
goto finished
:runnative
"%TRAMA_HELPER_HOST%" --setup-writing %*
exit /b %ERRORLEVEL%
:global_runtime
where py >nul 2>&1
if not errorlevel 1 goto checkpy
goto checkpython
:checkpy
py -3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 goto runpy
:checkpython
where python >nul 2>&1
if errorlevel 1 goto missing
python -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if errorlevel 1 goto missing
python "%~dp0setup_proofreader.py" %*
goto finished
:runpy
py -3 "%~dp0setup_proofreader.py" %*
:finished
set "SETUP_RESULT=%errorlevel%"
pause
exit /b %SETUP_RESULT%
:missing
echo Instale Python 3.10 ou mais recente e tente novamente.
pause
exit /b 1
