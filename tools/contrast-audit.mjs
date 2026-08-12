// WCAG 2.1 contrast audit for the shipped "Signal" palette.
//
// Run: node tools/contrast-audit.mjs   (exits non-zero if anything fails)
//
// This exists because DESIGN.md's stated figures have been wrong in every
// revision of this design system so far, and the failing token has each time
// been assigned to real information rather than decoration. Measure, don't
// trust. Pairs marked "spec" are DESIGN.md's own claims; "impl" are pairs the
// implementation introduced.
const hex = (h) => { h = h.replace('#',''); if (h.length===3) h = [...h].map(c=>c+c).join(''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); };
const lin = (c) => { c/=255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
const lum = (h) => { const [r,g,b] = hex(h).map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
// Flatten a translucent colour over a backdrop before measuring.
const over = (fg, alpha, bg) => { const a=hex(fg), b=hex(bg); return '#'+a.map((v,i)=>Math.round(v*alpha + b[i]*(1-alpha)).toString(16).padStart(2,'0')).join(''); };
const ratio = (a, b) => { const [l1,l2] = [lum(a), lum(b)].sort((x,y)=>y-x); return (l1+0.05)/(l2+0.05); };

// Shipped tokens. Four differ deliberately from DESIGN.md ss1 - see the header
// comment in styles.css and the correction note in DESIGN.md.
const T = {
  white:'#FFFFFF', bg:'#F2F2F0', line:'#DCDCDC', lineSoft:'#E4E4E4',
  black:'#0A0A0A', grey:'#5E5E5E', greyMid:'#4A4A4A', greyFaint:'#6E6E6E',
  signal:'#D7F53C', signalDeep:'#657600', link:'#1B34FF',
  mapLand:'#E8E8E4', mapWater:'#DEDEDA', mapRoad:'#FFFFFF', mapLabel:'#616161',
  sold:'#5E5E5E', focus:'#1B34FF',
};

const pairs = [
  // --- DESIGN.md's own claims, re-measured ---
  ['spec', '--black on --signal (spec says 15:1)',        T.black, T.signal, 4.5],
  ['spec', '--link on --white (spec says 8.2:1)',         T.link, T.white, 4.5],
  ['spec', '--grey-mid on --white (body prose)',          T.greyMid, T.white, 4.5],
  ['spec', '--grey on --white (secondary, dates)',        T.grey, T.white, 4.5],

  // --- corrected tokens: these FAILED at the spec's values ---
  ['fixed','--grey-faint on --white (was 3.45 at #8A8A8A)', T.greyFaint, T.white, 4.5],
  ['fixed','--grey-faint on --bg',                        T.greyFaint, T.bg, 4.5],
  ['fixed','--sold on --bg (was 3.08 at #8A8A8A)',        T.sold, T.bg, 4.5],
  ['fixed','--sold on --white',                           T.sold, T.white, 4.5],
  ['fixed','--map-label on --map-land (was 4.15 at #6E6E6E)', T.mapLabel, T.mapLand, 4.5],
  ['fixed','--signal-deep on --white (was 1.99 at #A8C400)', T.signalDeep, T.white, 4.5],

  // --- everything the implementation actually puts on screen ---
  ['impl', '--black on --white (addresses, headings)',    T.black, T.white, 4.5],
  ['impl', '--black on --bg (row hover)',                 T.black, T.bg, 4.5],
  ['impl', '--grey-mid on --bg',                          T.greyMid, T.bg, 4.5],
  ['impl', '--grey on --bg',                              T.grey, T.bg, 4.5],
  ['impl', '--link on --bg (hover row VIEW link)',        T.link, T.bg, 4.5],
  ['impl', '--link on --signal (link on a hovered link)', T.link, T.signal, 4.5],
  ['impl', '--white on --black (active chip, CTA)',       T.white, T.black, 4.5],
  ['impl', '--signal on --black (inverted marker/CTA)',   T.signal, T.black, 4.5],
  ['impl', '--black on --signal (status tag, cluster)',   T.black, T.signal, 4.5],
  ['impl', '--black on --signal (teaser bar)',            T.black, T.signal, 4.5],
  // Map: labels sit on land, on water, and on white road fills.
  ['impl', '--map-label on --map-water',                  T.mapLabel, T.mapWater, 4.5],
  ['impl', '--map-label on --map-road (white halo)',      T.mapLabel, T.mapRoad, 4.5],
  ['impl', '--black on white price block over map',       T.black, T.white, 4.5],
  ['impl', '--sold on --bg (seen/gone price block)',      T.sold, T.bg, 4.5],
  ['impl', 'attribution --grey-faint on --white',         T.greyFaint, T.white, 4.5],
  ['impl', 'attribution link --link on --white',          T.link, T.white, 4.5],
  ['impl', '--black on --bg over map (skeletons)',        T.black, T.bg, 4.5],
  // Landing sits over the hero photo behind a flat veil; measure the veil.
  ['impl', '--black on landing veil over hero',           T.black, over(T.bg, 0.6, T.white), 4.5],
  ['impl', '--grey-mid on landing veil over hero',        T.greyMid, over(T.bg, 0.6, T.white), 4.5],
];

let fails = 0;
console.log('source  ratio  verdict  pair');
for (const [src, name, fg, bg, min] of pairs) {
  const r = ratio(fg, bg);
  const pass = r >= min;
  if (!pass) fails++;
  console.log(`${src.padEnd(6)} ${r.toFixed(2).padStart(6)}  ${(pass ? 'PASS' : 'FAIL').padEnd(7)} ${name}`);
}
console.log(`\n${pairs.length} pairs checked, ${fails} below 4.5:1`);

// --signal must never be used AS TEXT on white - assert the thing the spec warns
// about, so a future edit that tries it fails the audit loudly.
const signalAsText = ratio(T.signal, T.white);
console.log(`\nguard: --signal as text on --white = ${signalAsText.toFixed(2)}:1 (must stay unused as a foreground)`);

process.exit(fails ? 1 : 0);
