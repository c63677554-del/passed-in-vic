const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const targets = [
  ['ROBOTS',  'https://reiv.com.au/robots.txt'],
  ['SITEMAP', 'https://reiv.com.au/sitemap.xml'],
  ['SUBURB',  'https://reiv.com.au/market-insights/suburb/caulfield'],
];
(async () => {
  for (const [name, url] of targets) {
    try {
      const r = await fetch(url, { headers: UA });
      const b = await r.text();
      console.log(`\n=== ${name}  status=${r.status}  len=${b.length}  ctype=${r.headers.get('content-type')}`);
      if (name === 'ROBOTS') { console.log(b.slice(0, 600)); }
      if (name === 'SITEMAP') {
        console.log('isIndex:', b.includes('<sitemapindex'));
        const subs = [...b.matchAll(/\/market-insights\/suburb\/[^<\s"]+/g)].map(m => m[0]);
        console.log('suburb URLs:', subs.length, '| sample:', subs.slice(0,6).join('  '));
        const child = [...b.matchAll(/<loc>([^<]*sitemap[^<]*)<\/loc>/g)].map(m => m[1]);
        console.log('child sitemaps:', child.slice(0,10).join('  ') || '(none)');
      }
      if (name === 'SUBURB') {
        console.log('hasTable:', b.includes('<table'), '| hasMethod:', b.includes('Method'), '| hasPassedIn:', b.includes('Passed in'));
        console.log('<tr>:', (b.match(/<tr/g)||[]).length, '<td>:', (b.match(/<td/g)||[]).length);
        const dates = [...new Set([...b.matchAll(/\b(\d{1,2}\/\d{1,2}\/2026)\b/g)].map(m=>m[1]))];
        console.log('2026 dates:', dates.slice(0,14).join(', ') || '(none in HTML)');
        const i = b.indexOf('<table');
        if (i>=0) console.log('TABLE SNIPPET:', b.slice(i, i+700).replace(/\s+/g,' '));
      }
    } catch (e) { console.log(name, 'ERROR', e.message); }
  }
})();
