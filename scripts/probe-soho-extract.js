const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const priceOf = html => { const m = html.match(/price of [^.<]{3,60}? is (\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?|Contact Agent|POA)/i); return m ? m[1] : null; };
(async () => {
  const cases = [
    ['6 Iramoo (exp $680k-720k)', '6-iramoo-court-albanvale-vic-3021'],
    ['13A Moorhouse (exp Contact Agent)', '13a-moorhouse-street-armadale-vic-3143'],
    ['57 Winton (exp $2.2-2.4m)', '57-winton-road-ashburton-vic-3147'],
    ['26 Kernan (exp $629k)', '26-kernan-court-craigieburn-vic-3064'],
    ['15 Kerr (exp $2.45-2.695m)', '15-kerr-crescent-camberwell-vic-3124'],
    ['73 Church (exp $1.695-1.85m)', '73-church-road-doncaster-vic-3108']
  ];
  for (const [label, slug] of cases) {
    let got = '(no page)';
    for (const kind of ['auction', 'sale']) {
      try { const h = await (await fetch('https://soho.com.au/properties/' + kind + '/' + slug + '-australia', { headers: UA })).text(); if (h.length > 5000) { got = priceOf(h) || '(no price match)'; break; } } catch {}
    }
    console.log(label.padEnd(38), '->', got);
  }
})();