# SA-C's audio helper: compiles Interop.cs and Helper.cs (Windows Core Audio through COM) and runs
# it. The plugin starts it once and talks to it with JSON lines over stdin/stdout (see Helper.cs).
#   powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File sac-audio.ps1
$ErrorActionPreference = 'Stop'
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'Interop.cs'), (Join-Path $PSScriptRoot 'Helper.cs')
} catch {
    [Console]::Out.Write('{"t":"error","message":"compile failed: ' + ($_.Exception.Message -replace '["\\\r\n]', ' ') + '"}' + "`n")
    exit 1
}
[SacAudio.Helper]::Run()
