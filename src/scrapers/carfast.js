const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { parsePrice, parseMileage, normalizeBrand, sleep, retry } = require('../utils/calculator');

const BRANDS = ['lamborghini', 'ferrari', 'mclaren', 'porsche'];
const BASE_URL = 'https://carfast.express/en/auction/brand-';

class CarfastScraper {
  constructor() {
    this.browser = null;
    this.source = 'carfast';
    this.platform = 'carfast';
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async scrapeBrand(brand) {
    const lots = [];
    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const url = `${BASE_URL}${brand}`;
      console.log(`[CarFast] Scraping ${url}`);
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000);

      // Scroll to load lazy content
      await page.evaluate(async () => {
        await new Promise(resolve => {
          let totalHeight = 0;
          const distance = 500;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= document.body.scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      const html = await page.content();
      const $ = cheerio.load(html);

      // Parse auction cards
      $('.auction-card, .vehicle-card, .lot-card, [class*="auction"], [class*="vehicle"]').each((_, el) => {
        try {
          const $el = $(el);
          
          const title = $el.find('h2, h3, .title, [class*="title"]').first().text().trim();
          if (!title) return;

          const lot = {
            source: this.source,
            platform: this.platform,
            brand: normalizeBrand(brand),
            model: this.extractModel(title, brand),
            year: this.extractYear(title),
            lot_number: $el.find('[class*="lot"], .lot-number').text().trim() || 
                       $el.attr('data-lot') || 
                       `CF${Date.now()}${Math.random().toString(36).substr(2, 5)}`,
            vin: $el.find('[class*="vin"]').text().trim() || null,
            current_bid_usd: parsePrice($el.find('[class*="price"], [class*="bid"], .price').first().text()),
            damage_type: $el.find('[class*="damage"], [class*="condition"]').text().trim() || 'Unknown',
            mileage_miles: parseMileage($el.find('[class*="mileage"], [class*="odometer"]').text()),
            condition: $el.find('[class*="grade"], [class*="condition"]').text().trim() || 'Unknown',
            status: 'live',
            sale_date: $el.find('[class*="date"], [class*="auction-date"]').text().trim() || null,
            location_state: $el.find('[class*="location"]').text().trim() || 'USA',
            location_country: 'USA',
            image_url: $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src'),
            detail_url: $el.find('a').first().attr('href')
          };

          if (lot.detail_url && !lot.detail_url.startsWith('http')) {
            lot.detail_url = 'https://carfast.express' + lot.detail_url;
          }

          if (lot.current_bid_usd > 0 || lot.model) {
            lots.push(lot);
          }
        } catch (e) {
          console.error('[CarFast] Error parsing card:', e.message);
        }
      });

      console.log(`[CarFast] Found ${lots.length} ${brand} lots`);
    } catch (error) {
      console.error(`[CarFast] Error scraping ${brand}:`, error.message);
    } finally {
      await page.close();
    }

    return lots;
  }

  extractModel(title, brand) {
    const brandRegex = new RegExp(brand, 'i');
    let model = title.replace(brandRegex, '').trim();
    model = model.replace(/^\d{4}\s*/, '').trim();
    return model || title;
  }

  extractYear(title) {
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0]) : null;
  }

  async scrapeAll() {
    const allLots = [];
    
    await this.init();
    
    for (const brand of BRANDS) {
      try {
        const lots = await retry(() => this.scrapeBrand(brand), 2);
        allLots.push(...lots);
        await sleep(3000); // Be nice to the server
      } catch (error) {
        console.error(`[CarFast] Failed to scrape ${brand}:`, error.message);
      }
    }
    
    await this.close();
    
    return allLots;
  }

  async scrapeHistory() {
    const history = [];
    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.goto('https://carfast.express/en/history', { waitUntil: 'networkidle2', timeout: 30000 });
      
      const html = await page.content();
      const $ = cheerio.load(html);

      // Parse sold cars
      $('[class*="sold"], [class*="history"]').find('.card, .item, .vehicle').each((_, el) => {
        try {
          const $el = $(el);
          const title = $el.find('h2, h3, .title').first().text().trim();
          
          for (const brand of BRANDS) {
            if (title.toLowerCase().includes(brand)) {
              history.push({
                source: this.source,
                lot_number: $el.attr('data-lot') || `CFH${Date.now()}`,
                brand: normalizeBrand(brand),
                model: this.extractModel(title, brand),
                year: this.extractYear(title),
                final_bid_usd: parsePrice($el.find('[class*="price"]').text()),
                sale_date: $el.find('[class*="date"]').text().trim(),
                damage_type: $el.find('[class*="damage"]').text().trim(),
                mileage_miles: parseMileage($el.find('[class*="mileage"]').text()),
                image_url: $el.find('img').first().attr('src')
              });
              break;
            }
          }
        } catch (e) {}
      });
    } catch (error) {
      console.error('[CarFast] Error scraping history:', error.message);
    } finally {
      await page.close();
    }

    return history;
  }
}

module.exports = CarfastScraper;
