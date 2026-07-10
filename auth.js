"use strict";

/* auth.js — Passd's authentication + subscription gate.
   Modes:
   - legacy (config empty): resolves immediately with the bundled data.js
     dataset; no landing, no sign-in — the original free site.
   - gated (config set): signed-out visitors see the landing page; signed-in
     users get the teaser (latest week, no guides) or, with an active
     trial/subscription, the full dataset — enforced SERVER-SIDE by get-data. */

const PassdGate = (() => {
  const cfg = window.PASSD_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
  const fn = (name) => cfg.supabaseUrl.replace(/\/$/, "") + "/functions/v1/" + name;

  const state = { tier: "legacy", session: null, generated: null, weeksAvailable: null, trialEnd: null };
  const $ = (id) => document.getElementById(id);
  const show = (id, on) => { const e = $(id); if (e) e.hidden = !on; };

  function toastMsg(m) { if (window.toastFn) window.toastFn(m); else alert(m); }

  // ---------- data ----------
  async function fetchData() {
    const headers = { apikey: cfg.supabaseKey };
    if (state.session) headers["Authorization"] = "Bearer " + state.session.access_token;
    const r = await fetch(fn("get-data"), { headers });
    if (!r.ok) throw new Error("data fetch failed (" + r.status + ")");
    return r.json();
  }

  // ---------- auth (email + password; autoconfirm on, so no emails needed) ----------
  let authMode = "signin";
  function authErr(msg, id) { const e = $(id || "authError"); if (!e) return; e.hidden = !msg; e.textContent = msg || ""; }
  function setAuthMode(m) {
    authMode = m;
    ["tabSignIn", "tabSignUp"].forEach((t) => {
      const on = (t === "tabSignIn") === (m === "signin");
      $(t).classList.toggle("on", on); $(t).setAttribute("aria-selected", String(on));
    });
    $("authSubmit").textContent = m === "signin" ? "Sign in" : "Create account";
    $("authPassword").setAttribute("autocomplete", m === "signin" ? "current-password" : "new-password");
    authErr(null);
  }
  async function submitAuth() {
    const email = ($("authEmail").value || "").trim().toLowerCase();
    const pw = $("authPassword").value || "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authErr("Enter a valid email address.");
    if (pw.length < 8) return authErr("Password needs at least 8 characters.");
    const btn = $("authSubmit"); const was = btn.textContent;
    btn.disabled = true; btn.textContent = authMode === "signin" ? "Signing in…" : "Creating your account…";
    try {
      if (authMode === "signup") {
        const { error } = await sb.auth.signUp({ email, password: pw });
        if (error) {
          if (/already registered/i.test(error.message)) { setAuthMode("signin"); authErr("That email already has an account — sign in instead."); }
          else authErr(error.message);
        } // success -> SIGNED_IN listener reloads into the app
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) authErr(/invalid/i.test(error.message) ? "Wrong email or password. New here? Tap Create account." : error.message);
      }
    } catch { authErr("Couldn't reach the server — try again."); }
    btn.disabled = false; btn.textContent = was;
  }
  async function forgotPw() {
    const email = ($("authEmail").value || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authErr("Type your email above first, then tap Forgot password.");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    authErr(error ? error.message : "Reset link sent — check your email (sending is rate-limited, so it can take a few minutes).");
  }
  async function saveNewPassword() {
    const pw = $("recoverPassword").value || "";
    if (pw.length < 8) return authErr("Password needs at least 8 characters.", "recoverError");
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) return authErr(error.message, "recoverError");
    closeModal("recoverModal");
    toastMsg("Password updated — you're signed in");
    setTimeout(() => location.reload(), 700);
  }
  async function googleSignIn() {
    try {
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
      if (error) authErr("Google sign-in isn't enabled yet — use email and password.");
    } catch { authErr("Google sign-in isn't enabled yet — use email and password."); }
  }

  // ---------- subscribe ----------
  let plan = "annual";
  function renderPlans() {
    document.querySelectorAll("#subModal .plan").forEach((b) => {
      b.classList.toggle("on", b.dataset.plan === plan);
      b.setAttribute("aria-checked", String(b.dataset.plan === plan));
    });
    const d = new Date(Date.now() + 7 * 864e5).toLocaleDateString("en-AU", { day: "numeric", month: "long" });
    const t = $("subTerms");
    if (t) t.textContent = plan === "annual"
      ? `Free for 7 days, then A$39.99/year. You won't be charged before ${d}. Cancel anytime.`
      : `Free for 7 days, then A$4.99/month. You won't be charged before ${d}. Cancel anytime.`;
  }
  async function startCheckout() {
    if (!state.session) { closeModal("subModal"); openModal("authModal"); return; }
    const btn = $("subCta"); btn.disabled = true; btn.textContent = "Starting your free trial…";
    try {
      const r = await fetch(fn("create-checkout"), {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.supabaseKey, Authorization: "Bearer " + state.session.access_token },
        body: JSON.stringify({ plan, returnUrl: location.origin + location.pathname }),
      });
      const body = await r.json();
      if (body.url) { location.href = body.url; return; }
      if (body.preview) { toastMsg("Preview trial started — payments not wired yet"); setTimeout(() => location.reload(), 900); return; }
      toastMsg(body.error || "Couldn't start checkout");
    } catch { toastMsg("Couldn't reach the server — try again"); }
    btn.disabled = false; btn.textContent = "Start 7-day free trial";
  }
  async function openPortal() {
    try {
      const r = await fetch(fn("portal"), {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.supabaseKey, Authorization: "Bearer " + state.session.access_token },
        body: JSON.stringify({ returnUrl: location.origin + location.pathname }),
      });
      const body = await r.json();
      if (body.url) location.href = body.url;
      else if (body.preview) {
        const menu = $("acctMenu"); if (menu) menu.hidden = true;
        if (state.tier !== "pro") { openModal("subModal"); toastMsg("Nothing to manage yet — start your free trial first"); }
        else toastMsg(body.devGrant ? "Preview trial — billing opens once a real subscription exists" : "No billing on file yet");
      }
      else toastMsg(body.error || "Couldn't open billing");
    } catch { toastMsg("Couldn't reach the server"); }
  }

  // ---------- modals ----------
  function openModal(id) { const m = $(id); if (m) { m.hidden = false; requestAnimationFrame(() => m.classList.add("open")); } }
  function closeModal(id) { const m = $(id); if (m) { m.classList.remove("open"); setTimeout(() => (m.hidden = true), 180); } }

  // ---------- header account UI ----------
  function renderHeader() {
    if (!configured) return;
    show("signInBtn", !state.session);
    show("acctWrap", !!state.session);
    if (state.session) {
      $("acctEmail").textContent = state.session.user.email;
      const s = $("acctStatus");
      if (state.tier === "pro") s.textContent = state.trialEnd ? "Trial — ends " + new Date(state.trialEnd).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "Subscribed";
      else s.textContent = "Free preview";
    }
    show("teaser", !!state.session && state.tier !== "pro");
    if (state.weeksAvailable > 1) { const n = $("teaserWeeks"); if (n) n.textContent = state.weeksAvailable; }
  }

  function renderLandPlans() {
    document.querySelectorAll("#landing .land-plan").forEach((b) => {
      b.classList.toggle("on", b.dataset.plan === plan);
      b.setAttribute("aria-checked", String(b.dataset.plan === plan));
    });
  }
  function wire() {
    const on = (id, h) => { const e = $(id); if (e) e.addEventListener("click", h); };
    on("signInBtn", () => openModal("authModal"));
    on("landSignIn", () => openModal("authModal"));
    on("landCta", () => { state.session ? openModal("subModal") : openModal("authModal"); });
    document.querySelectorAll("#landing .land-plan").forEach((b) =>
      b.addEventListener("click", () => {
        plan = b.dataset.plan; renderLandPlans(); renderPlans();
        state.session ? openModal("subModal") : openModal("authModal");
      }));
    on("teaserCta", () => openModal("subModal"));
    on("tabSignIn", () => setAuthMode("signin"));
    on("tabSignUp", () => setAuthMode("signup"));
    on("authSubmit", submitAuth);
    on("authForgot", forgotPw);
    on("googleBtn", googleSignIn);
    on("recoverSubmit", saveNewPassword);
    on("subCta", startCheckout);
    on("acctBtn", () => { const m = $("acctMenu"); m.hidden = !m.hidden; });
    on("acctPortal", openPortal);
    on("acctSignOut", async () => { await sb.auth.signOut(); location.reload(); });
    document.addEventListener("click", (e) => { // close account menu on outside taps
      const m = $("acctMenu");
      if (m && !m.hidden && !e.target.closest("#acctWrap")) m.hidden = true;
    });
    document.querySelectorAll("[data-close-modal]").forEach((el) =>
      el.addEventListener("click", () => closeModal(el.dataset.closeModal)));
    document.querySelectorAll("#subModal .plan").forEach((b) =>
      b.addEventListener("click", () => { plan = b.dataset.plan; renderPlans(); }));
    ["authEmail", "authPassword"].forEach((id) => {
      const el2 = $(id);
      if (el2) el2.addEventListener("keydown", (e) => { if (e.key === "Enter") submitAuth(); });
    });
    const rp = $("recoverPassword");
    if (rp) rp.addEventListener("keydown", (e) => { if (e.key === "Enter") saveNewPassword(); });
    if ((window.PASSD_CONFIG || {}).enableGoogle) show("googleBtn", true);
    renderPlans();
  }

  // ---------- boot ----------
  async function ready() {
    if (!configured) {
      return { tier: "legacy", properties: typeof PASSED_IN !== "undefined" ? PASSED_IN : [], generated: typeof DATA_GENERATED !== "undefined" ? DATA_GENERATED : null };
    }
    wire();
    // Sign-ins land here from any path (password, reset link, another tab —
    // sessions sync via shared storage): reload this tab into the signed-in app.
    sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") { closeModal("authModal"); openModal("recoverModal"); return; }
      if (event === "SIGNED_IN" && !state.session && !location.hash.includes("type=recovery")) location.reload();
    });
    const { data } = await sb.auth.getSession();
    state.session = data?.session || null;

    if (!state.session) {
      // Signed out: landing page only — app never boots, data never ships.
      show("landing", true); show("app", false);
      renderHeader();
      return null;
    }

    show("landing", false); show("app", true);
    let payload;
    try { payload = await fetchData(); }
    catch { toastMsg("Couldn't load data — refresh to retry"); payload = { tier: "free", properties: [], generated: null }; }
    state.tier = payload.tier === "pro" ? "pro" : "free";
    state.weeksAvailable = payload.weeksAvailable || null;
    try {
      const { data: subRow } = await sb.from("subscribers").select("current_period_end,status,dev_grant").eq("user_id", state.session.user.id).maybeSingle();
      if (subRow && (subRow.status === "trialing" || subRow.dev_grant)) state.trialEnd = subRow.current_period_end;
    } catch {}
    renderHeader();
    if ((location.hash || "").includes("sub=success")) { toastMsg("Trial started — welcome to Passd"); history.replaceState(null, "", location.pathname); }
    return { tier: state.tier, properties: payload.properties, generated: payload.generated };
  }

  return { ready, configured, get tier() { return state.tier; }, subscribeModal: () => openModal("subModal") };
})();
window.PassdGate = PassdGate;
