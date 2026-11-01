param(
  [Parameter(Mandatory=$true, Position=0)]
  [ValidateSet('login','upload','download')]
  [string]$Operation,
  [Parameter(Position=1)][string]$Source,
  [Parameter(Position=2)][string]$Destination,
  [string]$Cli
)
$ErrorActionPreference = 'Stop'
$helperPath = Join-Path $PSScriptRoot 'proton_transfer.py'
$helperArguments = @($helperPath, $Operation)
if ($Source) { $helperArguments += $Source }
if ($Destination) { $helperArguments += $Destination }
if ($Cli) { $helperArguments += @('--cli', $Cli) }
$tramaPython = $null
if ($env:TRAMA_APP_ROOT) {
  try {
    $tramaBase = [IO.Path]::GetFullPath($env:TRAMA_APP_ROOT)
    $tramaCandidate = [IO.Path]::GetFullPath((Join-Path $tramaBase '..\runtime\python.exe'))
    if ((Test-Path -LiteralPath (Join-Path $tramaBase 'server.py') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $tramaBase 'launch_trama.py') -PathType Leaf) -and
        (Test-Path -LiteralPath $tramaCandidate -PathType Leaf)) {
      $tramaPython = $tramaCandidate
    }
  } catch {
    # An obsolete/invalid base override must not hide the local installation.
  }
}
if (-not $tramaPython) {
  $tramaCandidate = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\runtime\python.exe'))
  if (Test-Path -LiteralPath $tramaCandidate -PathType Leaf) { $tramaPython = $tramaCandidate }
}
if ($tramaPython) {
  & $tramaPython -E -s -B @helperArguments
  exit $LASTEXITCODE
}
$launcher = Get-Command py -ErrorAction SilentlyContinue
if ($launcher) {
  & $launcher.Source -3 @helperArguments
} else {
  $launcher = Get-Command python -ErrorAction SilentlyContinue
  if (-not $launcher) { throw 'Python não encontrado. Instale Python 3 e tente novamente.' }
  & $launcher.Source @helperArguments
}
exit $LASTEXITCODE
