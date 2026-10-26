@echo off
rem Run a fight/ pipeline script with the fight project's own Python, from any folder.
rem   fight.cmd tools\youtube_upload.py --auth
rem   fight.cmd publish.py vampire necromancer
pushd "%~dp0fight"
".venv\Scripts\python.exe" %*
set rc=%errorlevel%
popd
exit /b %rc%
