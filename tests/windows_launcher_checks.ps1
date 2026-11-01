# Reproducible native-launcher checks. Uses only the Windows-provided .NET
# Framework compiler; no downloads, installed Python, tray UI or app server.
param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'These native launcher checks require Windows.' }
$repository = Split-Path $PSScriptRoot -Parent
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw '.NET Framework 4 x64 compiler not found.' }
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $repository ('build\native-launcher-checks-' + [guid]::NewGuid().ToString('N'))
}
$testRoot = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
$source = Join-Path $repository 'windows\TramaLauncher.cs'
$harness = Join-Path $PSScriptRoot 'windows_launcher'
$native = Join-Path $testRoot 'Trama.exe'
$recorder = Join-Path $testRoot 'CaptureArgs.exe'
$tests = Join-Path $testRoot 'LauncherTests.exe'
$references = @('/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll')
& $compiler /nologo /target:winexe /platform:x64 /optimize+ @references "/out:$native" $source
if ($LASTEXITCODE -ne 0) { throw 'Native launcher compile failed.' }
& $compiler /nologo /target:exe /platform:x64 "/out:$recorder" (Join-Path $harness 'CaptureArgs.cs')
if ($LASTEXITCODE -ne 0) { throw 'Argument fixture compile failed.' }
& $compiler /nologo /target:exe /platform:x64 /main:LauncherTests @references /reference:System.Core.dll "/out:$tests" $source (Join-Path $harness 'LauncherTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Test harness compile failed.' }
$fixture = Join-Path $testRoot ('fixture-' + [guid]::NewGuid().ToString('N'))
& $tests $fixture $native $recorder
exit $LASTEXITCODE
