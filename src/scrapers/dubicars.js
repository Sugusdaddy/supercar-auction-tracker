const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { parsePrice, parseMileage, normalizeBrand, sleep, retry } = require('../utils/calculator');

// AED to USD conversion rate
const AED_TO_USD = 0.272;

const BRANDS = ['lamborghini', 'ferrari', 'mclaren', 'porsche', 'bentley', 'rolls-royce'];

class DubiCarsScraper {
  constructor() {
    this.browser = null;
    this.source = 'dubicars';
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  async scrapeBrand(brand) {
    const listings = [];
    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const url = `https://www.dubicars.com/uae/used/${brand.toLowerCase()}`;
      console.log(`[DubiCars] Scraping ${url}`);
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000);

      // Scroll to load more
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 1000));
        await sleep(500);
      }

      const html = await page.content();
      const $ = cheerio.load(html);

      // Parse listings
      $('[class*="listing"], [class*="card"], .car-item, article').each((_, el) => {
        try {
          const $el = $(el);
          
          const title = $el.find('h2, h3, .title, [class*="title"]').first().text().trim();
          if (!title || !title.toLowerCase().includes(brand.toLowerCase().split('-')[0])) return;

          const priceText = $el.find('[class*="price"], .price').first().text();
          const priceAED = parsePrice(priceText);
          const priceUSD = Math.round(priceAED * AED_TO_USD);

          const yearMatch = title.match(/\b(19|20)\d{2}\b/);
          const year = yearMatch ? parseInt(yearMatch[0]) : null;

          let model = title.replace(new RegExp(brand.split('-')[0], 'i'), '').trim();
          model = model.replace(/^\d{4}\s*/, '').trim();

          if (priceUSD > 10000) {
            listings.push({
              brand: normalizeBrand(brand),
              model: model || title,
              year,
              price_aed: priceAED,
              price_usd: priceUSD,
              mileage: parseMileage($el.find('[class*="mileage"], [class*="km"]').text()),
              url: $el.find('a').first().attr('href')
            });
          }
        } catch (e) {}
      });

      console.log(`[DubiCars] Found ${listings.length} ${brand} listings`);
    } catch (error) {
      console.error(`[DubiCars] Error scraping ${brand}:`, error.message);
    } finally {
      await page.close();
    }

    return listings;
  }

  /**
   * Calculate average prices by model and year range
   */
  aggregatePrices(listings) {
    const grouped = {};

    for (const listing of listings) {
      const key = `${listing.brand}|${listing.model}`;
      if (!grouped[key]) {
        grouped[key] = {
          brand: listing.brand,
          model: listing.model,
          prices: [],
          years: []
        };
      }
      grouped[key].prices.push(listing.price_usd);
      if (listing.year) grouped[key].years.push(listing.year);
    }

    const results = [];
    for (const data of Object.values(grouped)) {
      if (data.prices.length === 0) continue;

      const sorted = [...data.prices].sort((a, b) => a - b);
      results.push({
        brand: data.brand,
        model: data.model,
        year_min: data.years.length > 0 ? Math.min(...data.years) : null,
        year_max: data.years.length > 0 ? Math.max(...data.years) : null,
        avg_price_usd: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
        min_price_usd: sorted[0],
        max_price_usd: sorted[sorted.length - 1],
        sample_count: data.prices.length
      });
    }

    return results;
  }

  async scrapeAll() {
    const allListings = [];
    await this.init();
    
    for (const brand of BRANDS) {
      try {
        const listings = await retry(() => this.scrapeBrand(brand), 2);
        allListings.push(...listings);
        await sleep(3000);
      } catch (error) {
        console.error(`[DubiCars] Failed ${brand}:`, error.message);
      }
    }
    
    await this.close();
    return this.aggregatePrices(allListings);
  }
}

module.exports = DubiCarsScraper;
