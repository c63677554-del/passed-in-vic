// WCAG 2.1 contrast audit for the shipped palette. Covers DESIGN.md's stated
// pairs (to confirm they survived implementation) AND the pairs introduced
// during this change, which were never in the spec's table.
const hex = (h) => { h = h.replace('#',''); if (h.length===3) h = [...h].map(c=>c+c).join(''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); };
const lin = (c) => { c/=255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
const lum = (h) => { const [r,g,b] = hex(h).map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
// Flatten a translucent colour over a backdrop before measuring.
const over = (fg, alpha, bg) => { const a=hex(fg), b=hex(bg); return '#'+a.map((v,i)=>Math.round(v*alpha + b[i]*(1-alpha)).toString(16).padStart(2,'0')).join(''); };
const ratio = (a, b) => { const [l1,l2] = [lum(a), lum(b)].sort((x,y)=>y-x); return (l1+0.05)/(l2+0.05); };

const T = {
  bg:'#F4F7F6', surface:'#FFFFFF', sunk:'#EDF2F1', border:'#DDE4E2',
  ink:'#0E1F1C', inkMuted:'#5B6B68', inkSubtle:'#5F6E6C',
  teal:'#0E7C6B', tealDeep:'#0B5F52', tealTint:'#E4FAF2', mint:'#A8F0DC',
  mapBg:'#16302B', mapInk:'#859E98', clusterInk:'#0B3B33',
  warn:'#C2410C', warnTint:'#FDF1EA', sold:'#5B6B68', white:'#FFFFFF',
};

const pairs = [
  ['DESIGN.md', '--teal on --surface',            T.teal, T.surface, 4.5],
  ['DESIGN.md', 'white on --teal (buttons/chips)', T.white, T.teal, 4.5],
  ['DESIGN.md', '--ink-muted on --surface',        T.inkMuted, T.surface, 4.5],
  ['DESIGN.md', '--ink-subtle on --surface',       T.inkSubtle, T.surface, 4.5],
  ['DESIGN.md', '--ink-subtle on --surface-sunk',  T.inkSubtle, T.sunk, 4.5],
  ['DESIGN.md', '--warn on --surface',             T.warn, T.surface, 4.5],
  ['DESIGN.md', '--sold on --surface-sunk',        T.sold, T.sunk, 4.5],
  ['DESIGN.md', '--teal-deep on --teal-tint',      T.tealDeep, T.tealTint, 4.5],
  ['DESIGN.md', 'cluster numerals on --mint',      T.clusterInk, T.mint, 4.5],
  // --- pairs introduced by this implementation ---
  ['new', '--ink on --surface (card address)',     T.ink, T.surface, 4.5],
  ['new', '--ink on --bg (app background)',        T.ink, T.bg, 4.5],
  ['new', '--ink-muted on --bg',                   T.inkMuted, T.bg, 4.5],
  ['new', '--ink-muted on --surface-sunk (chips)', T.inkMuted, T.sunk, 4.5],
  ['new', '--teal on --surface-sunk (search)',     T.teal, T.sunk, 4.5],
  ['new', '--warn on warn tint (.autherr)',        T.warn, T.warnTint, 4.5],
  ['new', '--warn on warn tint (under-offer pill)',T.warn, T.warnTint, 4.5],
  ['new', '--sold on --surface (footer/gone)',     T.sold, T.surface, 4.5],
  ['new', '--teal-deep on --teal-tint (teaser)',   T.tealDeep, T.tealTint, 4.5],
  ['new', '--map-ink on --map-bg (map labels)',    T.mapInk, T.mapBg, 4.5],
  ['new', 'price pill ink on white 92% over map',  T.ink, over(T.white, 0.92, T.mapBg), 4.5],
  ['new', 'seen pill --sold on opaque sunk',     T.sold, T.sunk, 4.5],
  ['new', 'gone pill --sold on opaque sunk',     T.sold, T.sunk, 4.5],
  ['new', 'attribution --ink-muted on white',    T.inkMuted, T.white, 4.5],
  ['new', 'attribution link --teal on white',    T.teal, T.white, 4.5],
  ['new', 'white on --teal (selected map pin)',    T.white, T.teal, 4.5],
  ['new', '--ink on selected-card tint over surface', T.ink, over(T.tealTint, 0.4, T.surface), 4.5],
];

let fails = 0;
console.log('source    ratio  verdict  pair');
for (const [src, name, fg, bg, min] of pairs) {
  const r = ratio(fg, bg);
  const pass = r >= min;
  if (!pass) fails++;
  console.log(`${src.padEnd(9)} ${r.toFixed(2).padStart(5)}  ${(pass ? 'PASS' : 'FAIL').padEnd(7)} ${name}`);
}
console.log(`\n${pairs.length} pairs checked, ${fails} below 4.5:1`);
process.exit(fails ? 1 : 0);
