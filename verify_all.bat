@echo off
title TrueForge Task Verifications
set PATH=C:\Python315;C:\Python315\Scripts;%PATH%
cd /d D:\trueFORGE\flask-real

echo ====================================================
echo 1. Task A: get_debug_flag (FLASK_DEBUG=off)
echo ====================================================
set FLASK_DEBUG=off
python -c "from flask.helpers import get_debug_flag; res = get_debug_flag(); print('FLASK_DEBUG=off ->', res); assert res is False, 'Task A failed'"

echo.
echo ====================================================
echo 2. Task B: pytest tests/test_cli.py
echo ====================================================
python -m pytest tests/test_cli.py -q

echo.
echo ====================================================
echo 3. Task B: flask --help (built-in config command)
echo ====================================================
python -m flask --help

echo.
echo ====================================================
echo 4. Task B: flask --app demo_app config (masked JSON)
echo ====================================================
python -m flask --app demo_app config

echo.
echo ====================================================
echo 5. Task C: Workspace Safety and Git Status
echo ====================================================
git status

echo.
echo ====================================================
echo All checks finished!
echo ====================================================
pause
