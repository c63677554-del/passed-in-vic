"use strict";

/* auth.js - Passd's authentication + subscription gate.

   The site is ALWAYS gated: signed-out visitors see the landing page; signed-in
   users get the teaser (latest week, no guides) or, with an active
   trial/subscription, the full dataset - enforced SERVER-SIDE by get-data.

   There used to be a second "legacy" mode here, taken whenever config.js was
   empty, which served a bundled data.js with no landing page and no sign-in.
   That bundled dataset no longer exists, so the branch had become a way for a
   broken or half-deployed config.js to quietly serve an UNGATED, EMPTY app -
   failing open on the paywall in the one situation nobody would be watching.
   A missing config is now a loud error instead. */

const PassdGate = (() => {
  const cfg = window.PASSD_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
  const fn = (name) => cfg.supabaseUrl.replace(/\/$/, "") + "/functions/v1/" + name;

  const state = { tier: "gated", session: null, generated: null, weeksAvailable: null, trialEnd: null, lapsed: false };

  // Stripe subscription statuses meaning "this person had access and lost it".
  // These get the full-screen block; someone who never subscribed gets the teaser.
  const LAPSED_STATUSES = new Set(["canceled", "past_due", "unpaid", "incomplete_expired"]);
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
  function authErr(msg, id, ok) { const e = $(id || "authError"); if (!e) return; e.hidden = !msg; e.textContent = msg || ""; e.classList.toggle("ok", !!ok); }
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
          if (/already registered/i.test(error.message)) { setAuthMode("signin"); authErr("That email already has an account. Sign in instead."); }
          else authErr(error.message);
        } // success -> SIGNED_IN listener reloads into the app
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) authErr(/invalid/i.test(error.message) ? "Wrong email or password. New here? Tap Create account." : error.message);
      }
    } catch { authErr("Couldn't reach the server. Try again."); }
    btn.disabled = false; btn.textContent = was;
  }
  async function forgotPw() {
    const email = ($("authEmail").value || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authErr("Type your email above first, then tap Forgot password.");
    const btn = $("authForgot");
    btn.disabled = true; btn.textContent = "Sending…";
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) {
      authErr(/rate/i.test(error.message) ? "Too many emails just now. Try again in a few minutes." : error.message);
      btn.disabled = false; btn.textContent = "Forgot password?";
    } else {
      authErr("Reset link sent to " + email + ". Tap it and you'll be asked to set a new password.", null, true);
      btn.textContent = "Sent ✓";
      setTimeout(() => { btn.disabled = false; btn.textContent = "Forgot password?"; }, 30000);
    }
  }
  async function saveNewPassword() {
    const pw = $("recoverPassword").value || "";
    if (pw.length < 8) return authErr("Password needs at least 8 characters.", "recoverError");
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) return authErr(error.message, "recoverError");
    closeModal("recoverModal");
    toastMsg("Password updated. You're signed in");
    setTimeout(() => location.reload(), 700);
  }
  async function googleSignIn() {
    try {
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
      if (error) authErr("Google sign-in isn't enabled yet. Use email and password.");
    } catch { authErr("Google sign-in isn't enabled yet. Use email and password."); }
  }

  // ---------- subscribe ----------
  let plan = "annual";
  // null = not asked yet. One trial exists per real inbox (Gmail dots and +tags
  // collapse to one identity), so someone who already used theirs is charged on
  // day one. The copy has to say that BEFORE the redirect, not leave Stripe's
  // checkout page to break the news.
  let trialEligible = null;
  async function refreshTrialEligibility() {
    if (!state.session) return;
    try {
      const r = await fetch(fn("create-checkout"), {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.supabaseKey, Authorization: "Bearer " + state.session.access_token },
        body: JSON.stringify({ probe: true }),
      });
      const body = await r.json();
      if (typeof body.trialEligible === "boolean") { trialEligible = body.trialEligible; renderPlans(); }
    } catch { /* leave copy as-is rather than showing a wrong, more generous claim */ }
  }
  function renderPlans() {
    document.querySelectorAll("#subModal .plan").forEach((b) => {
      b.classList.toggle("on", b.dataset.plan === plan);
      b.setAttribute("aria-checked", String(b.dataset.plan === plan));
    });
    const price = plan === "annual" ? "A$39.99/year" : "A$4.99/month";
    const t = $("subTerms");
    const cta = $("subCta");
    if (trialEligible === false) {
      // Known repeat: no trial. Say so plainly and drop the "free" promise.
      if (t) t.textContent = `You've already used your free trial, so this starts today at ${price}. Cancel anytime.`;
      if (cta) cta.textContent = `Subscribe ${plan === "annual" ? "A$39.99/yr" : "A$4.99/mo"}`;
    } else {
      const d = new Date(Date.now() + 7 * 864e5).toLocaleDateString("en-AU", { day: "numeric", month: "long" });
      if (t) t.textContent = `Free for 7 days, then ${price}. You won't be charged before ${d}. Cancel anytime.`;
      if (cta) cta.textContent = "Subscribe, first 7 days free";
    }
  }
  async function startCheckout(ev) {
    if (!state.session) { closeModal("subModal"); openModal("authModal"); return; }
    // Works from either the subscribe modal or the lapsed gate.
    const btn = (ev && ev.currentTarget) || $("subCta");
    const was = btn.textContent;
    btn.disabled = true; btn.textContent = "Opening secure checkout…";
    try {
      const r = await fetch(fn("create-checkout"), {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.supabaseKey, Authorization: "Bearer " + state.session.access_token },
        body: JSON.stringify({ plan, returnUrl: location.origin + location.pathname }),
      });
      const body = await r.json();
      if (body.url) { location.href = body.url; return; }
      // No preview-grant branch: create-checkout now returns a 503 rather than
      // granting free access when Stripe config is missing, so a broken payment
      // setup surfaces as an error instead of silently giving the product away.
      toastMsg(body.error || "Couldn't start checkout");
    } catch { toastMsg("Couldn't reach the server. Try again"); }
    btn.disabled = false; btn.textContent = was;
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
        if (state.tier !== "pro") { openModal("subModal"); toastMsg("Nothing to manage yet. Start your free trial first"); }
        else toastMsg(body.devGrant ? "Preview trial. Billing opens once a real subscription exists" : "No billing on file yet");
      }
      else toastMsg(body.error || "Couldn't open billing");
    } catch { toastMsg("Couldn't reach the server"); }
  }

  // ---------- modals ----------
  // These are plain divs carrying role="dialog" aria-modal="true", not <dialog>,
  // so no modal semantics come for free. Before this, focus stayed on <body> when
  // a modal opened, Tab walked straight into the page behind it (356 of 360
  // tabbable elements were outside the modal), Escape did nothing, and the
  // background scrolled. aria-modal="true" was therefore telling screen readers
  // the background was inert while it was fully reachable.
  //
  // `inert` does the real work: it removes the background from the tab order AND
  // the accessibility tree. The Tab wrap is a fallback for browsers without it,
  // and keeps focus cycling inside the dialog either way.
  const BACKDROP = ["landing", "app"]; // everything that sits behind a modal
  const openStack = [];

  const focusables = (root) =>
    [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((e) => e.offsetParent !== null);

  function setBackdropInert(on) {
    BACKDROP.forEach((id) => { const e = $(id); if (e) e.inert = on; });
    document.body.style.overflow = on ? "hidden" : "";
  }

  // dismissible=false is the lapsed gate: Escape must not free it, but focus
  // still has to stay inside - which is what actually makes it non-dismissible
  // for keyboard users, who could previously just Tab past it into the app.
  function enterModal(m, dismissible) {
    if (!m || openStack.some((x) => x.el === m)) return;
    openStack.push({ el: m, dismissible, restore: document.activeElement });
    setBackdropInert(true);
    const f = focusables(m);
    if (f.length) f[0].focus();
    else { m.setAttribute("tabindex", "-1"); m.focus(); }
  }
  function exitModal(m) {
    const i = openStack.findIndex((x) => x.el === m);
    if (i < 0) return;
    const [entry] = openStack.splice(i, 1);
    if (!openStack.length) setBackdropInert(false);
    try { entry.restore && entry.restore.focus && entry.restore.focus(); } catch {}
  }

  document.addEventListener("keydown", (e) => {
    const top = openStack[openStack.length - 1];
    if (!top) return;
    if (e.key === "Escape" && top.dismissible) { e.preventDefault(); closeModal(top.el.id); return; }
    if (e.key !== "Tab") return;
    const f = focusables(top.el);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (!top.el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function openModal(id, dismissible = true) {
    const m = $(id);
    if (!m) return;
    m.hidden = false;
    // Ask the server whether the free week is actually available before the
    // subscribe copy is read, so the offer on screen is the offer they get.
    if (id === "subModal") refreshTrialEligibility();
    requestAnimationFrame(() => m.classList.add("open"));
    enterModal(m, dismissible);
  }
  function closeModal(id) {
    const m = $(id);
    if (!m) return;
    exitModal(m);
    m.classList.remove("open");
    setTimeout(() => (m.hidden = true), 180);
  }

  // ---------- header account UI ----------
  function renderHeader() {
    if (!configured) return;
    show("signInBtn", !state.session);
    show("acctWrap", !!state.session);
    if (state.session) {
      $("acctEmail").textContent = state.session.user.email;
      const s = $("acctStatus");
      if (state.tier === "pro") s.textContent = state.trialEnd ? "Trial ends " + new Date(state.trialEnd).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "Subscribed";
      else s.textContent = "Free preview";
    }
    let dismissed = false;
    try { dismissed = sessionStorage.getItem("passd_teaser_dismissed") === "1"; } catch { /* private mode */ }
    show("teaser", !!state.session && state.tier !== "pro" && !dismissed);
    if (state.weeksAvailable > 1) { const n = $("teaserWeeks"); if (n) n.textContent = state.weeksAvailable; }
  }

  // Full-screen, non-dismissible block for a lapsed trial/subscription.
  function showLapsedGate(status) {
    const msg = $("lapsedMsg");
    if (msg) {
      msg.textContent = status === "past_due" || status === "unpaid"
        ? "We couldn't take your last payment, so full results are locked. Update your card to restore access to all reported pass-ins, price guides and direct listing links."
        : "Your free trial has finished, so full results are locked. Subscribe to get all reported pass-ins, price guides and direct listing links back.";
    }
    show("lapsedGate", true);
    show("teaser", false); // the gate supersedes the upgrade banner; avoids a flash of both
    // Non-dismissible: traps focus so the block holds for keyboard users too.
    enterModal($("lapsedGate"), false);
    document.querySelectorAll("#lapsedGate .land-plan").forEach((b) => {
      b.classList.toggle("on", b.dataset.plan === plan);
      b.setAttribute("aria-checked", String(b.dataset.plan === plan));
    });
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
    // The teaser costs ~40px of a phone screen that only fits a few cards. It is
    // a nudge, not a gate, so it can be dismissed for the session; it returns on
    // the next visit and the upgrade path stays in the account menu regardless.
    on("teaserDismiss", () => {
      const t = $("teaser"); if (t) t.hidden = true;
      try { sessionStorage.setItem("passd_teaser_dismissed", "1"); } catch { /* private mode */ }
    });
    // Lapsed gate: checkout directly (no dismissible modal in front of the block).
    on("lapsedCta", startCheckout);
    on("lapsedPortal", openPortal);
    on("lapsedSignOut", async () => { await sb.auth.signOut(); location.reload(); });
    document.querySelectorAll("#lapsedGate .land-plan").forEach((b) =>
      b.addEventListener("click", () => {
        plan = b.dataset.plan;
        document.querySelectorAll("#lapsedGate .land-plan").forEach((x) => {
          x.classList.toggle("on", x.dataset.plan === plan);
          x.setAttribute("aria-checked", String(x.dataset.plan === plan));
        });
        renderPlans();
      }));
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
      // Fail loudly and show nothing rather than rendering an ungated empty app.
      throw new Error("Passd config missing: supabaseUrl/supabaseKey are not set, or supabase-js failed to load.");
    }
    wire();
    // Sign-ins land here from any path (password, reset link, another tab -
    // sessions sync via shared storage): reload this tab into the signed-in app.
    sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") { closeModal("authModal"); openModal("recoverModal"); return; }
      if (event === "SIGNED_IN" && !state.session && !location.hash.includes("type=recovery")) location.reload();
    });
    const { data } = await sb.auth.getSession();
    state.session = data?.session || null;

    if (!state.session) {
      // Signed out: landing page only - app never boots, data never ships.
      show("landing", true); show("app", false);
      renderHeader();
      return null;
    }

    show("landing", false); show("app", true);
    let payload;
    try { payload = await fetchData(); }
    catch { toastMsg("Couldn't load data. Refresh to retry"); payload = { tier: "free", properties: [], generated: null }; }
    state.tier = payload.tier === "pro" ? "pro" : "free";
    state.weeksAvailable = payload.weeksAvailable || null;
    try {
      const { data: subRow } = await sb.from("subscribers").select("current_period_end,status,dev_grant").eq("user_id", state.session.user.id).maybeSingle();
      if (subRow && (subRow.status === "trialing" || subRow.dev_grant)) state.trialEnd = subRow.current_period_end;
      // Had access, lost it -> hard block. Never subscribed -> teaser (the funnel).
      // Entitlement itself is enforced server-side; this only picks the UI.
      if (state.tier !== "pro" && subRow && LAPSED_STATUSES.has(subRow.status)) {
        state.lapsed = true;
        showLapsedGate(subRow.status);
      }
    } catch {}
    renderHeader();
    if ((location.hash || "").includes("sub=success")) { toastMsg("Trial started. Welcome to Passd"); history.replaceState(null, "", location.pathname); }
    return { tier: state.tier, properties: payload.properties, generated: payload.generated };
  }

  // openModal/closeModal are shared with app.js so the saved-homes panel gets the
  // same focus trap, Escape handling and background inerting as the other modals.
  return { ready, configured, get tier() { return state.tier; }, subscribeModal: () => openModal("subModal"), openModal, closeModal };
})();
window.PassdGate = PassdGate;
