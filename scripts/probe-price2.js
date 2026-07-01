const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const strip = s => s.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
(async () => {
  for (const slug of ['caulfield', 'reservoir']) {
    const html = await (await fetch('https://reiv.com.au/market-insights/suburb/' + slug, { headers: UA })).text();
    const t = strip(html);
    const i = t.search(/Median sale price/i);
    console.log('\n==== ' + slug + ' ====');
    console.log(t.slice(i, i + 700));
    // look for by-type / by-bedroom median language
    console.log('  [house median?]', /house.{0,30}\$[\d,]+/i.test(t), ' [unit median?]', /unit.{0,30}\$[\d,]+/i.test(t), ' [bedroom price?]', /bedroom.{0,40}\$[\d,]+/i.test(t));
  }
})();