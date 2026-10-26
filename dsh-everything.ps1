# dsh-everything - install the whole plugin set into one profile.
#
#   .\dsh-everything.ps1           install into the desktop profile
#   .\dsh-everything.ps1 web       install into another profile by name
#
# Downloads a tarball over HTTPS, so it needs no git.
param([string]$Profile = "desktop")

$ErrorActionPreference = "Stop"
$spec = "https://github.com/Unnidentified/dsh-everything/archive/refs/tags/v1.1.1.tar.gz"

$candidates = @()
$onPath = Get-Command dsh -ErrorAction SilentlyContinue
if ($onPath) { $candidates += $onPath.Source }
$candidates += "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"

$dsh = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $dsh) {
  Write-Error "dsh: launcher not found. Add the CLI to PATH from DeepSeek Harness."
  exit 1
}

Write-Output "profile: $Profile"
Write-Output "source:  $spec"
Write-Output ""

& $dsh plugin --profile $Profile add $spec
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output ""
Write-Output "Done. Quit and reopen DeepSeek Harness."
Write-Output ""
Write-Output "Next:"
Write-Output "  - Settings -> Merge Gateway, paste your key"
Write-Output "  - Settings -> Antigravity, sign in"
Write-Output "  - Packet Tracer needs a Python env; see README.md"
