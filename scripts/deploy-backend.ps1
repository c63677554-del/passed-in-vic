# deploy-backend.ps1 — one-command go-live for the Passd paywall backend.
# Prereq (see docs/GO-LIVE.md): .passd-backend.env at the repo root containing
#   SUPABASE_ACCESS_TOKEN=sbp_...      (Account -> Access Tokens)
#   SUPABASE_PROJECT_REF=xxxxxxxxxxxx  (new DEDICATED "passd" project's ref)
# Optional (Stripe live — see docs/SETUP-STRIPE.md):
#   STRIPE_SECRET_KEY=sk_live_...
#   STRIPE_WEBHOOK_SECRET=whsec_...
#   STRIPE_PRICE_MONTHLY=price_...
#   STRIPE_PRICE_ANNUAL=price_...
# What it does: link -> db push -> deploy 4 edge functions -> set secrets ->
# fetch keys -> upload data -> write config.js -> retire public data files ->
# register keep-alive task -> commit + push. Idempotent; rerun after changes.
$ErrorActionPreference = "Stop"
$repo = "C:\Users\Nzcof\passed-in-vic"
Set-Location $repo

# ---- read env ----
$envFile = Join-Path $repo ".passd-backend.env"
if (-not (Test-Path $envFile)) { Write-Error "Missing .passd-backend.env — see docs/GO-LIVE.md"; exit 1 }
$cfg = @{}
Get-Content $envFile | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$') { $cfg[$Matches[1]] = $Matches[2] } }
if (-not $cfg.SUPABASE_ACCESS_TOKEN -or -not $cfg.SUPABASE_PROJECT_REF) { Write-Error "env file needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF"; exit 1 }
$env:SUPABASE_ACCESS_TOKEN = $cfg.SUPABASE_ACCESS_TOKEN
$ref = $cfg.SUPABASE_PROJECT_REF

Write-Host "== Linking project $ref =="
npx supabase link --project-ref $ref

Write-Host "== Applying database migrations =="
npx supabase db push

Write-Host "== Deploying edge functions =="
npx supabase functions deploy get-data --no-verify-jwt --project-ref $ref
npx supabase functions deploy stripe-webhook --no-verify-jwt --project-ref $ref
npx supabase functions deploy create-checkout --project-ref $ref
npx supabase functions deploy portal --project-ref $ref

Write-Host "== Setting function secrets =="
$site = "https://c63677554-del.github.io/passed-in-vic/"
if ($cfg.STRIPE_SECRET_KEY -and $cfg.STRIPE_PRICE_MONTHLY -and $cfg.STRIPE_PRICE_ANNUAL) {
  npx supabase secrets set --project-ref $ref "SITE_URL=$site" "ALLOW_PREVIEW_GRANTS=false" "STRIPE_SECRET_KEY=$($cfg.STRIPE_SECRET_KEY)" "STRIPE_WEBHOOK_SECRET=$($cfg.STRIPE_WEBHOOK_SECRET)" "STRIPE_PRICE_MONTHLY=$($cfg.STRIPE_PRICE_MONTHLY)" "STRIPE_PRICE_ANNUAL=$($cfg.STRIPE_PRICE_ANNUAL)"
  Write-Host "Stripe: LIVE (preview grants disabled)"
} else {
  npx supabase secrets set --project-ref $ref "SITE_URL=$site" "ALLOW_PREVIEW_GRANTS=true"
  Write-Host "Stripe: NOT configured — preview mode (trials granted without payment). Add STRIPE_* to the env file and rerun."
}

Write-Host "== Fetching project keys =="
$keysJson = npx supabase projects api-keys --project-ref $ref -o json | Out-String
$keys = $keysJson | ConvertFrom-Json
$anon = ($keys | Where-Object { $_.name -eq "anon" }).api_key
$service = ($keys | Where-Object { $_.name -eq "service_role" }).api_key
$url = "https://$ref.supabase.co"
if (-not $anon -or -not $service) { Write-Error "Couldn't read API keys"; exit 1 }

# persist url + service key for the weekly uploader
$lines = Get-Content $envFile | Where-Object { $_ -notmatch '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' }
$lines += "SUPABASE_URL=$url"
$lines += "SUPABASE_SERVICE_ROLE_KEY=$service"
Set-Content -Path $envFile -Value $lines -Encoding utf8

Write-Host "== Uploading dataset =="
node scripts/emit-json.js
node scripts/upload-data.js
if ($LASTEXITCODE -ne 0) { Write-Error "data upload failed"; exit 1 }

Write-Host "== Writing config.js (flips the site to gated mode) =="
@"
// Passd runtime config — GATED MODE (written by scripts/deploy-backend.ps1).
window.PASSD_CONFIG = {
  supabaseUrl: "$url",
  supabaseKey: "$anon",
};
"@ | Set-Content -Path (Join-Path $repo "config.js") -Encoding utf8

Write-Host "== Retiring public data files =="
# stop shipping the dataset with the site; keep local generation for uploads
(Get-Content index.html) | Where-Object { $_ -notmatch '<script src="\./data\.js"></script>' } | Set-Content index.html -Encoding utf8
git rm --cached data.js data.json 2>$null | Out-Null
Add-Content .gitignore "`ndata.js`ndata.json"

Write-Host "== Registering keep-alive pings (free tier pauses after 7 idle days) =="
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -Command `"Invoke-WebRequest -UseBasicParsing '$url/functions/v1/get-data' -Headers @{apikey='$anon'} | Out-Null`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Wednesday -At "12:00"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName "Passd keepalive" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host "== Committing the flip =="
git add config.js index.html .gitignore
git commit -m "go live: gated mode (auth + subscriptions via Supabase/Stripe)"
git push

Write-Host ""
Write-Host "DONE. The site is now behind the paywall:"
Write-Host "  - Signed out  -> landing page"
Write-Host "  - Signed in   -> free teaser (latest week, no guides)"
Write-Host "  - Trial/sub   -> everything"
Write-Host "Next: docs/SETUP-STRIPE.md to switch preview trials to real payments."
