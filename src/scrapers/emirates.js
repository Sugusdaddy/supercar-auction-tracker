const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { parsePrice, parseMileage, normalizeBrand, sleep, retry } = require('../utils/calculator');

// AED to USD
const AED_TO_USD = 0.272;

class EmiratesAuctionScraper {
  constructor() {
    this.browser = null;
    this.source = 'emirates';
    this.platform = 'emirates';
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

  async scrapeMotors() {
    const lots = [];
    const page = await this.browser.newPage();
    
    const supercarBrands = ['ferrari', 'lamborghini', 'mclaren', 'porsche', 'bentley', 'rolls', 'aston', 'mercedes'];
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const url = 'https://www.emiratesauction.com/motors';
      console.log(`[EmiratesAuction] Scraping ${url}`);
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(3000);

      // Try to load more items
      for (let i = 0; i < 5; i++) {
        try {
          await page.evaluate(() => window.scrollBy(0, 1500));
          await sleep(1000);
          const loadMore = await page.$('[class*="load-more"], button[class*="more"]');
          if (loadMore) await loadMore.click();
          await sleep(1500);
        } catch (e) {}
      }

      const html = await page.content();
      const $ = cheerio.load(html);

      // Parse auction items
      $('[class*="auction-item"], [class*="vehicle"], .lot-card, .car-card, article').each((_, el) => {
        try {
          const $el = $(el);
          
          const title = $el.find('h2, h3, .title, [class*="title"], [class*="name"]').first().text().trim().toLowerCase();
          if (!title) return;

          // Filter for supercars only
          const matchedBrand = supercarBrands.find(b => title.includes(b));
          if (!matchedBrand) return;

          const priceText = $el.find('[class*="price"], .price, [class*="bid"]').first().text();
          let priceUSD = parsePrice(priceText);
          
          // Convert AED to USD if needed
          if (priceText.toLowerCase().includes('aed') || priceUSD > 100000) {
            priceUSD = Math.round(priceUSD * AED_TO_USD);
          }

          const lot = {
            source: this.source,
            platform: this.platform,
            brand: normalizeBrand(matchedBrand),
            model: this.extractModel(title, matchedBrand),
            year: this.extractYear(title),
            lot_number: $el.find('[class*="lot"]').text().replace(/\D/g, '') ||
                       `EA${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
            current_bid_usd: priceUSD,
            damage_type: $el.find('[class*="damage"], [class*="condition"]').text().trim() || 'Clean',
            mileage_miles: parseMileage($el.find('[class*="mileage"], [class*="km"]').text()),
            condition: $el.find('[class*="grade"]').text().trim() || 'Good',
            status: 'live',
            sale_date: $el.find('[class*="date"], [class*="time"]').text().trim() || null,
            location_state: 'Dubai',
            location_country: 'UAE',
            ship_to_dubai_usd: 0, // Already in Dubai
            image_url: $el.find('img').first().attr('src'),
            detail_url: $el.find('a').first().attr('href')
          };

          if (lot.detail_url && !lot.detail_url.startsWith('http')) {
            lot.detail_url = 'https://www.emiratesauction.com' + lot.detail_url;
          }

          if (priceUSD > 5000) {
            lots.push(lot);
          }
        } catch (e) {}
      });

      console.log(`[EmiratesAuction] Found ${lots.length} supercar lots`);
    } catch (error) {
      console.error('[EmiratesAuction] Error:', error.message);
    } finally {
      await page.close();
    }

    return lots;
  }

  extractModel(title, brand) {
    let model = title.replace(new RegExp(brand, 'i'), '').trim();
    model = model.replace(/^\d{4}\s*/, '').trim();
    return model.charAt(0).toUpperCase() + model.slice(1);
  }

  extractYear(title) {
    const match = title.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0]) : null;
  }

  async scrapeAll() {
    await this.init();
    const lots = await retry(() => this.scrapeMotors(), 2);
    await this.close();
    return lots;
  }
}

module.exports = EmiratesAuctionScraper;
