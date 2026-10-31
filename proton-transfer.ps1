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
$launcher = Get-Command py -ErrorAction SilentlyContinue
if ($launcher) {
  & $launcher.Source -3 @helperArguments
} else {
  $launcher = Get-Command python -ErrorAction SilentlyContinue
  if (-not $launcher) { throw 'Python não encontrado. Instale Python 3 e tente novamente.' }
  & $launcher.Source @helperArguments
}
exit $LASTEXITCODE
