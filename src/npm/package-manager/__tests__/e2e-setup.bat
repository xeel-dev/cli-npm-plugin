@echo off
REM This script is used to setup the environment for the e2e tests.
REM It is run before the tests are executed.
REM It will install the package manager for the tests.

REM Get the current script directory
set SCRIPT_DIR=%~dp0
echo Script directory: %SCRIPT_DIR%

REM For each package manager, cd into the directory, and run the corepack install command.
setlocal
set PACKAGE_MANAGERS=npm yarn pnpm
for %%p in (%PACKAGE_MANAGERS%) do (
  echo Processing %%p
  cd /d "%SCRIPT_DIR%%%p\test-project"
  if errorlevel 1 (
    echo Failed to change directory to %SCRIPT_DIR%%%p\test-project
    exit /b 1
  )
  echo Running corepack enable in %cd%
  call corepack enable
   if errorlevel 1 (
    echo Failed to run corepack enable
    exit /b 1
  )
  echo Running %%p install in %cd%
  call %%p install
  if errorlevel 1 (
    echo Failed to run %%p install
    exit /b 1
  )
  cd /d "%SCRIPT_DIR%"
)
endlocal