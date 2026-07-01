const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
(async () => {
  const url = 'https://soho.com.au/properties/auction/6-iramoo-court-albanvale-vic-3021-australia';
  const html = await (await fetch(url, { headers: UA })).text();
  console.log('len', html.length, '| has "680,000":', html.includes('680,000'), '| has "680000":', html.includes('680000'));
  console.log('has __NEXT_DATA__:', html.includes('__NEXT_DATA__'), '| has ld+json:', html.includes('application/ld+json'));
  for (const needle of ['680,000', '680000', '"price"', 'priceView', 'displayPrice', 'priceText', 'priceDetails', 'lowPrice', 'highPrice', 'offers']) {
    const i = html.indexOf(needle);
    if (i >= 0) console.log('  [' + needle + '] @' + i + ':', JSON.stringify(html.slice(i - 30, i + 90).replace(/\s+/g, ' ')));
  }
})();