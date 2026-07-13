# weekly-refresh.ps1 - Passd weekly data refresh (Windows Task Scheduler entry point).
# Pipeline: scrape REIV + Domain -> enrich (best-effort) -> validate -> upload to
# Supabase -> verify the new week is actually live. Registered as "Passd weekly
# refresh" (Sun 8:30pm). A Mon/Tue/Wed morning watchdog (check-freshness.ps1)
# self-heals a missed or failed run.
#
# DESIGN RULE (from the 12 Jul 2026 outage): ENRICHMENT IS OPTIONAL. Price guides
# are a nice-to-have; the scraped properties (which already carry Domain listing
# links + auction bids) MUST ship even if the soho enrichment step fails. An
# enhancement step must never block the release. That outage happened because a
# crash in enrich aborted the whole pipeline before validate + upload could run.
$ErrorActionPreference = "Continue"
$repo = "C:\Users\Nzcof\passed-in-vic"
$log = Join-Path $repo "refresh.log"
$statusFile = Join-Path $repo "refresh-status.json"
Set-Location $repo

$script:liveLatestWeek = "unknown"
$script:expectedWeek = "unknown"

function Log($m) { "$(Get-Date -Format s)  $m" | Add-Content $log }

function Write-Status($result, $detail) {
  $obj = [ordered]@{
    lastRun        = (Get-Date -Format s)
    result         = $result       # ok | degraded | failed
    detail         = $detail
    expectedWeek   = $script:expectedWeek
    liveLatestWeek = $script:liveLatestWeek
  }
  ($obj | ConvertTo-Json) | Set-Content -Path $statusFile -Encoding utf8
  Log "STATUS: $result - $detail"
}

function Notify($text) {
  # Best-effort desktop alert; msg.exe is absent on some Home editions.
  try { & msg.exe * /TIME:60 "Passd refresh: $text" 2>$null } catch {}
}

# Most recent Saturday on/before today (weeks are keyed by their Saturday).
$today = (Get-Date).Date
$daysSinceSat = ((([int]$today.DayOfWeek) - 6 + 7) % 7)
$script:expectedWeek = $today.AddDays(-$daysSinceSat).ToString("yyyy-MM-dd")

Log "=== weekly refresh start (expecting week $($script:expectedWeek)) ==="
git pull --rebase --autostash 2>&1 | Add-Content $log

# --- Scrape: need at least one source to succeed ---
node scripts/scrape-reiv.js --days=30 --min-rows=15 2>&1 | Add-Content $log
$reivOk = ($LASTEXITCODE -eq 0); Log "scrape-reiv exit $LASTEXITCODE"

node scripts/scrape-domain.js --min-rows=30 2>&1 | Add-Content $log
$domainOk = ($LASTEXITCODE -eq 0); Log "scrape-domain exit $LASTEXITCODE"

if (-not $reivOk -and -not $domainOk) {
  Write-Status "failed" "both scrapers failed - no fresh data; keeping last good upload"
  Notify "both scrapers failed - data NOT refreshed"
  exit 1
}

# --- Enrich: BEST-EFFORT. A failure here must never block the release. ---
node scripts/enrich-prices.js 2>&1 | Add-Content $log
if ($LASTEXITCODE -ne 0) { Log "WARN: enrich exited $LASTEXITCODE - shipping scraped data as-is (Domain links + bids intact)" }

# --- Validate: gate against uploading malformed data ---
node scripts/validate-data.js 2>&1 | Add-Content $log
if ($LASTEXITCODE -ne 0) {
  Write-Status "failed" "validation failed - refusing to upload"
  Notify "validation failed - data NOT refreshed"
  exit 1
}

# --- Upload to Supabase: retry a few times (transient network / cold function) ---
$uploaded = $false
for ($i = 1; $i -le 3; $i++) {
  node scripts/upload-data.js 2>&1 | Add-Content $log
  if ($LASTEXITCODE -eq 0) { $uploaded = $true; break }
  Log "upload attempt $i failed; retrying in 20s"
  Start-Sleep -Seconds 20
}
if (-not $uploaded) {
  Write-Status "failed" "supabase upload failed after 3 attempts"
  Notify "upload failed - data NOT refreshed"
  exit 1
}

# --- Verify the new week is actually live (catches silent no-op uploads) ---
try {
  $cfg = Get-Content (Join-Path $repo "config.js") -Raw
  $anon = [regex]::Match($cfg, 'supabaseKey:\s*"([^"]+)"').Groups[1].Value
  $url = [regex]::Match($cfg, 'supabaseUrl:\s*"([^"]+)"').Groups[1].Value
  $resp = Invoke-RestMethod -Uri "$url/functions/v1/get-data" -Headers @{ apikey = $anon } -TimeoutSec 30
  $script:liveLatestWeek = "$($resp.latestWeek)"
} catch { $script:liveLatestWeek = "unreachable" }

git add scripts/geocache.json 2>&1 | Add-Content $log
git -c user.name="passd-refresh" -c user.email="passd-refresh@local" commit -m "chore: weekly refresh ($(Get-Date -Format yyyy-MM-dd))" 2>&1 | Add-Content $log
git push 2>&1 | Add-Content $log

if ($script:liveLatestWeek -eq $script:expectedWeek) {
  Write-Status "ok" "live week $($script:liveLatestWeek) matches expected"
} else {
  # Not necessarily broken (a genuinely quiet auction weekend can have no new
  # results), but worth surfacing. The watchdog treats >8 days stale as an alert.
  Write-Status "degraded" "live week $($script:liveLatestWeek) != expected $($script:expectedWeek)"
  Notify "live week is $($script:liveLatestWeek), expected $($script:expectedWeek)"
}
Log "=== done ==="
