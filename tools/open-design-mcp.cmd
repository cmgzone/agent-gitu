@echo off
REM MCP stdio launcher for Open Design.
REM The MCP host cannot pass inline env, so the required runtime
REM connection variables are set here before exec-ing the daemon.
setlocal
set "ELECTRON_RUN_AS_NODE=1"
set "OD_DATA_DIR=C:\Users\Admin\AppData\Roaming\Open Design\namespaces\release-stable-win\data"
set "OD_SIDECAR_CLIENT_ENDPOINT=\\.\pipe\open-design-sidecar-b518fd0a73595b8d179474203987b06a"
set "OD_MCP_BOOTSTRAP_COMMAND=C:\Users\Admin\AppData\Local\Programs\Open Design\Open Design.exe"
set "OD_MCP_BOOTSTRAP_ARGS=[\"--headless\"]"
"C:\Users\Admin\AppData\Local\Programs\Open Design\Open Design.exe" "C:\Users\Admin\AppData\Local\Programs\Open Design\resources\app\prebundled\daemon\daemon-cli.mjs" mcp
endlocal
