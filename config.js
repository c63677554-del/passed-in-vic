// Passd runtime config. EMPTY values = the site runs in legacy free mode
// (everything public, data from bundled data.js) — exactly the pre-paywall
// behaviour. scripts/deploy-backend.ps1 fills these when the backend goes live.
window.PASSD_CONFIG = {
  supabaseUrl: "",        // e.g. https://xxxx.supabase.co
  supabaseKey: "",        // the project's publishable (anon) key — safe to ship
};
