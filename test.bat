@echo off
chcp 65001 >nul
title Discord Extensions - Unit Tests

echo.
echo ========================================
echo   Discord Extensions Test Suite
echo ========================================
echo.

node --test tests/*.test.js

if %errorlevel% neq 0 (
    echo.
    echo [FAIL] One or more unit tests failed.
    echo.
    exit /b %errorlevel%
)

echo.
echo [OK] All tests passed successfully!
echo.
pause
