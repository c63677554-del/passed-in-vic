# check-freshness.ps1 - Passd data watchdog. Verifies the LIVE dataset is current
# and SELF-HEALS by re-running the weekly refresh if it has gone stale. Registered
# as "Passd freshness watchdog" (Mon/Tue/Wed mornings) so a failed or missed Sunday
# run is caught and repaired automatically within a day, with no human in the loop.
$ErrorActionPreference = "Continue"
$repo = "C:\Users\Nzcof\passed-in-vic"
$log = Join-Path $repo "refresh.log"
Set-Location $repo
function Log($m) { "$(Get-Date -Format s)  [watchdog] $m" | Add-Content $log }

# What week is actually live for users, per the gated data endpoint?
$live = "unreachable"
try {
  $cfg = Get-Content (Join-Path $repo "config.js") -Raw
  $anon = [regex]::Match($cfg, 'supabaseKey:\s*"([^"]+)"').Groups[1].Value
  $url  = [regex]::Match($cfg, 'supabaseUrl:\s*"([^"]+)"').Groups[1].Value
  $resp = Invoke-RestMethod -Uri "$url/functions/v1/get-data" -Headers @{ apikey = $anon } -TimeoutSec 30
  $live = "$($resp.latestWeek)"
} catch { Log "could not reach get-data: $($_.Exception.Message)" }

$today = (Get-Date).Date
$stale = $true
if ($live -match '^\d{4}-\d{2}-\d{2}$') {
  $ageDays = ($today - [datetime]::ParseExact($live, 'yyyy-MM-dd', $null)).Days
  # A weekend's results should be live by Monday. >8 days old means a week was missed.
  $stale = ($ageDays -gt 8)
  Log "live latestWeek=$live ageDays=$ageDays stale=$stale"
} else {
  Log "live latestWeek unavailable ($live) - treating as stale"
}

if (-not $stale) { Log "fresh - no action needed"; exit 0 }

Log "STALE - self-healing by running weekly-refresh.ps1"
try { & msg.exe * /TIME:60 "Passd data was stale - auto-refreshing now" 2>$null } catch {}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\weekly-refresh.ps1")
Log "self-heal run finished (exit $LASTEXITCODE)"
