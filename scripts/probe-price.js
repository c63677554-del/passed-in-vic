const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const strip = s => s.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
(async () => {
  for (const slug of ['caulfield', 'reservoir', 'hawthorn']) {
    const html = await (await fetch('https://reiv.com.au/market-insights/suburb/' + slug, { headers: UA })).text();
    console.log('\n==== ' + slug + ' (len ' + html.length + ') ====');
    console.log('has "median":', /median/i.test(html));
    const dollars = [...new Set([...html.matchAll(/\$[\d][\d,]{3,}/g)].map(x => x[0]))];
    console.log('$ amounts:', dollars.slice(0, 16).join(', ') || '(none)');
    // context around first few "median" hits
    let m, c = 0; const re = /median/gi;
    while ((m = re.exec(html)) && c < 4) { console.log('  ..', strip(html.slice(Math.max(0, m.index - 70), m.index + 90))); c++; }
  }
})();