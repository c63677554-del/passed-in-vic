// Headless Chrome CDP screenshot rig (no deps; Node >= 22 for global WebSocket/fetch).
// Usage: node shot.js <url> <outfile.jpeg> [timeoutMs] [settleMs]
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const url = process.argv[2];
const outfile = process.argv[3];
const timeoutMs = +(process.argv[4] || 60000);
const settleMs = +(process.argv[5] || 4000);
const opt = a => (a && a !== "-" ? a : null);
const postJsFile = opt(process.argv[6]);
const DSF = +(process.argv[7] || 2);
const QUALITY = +(process.argv[8] || 88);
const readyExprFile = opt(process.argv[9]);
const VW = +(process.argv[11] || 1600);
const VH = +(process.argv[12] || 900);
const PORT = 9333;
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE = path.join(__dirname, process.argv[10] || "hchrome-profile");

const READY = readyExprFile ? fs.readFileSync(readyExprFile, "utf8") : `(() => { try {
  if (typeof map === "undefined") return "no-map";
  let gl = null; map.eachLayer(l => { if (l._glMap) gl = l._glMap; });
  const pins = document.querySelectorAll(".leaflet-marker-icon").length;
  if (!gl) return "no-gl";
  if (!gl.isStyleLoaded()) return "style-loading";
  if (!gl.areTilesLoaded()) return "tiles-loading";
  if (pins < 10) return "pins:" + pins;
  return "READY";
} catch (e) { return "err:" + e.message; } })()`;

let msgId = 0;
const pending = new Map();
function send(ws, method, params, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("cdp timeout: " + method)); } }, 30000);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const chrome = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + PROFILE, "--window-size=1600,900",
    "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "about:blank",
  ], { stdio: "ignore" });
  const kill = () => { try { chrome.kill(); } catch (e) {} };
  process.on("exit", kill);

  let info = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try { info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch (e) {}
  }
  if (!info) { console.error("chrome devtools never came up"); process.exit(1); }

  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };

  const { targetId } = await send(ws, "Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send(ws, "Target.attachToTarget", { targetId, flatten: true });
  const S = (method, params) => send(ws, method, params, sessionId);

  await S("Page.enable");
  await S("Runtime.enable");
  await S("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: DSF, mobile: VW < 700 });
  await S("Page.navigate", { url });

  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < timeoutMs) {
    await sleep(700);
    try {
      const r = await S("Runtime.evaluate", { expression: READY, returnByValue: true });
      last = r.result && r.result.value;
      if (last === "READY") break;
    } catch (e) { last = "eval-err " + e.message; }
  }
  console.log("ready state:", last, "after", Date.now() - t0, "ms");
  if (postJsFile) {
    const post = fs.readFileSync(postJsFile, "utf8");
    const pr = await S("Runtime.evaluate", { expression: post, returnByValue: true });
    console.log("postJs:", pr.result && pr.result.value);
  }
  await sleep(settleMs);

  const shot = await S("Page.captureScreenshot", { format: "jpeg", quality: QUALITY });
  fs.writeFileSync(outfile, Buffer.from(shot.data, "base64"));
  console.log("wrote", outfile, fs.statSync(outfile).size, "bytes");
  kill();
  process.exit(last === "READY" ? 0 : 2);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
