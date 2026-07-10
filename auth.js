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

  // ---------- auth ----------
  let pendingEmail = "";
  async function sendLink() {
    const email = ($("authEmail").value || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toastMsg("Enter a valid email"); return; }
    pendingEmail = email;
    $("authSend").disabled = true; $("authSend").textContent = "Sending…";
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    $("authSend").disabled = false; $("authSend").textContent = "Email me a sign-in link";
    if (error) { toastMsg(error.message || "Couldn't send — try again"); return; }
    show("authStep1", false); show("authStep2", true);
    $("authEmailShown").textContent = email;
    $("authOtp").focus();
  }
  async function verifyOtp() {
    const token = ($("authOtp").value || "").trim();
    if (token.length < 6) { toastMsg("Enter the 6-digit code from the email"); return; }
    $("authVerify").disabled = true;
    const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: "email" });
    $("authVerify").disabled = false;
    if (error) { toastMsg("Code didn't match — check the newest email"); return; }
    closeModal("authModal");
    location.reload();
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
      else if (body.preview) toastMsg(body.devGrant ? "Preview trial — billing portal appears once Stripe is live" : "No billing on file yet");
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
    on("authSend", sendLink);
    on("authVerify", verifyOtp);
    on("subCta", startCheckout);
    on("acctBtn", () => { const m = $("acctMenu"); m.hidden = !m.hidden; });
    on("acctPortal", openPortal);
    on("acctSignOut", async () => { await sb.auth.signOut(); location.reload(); });
    document.querySelectorAll("[data-close-modal]").forEach((el) =>
      el.addEventListener("click", () => closeModal(el.dataset.closeModal)));
    document.querySelectorAll("#subModal .plan").forEach((b) =>
      b.addEventListener("click", () => { plan = b.dataset.plan; renderPlans(); }));
    const otp = $("authOtp");
    if (otp) otp.addEventListener("keydown", (e) => { if (e.key === "Enter") verifyOtp(); });
    const em = $("authEmail");
    if (em) em.addEventListener("keydown", (e) => { if (e.key === "Enter") sendLink(); });
    renderPlans();
  }

  // ---------- boot ----------
  async function ready() {
    if (!configured) {
      return { tier: "legacy", properties: typeof PASSED_IN !== "undefined" ? PASSED_IN : [], generated: typeof DATA_GENERATED !== "undefined" ? DATA_GENERATED : null };
    }
    wire();
    // When the emailed link is opened (this tab or any other), the session
    // lands in shared storage — reload this tab into the signed-in app.
    sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN" && !state.session) location.reload(); });
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
