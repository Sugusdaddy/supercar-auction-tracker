const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { parsePrice, parseMileage, normalizeBrand, sleep, retry } = require('../utils/calculator');

const BRANDS = ['lamborghini', 'ferrari', 'mclaren', 'porsche'];
const BASE_URL = 'https://carsfromwest.com/en/cars/';

class CarsFromWestScraper {
  constructor() {
    this.browser = null;
    this.source = 'carsfromwest';
    this.platform = 'carsfromwest';
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
    const lots = [];
    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const url = `${BASE_URL}${brand}`;
      console.log(`[CarsFromWest] Scraping ${url}`);
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000);

      // Auto-scroll
      await page.evaluate(async () => {
        await new Promise(resolve => {
          let total = 0;
          const timer = setInterval(() => {
            window.scrollBy(0, 400);
            total += 400;
            if (total >= document.body.scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 150);
        });
      });

      const html = await page.content();
      const $ = cheerio.load(html);

      // Parse cards
      $('.car-item, .vehicle-card, .lot-card, [class*="CarItem"], .car').each((_, el) => {
        try {
          const $el = $(el);
          
          const title = $el.find('h2, h3, .title, [class*="title"], .name').first().text().trim();
          if (!title) return;

          const lot = {
            source: this.source,
            platform: this.platform,
            brand: normalizeBrand(brand),
            model: this.extractModel(title, brand),
            year: this.extractYear(title),
            lot_number: $el.find('[class*="lot"]').text().replace(/\D/g, '') || 
                       `CFW${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
            vin: $el.find('[class*="vin"]').text().trim() || null,
            current_bid_usd: parsePrice($el.find('[class*="price"], .price').first().text()),
            damage_type: $el.find('[class*="damage"], .damage-type').text().trim() || 'Unknown',
            mileage_miles: parseMileage($el.find('[class*="mileage"], .mileage').text()),
            condition: $el.find('[class*="condition"]').text().trim() || 'Unknown',
            status: $el.find('[class*="sold"]').length > 0 ? 'sold' : 'live',
            sale_date: $el.find('[class*="date"]').text().trim() || null,
            location_state: 'USA',
            location_country: 'USA',
            image_url: $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src'),
            detail_url: $el.find('a').first().attr('href')
          };

          if (lot.detail_url && !lot.detail_url.startsWith('http')) {
            lot.detail_url = 'https://carsfromwest.com' + lot.detail_url;
          }

          if (lot.current_bid_usd > 0 || lot.model) {
            lots.push(lot);
          }
        } catch (e) {}
      });

      console.log(`[CarsFromWest] Found ${lots.length} ${brand} lots`);
    } catch (error) {
      console.error(`[CarsFromWest] Error scraping ${brand}:`, error.message);
    } finally {
      await page.close();
    }

    return lots;
  }

  extractModel(title, brand) {
    let model = title.replace(new RegExp(brand, 'i'), '').trim();
    model = model.replace(/^\d{4}\s*/, '').trim();
    return model || title;
  }

  extractYear(title) {
    const match = title.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0]) : null;
  }

  async scrapeAll() {
    const allLots = [];
    await this.init();
    
    for (const brand of BRANDS) {
      try {
        const lots = await retry(() => this.scrapeBrand(brand), 2);
        allLots.push(...lots);
        await sleep(3000);
      } catch (error) {
        console.error(`[CarsFromWest] Failed ${brand}:`, error.message);
      }
    }
    
    await this.close();
    return allLots;
  }
}

module.exports = CarsFromWestScraper;
