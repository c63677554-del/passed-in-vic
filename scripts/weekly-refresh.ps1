# weekly-refresh.ps1 - Passd weekly data refresh (Windows Task Scheduler entry point).
# Scrape REIV -> enrich prices/links -> validate -> commit + push (Pages redeploys).
# Registered as scheduled task "Passd weekly refresh" (Sundays 8:30pm, catches up if missed).
$ErrorActionPreference = "Continue"
$repo = "C:\Users\Nzcof\passed-in-vic"
$log = Join-Path $repo "refresh.log"
Set-Location $repo
"=== $(Get-Date -Format s) weekly refresh start ===" | Add-Content $log

git pull --rebase --autostash 2>&1 | Add-Content $log

node scripts/scrape-reiv.js --days=30 --min-rows=15 2>&1 | Add-Content $log
if ($LASTEXITCODE -ne 0) { "ABORT: scrape exited $LASTEXITCODE" | Add-Content $log; exit $LASTEXITCODE }

node scripts/enrich-prices.js 2>&1 | Add-Content $log
if ($LASTEXITCODE -ne 0) { "ABORT: enrich exited $LASTEXITCODE" | Add-Content $log; exit $LASTEXITCODE }

node scripts/validate-data.js 2>&1 | Add-Content $log
if ($LASTEXITCODE -ne 0) { "ABORT: validate exited $LASTEXITCODE" | Add-Content $log; exit $LASTEXITCODE }

git add data.js scripts/geocache.json 2>&1 | Add-Content $log
git -c user.name="passd-refresh" -c user.email="passd-refresh@local" commit -m "chore: weekly refresh ($(Get-Date -Format yyyy-MM-dd))" 2>&1 | Add-Content $log
git push 2>&1 | Add-Content $log
"=== $(Get-Date -Format s) done ===" | Add-Content $log
