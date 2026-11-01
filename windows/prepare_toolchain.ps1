param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$toolchain = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $toolchain -Force | Out-Null

function Get-VerifiedFile([string]$Name,[string]$Url,[string]$Sha256) {
    $target = Join-Path $toolchain $Name
    if (-not (Test-Path -LiteralPath $target)) {
        $temporary = Join-Path $toolchain ([Guid]::NewGuid().ToString('N') + '.download')
        Invoke-WebRequest -Uri $Url -OutFile $temporary
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256) {
            throw "Downloaded file has an unexpected SHA-256: $Name"
        }
        Move-Item -LiteralPath $temporary -Destination $target
    }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256) {
        throw "Existing file has an unexpected SHA-256: $Name"
    }
    return $target
}

$pythonPackage = Get-VerifiedFile 'python.3.14.10.nupkg' 'https://api.nuget.org/v3-flatcontainer/python/3.14.10/python.3.14.10.nupkg' 'f54ba67c9951c3d773ea47d2bb095150c037c399f0423a968bcda22809241784'
$innoInstaller = Get-VerifiedFile 'innosetup-7.1.1-x64.exe' 'https://github.com/jrsoftware/issrc/releases/download/is-7_1_1/innosetup-7.1.1-x64.exe' '8a5a6711c3766a6e5fb74f280ba0e3551e719ce94538d901fdbd1f8f9920b3f0'
$pythonRoot = Join-Path $toolchain 'cpython-3.14.10'
if (-not (Test-Path -LiteralPath $pythonRoot)) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($pythonPackage,$pythonRoot)
}
$privatePython = Join-Path $pythonRoot 'tools\python.exe'
foreach ($executable in @($privatePython,$innoInstaller)) {
    $signature = Get-AuthenticodeSignature -LiteralPath $executable
    if ($signature.Status -ne 'Valid') { throw "The official tool's signature is not valid: $executable" }
}
$innoRoot = Join-Path $toolchain 'inno7'
$compiler = Join-Path $innoRoot 'ISCC.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $arguments = @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/CURRENTUSER','/PORTABLE=1','/NOICONS',('/DIR="'+$innoRoot+'"'))
    $process = Start-Process -FilePath $innoInstaller -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Portable compiler setup failed: $($process.ExitCode)" }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while (-not (Test-Path -LiteralPath $compiler) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200 }
}
if (-not (Test-Path -LiteralPath $compiler)) { throw 'ISCC.exe was not installed.' }
[pscustomobject]@{
    Runtime = Join-Path $pythonRoot 'tools'
    Compiler = $compiler
    Csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    PythonPackageSha256 = 'f54ba67c9951c3d773ea47d2bb095150c037c399f0423a968bcda22809241784'
} | ConvertTo-Json
