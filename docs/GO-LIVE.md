# Go live: flip Passd from free site to gated product

Everything is built and committed. The flip needs two values only you can mint
(≈3 minutes in the Supabase dashboard), then one command runs the entire deploy.

## 1. Create the dedicated Supabase project (~2 min)
1. https://supabase.com/dashboard → **New project**
   - Organisation: yours · Name: **passd** · Region: **Sydney (ap-southeast-2)**
   - Database password: generate + save anywhere (you rarely need it again).
   - ⚠️ This must be a **new project** — never the Fireplace one (separate products, separate users).
2. When it finishes provisioning, copy the **Project ref** (Settings → General,
   the short id like `abcdefghijkl` — also visible in the URL).

## 2. Create a personal access token (~1 min)
https://supabase.com/dashboard/account/tokens → **Generate new token**
(name it `passd-deploy`) → copy the `sbp_...` value.

## 3. Write the env file
Create `C:\Users\Nzcof\passed-in-vic\.passd-backend.env` (gitignored) containing:
```
SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxx
SUPABASE_PROJECT_REF=abcdefghijkl
```

## 4. Run the deploy
```powershell
cd C:\Users\Nzcof\passed-in-vic
.\scripts\deploy-backend.ps1
```
It links the project, applies the schema, deploys the four edge functions,
uploads the current dataset, writes `config.js` (flipping the live site to
gated mode), retires the public data files, registers a Wednesday keep-alive
ping (free projects pause after 7 idle days), and pushes.

**Result:** signed-out visitors see the landing page; signing in (email
magic-link/code) shows the free teaser (latest week, no guides); "Start 7-day
free trial" grants a **preview trial** (no payment yet) that unlocks everything.

## 5. Real payments
Follow **docs/SETUP-STRIPE.md** (activate the FoundersCard deal first), add the
four `STRIPE_*` lines to the env file, rerun `.\scripts\deploy-backend.ps1`.
Preview grants switch off; the trial button now goes through Stripe Checkout.

## Notes & limits
- **Sign-in is email + password** (since 10 Jul 2026): auto-confirm is enabled via
  the Management API, so signup and sign-in send **no emails at all** — the free
  tier's few-per-hour email rate limit only touches the rare "forgot password" flow.
  For reliable reset emails at scale, add custom SMTP later (Supabase → Auth → SMTP;
  Resend's free tier works).
- **Google one-tap sign-in (optional, ~10 min)**: Google Cloud Console → create an
  OAuth client (Web application) with authorised redirect URI
  `https://fpxlerpmbsqdwlrgnxsq.supabase.co/auth/v1/callback` → paste the client ID
  + secret into Supabase dashboard → Authentication → Providers → Google → then set
  `enableGoogle: true` in `config.js` and push. The button is already in the UI, hidden
  until that flag flips.
- **Existing shared links** keep working — they land on the landing page, which
  is the funnel working as intended.
- **Mobile apps** (parked repo `passd-mobile`): when revived, point them at
  `https://<ref>.supabase.co/functions/v1/get-data` with the user's session token.
- **Weekly pipeline**: unchanged Sundays 8:30pm; once the env file exists it
  also uploads to Supabase, and after the flip the public repo no longer
  receives the dataset.
