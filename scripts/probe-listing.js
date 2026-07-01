const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const AB = { Ct: 'Court', St: 'Street', Rd: 'Road', Av: 'Avenue', Ave: 'Avenue', Dr: 'Drive', Pl: 'Place', Cr: 'Crescent', Cres: 'Crescent', Gr: 'Grove', Gv: 'Grove', Pde: 'Parade', Tce: 'Terrace', Cl: 'Close', Ln: 'Lane', Bvd: 'Boulevard', Sq: 'Square', Wy: 'Way', Hwy: 'Highway' };
const expand = a => a.replace(/\b([A-Za-z]+)\b/g, w => AB[w] || w);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const priceOf = b => { const m = b && b.match(/\$[\d,]{5,}(?:\s*[-–]\s*\$[\d,]{5,})?/); return m ? m[0] : null; };
async function tryFetch(url) { try { const r = await fetch(url, { headers: UA }); return { status: r.status, body: r.ok ? await r.text() : '' }; } catch (e) { return { status: 'ERR ' + e.message, body: '' }; } }
(async () => {
  const tests = [ {a:'6 Iramoo Ct',s:'Albanvale',p:'3021'}, {a:'101 Maxweld St',s:'Ardeer',p:'3022'}, {a:'13A Moorhouse St',s:'Armadale',p:'3143'}, {a:'40 Kooyong Rd',s:'Armadale',p:'3143'} ];
  for (const t of tests) {
    const full = expand(t.a) + ' ' + t.s + ' vic ' + t.p;
    const sohoSlug = slug(full + ' australia');
    const ah = 'https://www.allhomes.com.au/' + slug(full);
    let soho = null;
    for (const kind of ['auction', 'sale']) { const r = await tryFetch('https://soho.com.au/properties/' + kind + '/' + sohoSlug); if (r.status === 200) { soho = { kind, status: r.status, price: priceOf(r.body) }; break; } else if (!soho) soho = { kind, status: r.status }; }
    const rah = await tryFetch(ah);
    console.log(t.a + ', ' + t.s + ':');
    console.log('   soho   ', JSON.stringify(soho));
    console.log('   allhomes status', rah.status, '| price', priceOf(rah.body));
  }
})();