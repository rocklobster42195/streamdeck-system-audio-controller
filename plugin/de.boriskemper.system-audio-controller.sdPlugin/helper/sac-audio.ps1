# SA-C's audio helper: compiles Interop.cs, Icons.cs, Calls.cs, Media.cs and Helper.cs (Windows Core Audio
# through COM, media sessions through WinRT) and runs it. The plugin starts it once and talks to it with JSON
# lines over stdin/stdout (see Helper.cs).
#   powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File sac-audio.ps1
# Compiled with the C# compiler directly, not Add-Type: Add-Type can't reference Windows' .winmd files.
# Without them (Windows before 1809), it compiles again without Media.cs.
$ErrorActionPreference = 'Stop'
function Compile([string[]]$files, [string[]]$refs, [string]$options) {
    $p = New-Object System.CodeDom.Compiler.CompilerParameters
    $p.GenerateInMemory = $true
    $p.CompilerOptions = $options
    $p.ReferencedAssemblies.AddRange($refs)
    [string[]]$paths = $files | ForEach-Object { Join-Path $PSScriptRoot $_ }
    (New-Object Microsoft.CSharp.CSharpCodeProvider).CompileAssemblyFromFile($p, $paths)
}
try {
    $fw = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
    $wm = Join-Path $env:windir 'System32\WinMetadata'
    $base = @('System.dll', 'System.Core.dll', 'System.Drawing.dll')
    $winrt = @((Join-Path $fw 'System.Runtime.dll'), (Join-Path $fw 'System.Threading.Tasks.dll'), (Join-Path $wm 'Windows.Foundation.winmd'), (Join-Path $wm 'Windows.Media.winmd'), (Join-Path $wm 'Windows.Storage.winmd'))
    $r = Compile @('Interop.cs', 'Icons.cs', 'Calls.cs', 'Media.cs', 'Helper.cs') ($base + $winrt) ''
    if ($r.Errors.HasErrors) {
        $first = ($r.Errors | Where-Object { -not $_.IsWarning } | Select-Object -First 1).ErrorText
        [Console]::Out.Write('{"t":"error","message":"media unavailable: ' + ($first -replace '["\\\r\n]', ' ') + '"}' + "`n")
        $r = Compile @('Interop.cs', 'Icons.cs', 'Calls.cs', 'Helper.cs') $base '/define:NO_MEDIA'
    }
    if ($r.Errors.HasErrors) { throw (($r.Errors | Where-Object { -not $_.IsWarning } | ForEach-Object { $_.ToString() }) -join ' | ') }
} catch {
    [Console]::Out.Write('{"t":"error","message":"compile failed: ' + ($_.Exception.Message -replace '["\\\r\n]', ' ') + '"}' + "`n")
    exit 1
}
$r.CompiledAssembly.GetType('SacAudio.Helper').GetMethod('Run').Invoke($null, @())
