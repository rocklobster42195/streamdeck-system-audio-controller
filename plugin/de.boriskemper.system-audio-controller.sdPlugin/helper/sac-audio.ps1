# SA-C's audio helper: compiles CoreAudio.cs (Windows Core Audio through COM) and runs it. The
# plugin starts it once and talks to it with JSON lines over stdin/stdout (see CoreAudio.cs).
#   powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File sac-audio.ps1
$ErrorActionPreference = 'Stop'
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'CoreAudio.cs')
} catch {
    [Console]::Out.Write('{"t":"error","message":"compile failed"}' + "`n")
    exit 1
}
[SacAudio.Helper]::Run()
