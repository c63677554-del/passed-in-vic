# run-check-listings.ps1 - laptop-side listing-status refresh with catch-up.
#
# The status check must run from a residential IP (Domain serves its listing
# pages only to residential connections; see scripts/check-listings.js). So it
# runs here, not in the cloud cron. To make sure a week is never silently
# skipped when the laptop is off, the "Passd listing status" scheduled task has
# TWO triggers - a weekly run AND an at-startup run - both calling this wrapper.
# A staleness guard means the startup run only does work if the weekly run was
# missed, so normal daily boots don't re-run it.
$ErrorActionPreference = "Continue"
$repo = "C:\Users\Nzcof\passed-in-vic"
$log = Join-Path $repo "refresh.log"
$marker = Join-Path $repo "check-listings.last"   # ISO timestamp of last sweep
Set-Location $repo
function Log($m) { "$(Get-Date -Format s)  [status] $m" | Add-Content $log }

$force = $args -contains "-Force"
$staleDays = 5
$last = [datetime]::MinValue
if (Test-Path $marker) { try { $last = [datetime]::Parse((Get-Content $marker -Raw).Trim()) } catch {} }
$age = (New-TimeSpan -Start $last -End (Get-Date)).TotalDays

if (-not $force -and $age -lt $staleDays) { Log ("skip - last sweep {0:N1}d ago (< {1}d)" -f $age, $staleDays); exit 0 }

Log ("start - last sweep {0:N1}d ago; full sweep" -f $age)
# Big batch = one comprehensive weekly pass over all checkable listings. Terminal
# rows (sold/removed) are skipped inside the script, so the set shrinks over time.
node scripts/check-listings.js --batch=1500 2>&1 | Add-Content $log
if ($LASTEXITCODE -eq 0) {
  (Get-Date -Format o) | Set-Content -Path $marker -Encoding ascii
  Log "done"
} else {
  Log "check-listings exited $LASTEXITCODE - marker not advanced, will retry"
}
