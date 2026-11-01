@echo off
setlocal DisableDelayedExpansion
if not defined TRAMA_APP_ROOT goto local_runtime
if not exist "%TRAMA_APP_ROOT%\server.py" goto local_runtime
if exist "%TRAMA_APP_ROOT%\server.py\" goto local_runtime
if not exist "%TRAMA_APP_ROOT%\launch_trama.py" goto local_runtime
if exist "%TRAMA_APP_ROOT%\launch_trama.py\" goto local_runtime
if not exist "%TRAMA_APP_ROOT%\..\runtime\python.exe" goto local_runtime
if exist "%TRAMA_APP_ROOT%\..\runtime\python.exe\" goto local_runtime
set "TRAMA_HELPER_PYTHON=%TRAMA_APP_ROOT%\..\runtime\python.exe"
goto runbundled
:local_runtime
if not exist "%~dp0..\runtime\python.exe" goto global_runtime
if exist "%~dp0..\runtime\python.exe\" goto global_runtime
set "TRAMA_HELPER_PYTHON=%~dp0..\runtime\python.exe"
:runbundled
"%TRAMA_HELPER_PYTHON%" -E -s -B "%~dp0launch_trama.py" %*
goto finished
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
python "%~dp0launch_trama.py" %*
goto finished
:runpy
py -3 "%~dp0launch_trama.py" %*
:finished
set "TRAMA_EXIT_CODE=%ERRORLEVEL%"
if not "%TRAMA_EXIT_CODE%"=="0" pause
exit /b %TRAMA_EXIT_CODE%
:missing
echo Instale Python 3.10 ou mais recente em https://www.python.org/downloads/windows/
echo Depois abra este arquivo novamente. Se usar o instalador classico, habilite Add Python to PATH.
pause
exit /b 1
