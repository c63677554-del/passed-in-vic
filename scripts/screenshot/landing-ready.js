(() => {
  try {
    const land = document.getElementById("landing");
    if (!land) return "no-landing-el";
    if (land.hidden) return "landing-hidden(signed-in?)";
    const heroLoaded = performance.getEntriesByType("resource").some(r => /hero-app\.jpg/.test(r.name) && (r.responseStatus === 200 || r.responseStatus === undefined || r.responseStatus === 0));
    if (!heroLoaded) return "hero-not-loaded";
    const cta = document.getElementById("landCta");
    if (!cta || !cta.offsetParent) return "cta-not-visible";
    return "READY";
  } catch (e) { return "err:" + e.message; }
})()
