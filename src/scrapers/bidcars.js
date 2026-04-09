const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { parsePrice, parseMileage, normalizeBrand, sleep, retry } = require('../utils/calculator');

const BRANDS = ['lamborghini', 'ferrari', 'mclaren', 'porsche'];
const BASE_URL = 'https://bid.cars/en/automobile/';

class BidCarsScraper {
  constructor() {
    this.browser = null;
    this.source = 'bidcars';
    this.platform = 'bidcars';
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

  async scrapeBrand(brand, maxPages = 3) {
    const lots = [];
    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const url = `${BASE_URL}${brand}/page/${pageNum}`;
        console.log(`[BidCars] Scraping ${url}`);
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(2000);

        const html = await page.content();
        const $ = cheerio.load(html);

        let foundOnPage = 0;

        // Parse car cards - bid.cars uses various card classes
        $('.car-card, .vehicle-card, .lot-item, [class*="CarCard"], article').each((_, el) => {
          try {
            const $el = $(el);
            
            const title = $el.find('h2, h3, .title, [class*="title"], a[class*="name"]').first().text().trim();
            if (!title || !title.toLowerCase().includes(brand.toLowerCase())) return;

            const priceText = $el.find('[class*="price"], [class*="bid"], .price').first().text();
            const statusText = $el.find('[class*="status"], [class*="badge"]').text().toLowerCase();
            
            const lot = {
              source: this.source,
              platform: this.platform,
              brand: normalizeBrand(brand),
              model: this.extractModel(title, brand),
              year: this.extractYear(title),
              lot_number: $el.find('[class*="lot"]').text().replace(/\D/g, '') || 
                         $el.attr('data-lot') || 
                         `BC${Date.now()}${Math.random().toString(36).substr(2, 5)}`,
              vin: $el.find('[class*="vin"]').text().replace(/[^A-Z0-9]/gi, '') || null,
              current_bid_usd: parsePrice(priceText),
              damage_type: $el.find('[class*="damage"], [class*="condition"], .damage').text().trim() || 'Unknown',
              mileage_miles: parseMileage($el.find('[class*="mileage"], [class*="odometer"], .mileage').text()),
              condition: $el.find('[class*="grade"]').text().trim() || 'Unknown',
              status: statusText.includes('sold') ? 'sold' : 'live',
              sale_date: $el.find('[class*="date"], [class*="time"]').text().trim() || null,
              location_state: this.extractLocation($el.find('[class*="location"]').text()),
              location_country: 'USA',
              seller_type: $el.find('[class*="seller"]').text().toLowerCase().includes('insurance') ? 'insurance' : 'non-insurance',
              image_url: $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src'),
              detail_url: $el.find('a').first().attr('href')
            };

            if (lot.detail_url && !lot.detail_url.startsWith('http')) {
              lot.detail_url = 'https://bid.cars' + lot.detail_url;
            }

            if (lot.current_bid_usd > 0 || lot.model) {
              lots.push(lot);
              foundOnPage++;
            }
          } catch (e) {
            console.error('[BidCars] Parse error:', e.message);
          }
        });

        console.log(`[BidCars] Page ${pageNum}: found ${foundOnPage} lots`);
        
        // Stop if no results on page
        if (foundOnPage === 0) break;
        
        await sleep(2000);
      }
    } catch (error) {
      console.error(`[BidCars] Error scraping ${brand}:`, error.message);
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
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0]) : null;
  }

  extractLocation(text) {
    const states = ['CA', 'TX', 'FL', 'NY', 'NJ', 'PA', 'IL', 'GA', 'NC', 'AZ', 'NV', 'WA', 'OR', 'CO', 'OH'];
    for (const state of states) {
      if (text.toUpperCase().includes(state)) return state;
    }
    return text.trim() || 'Unknown';
  }

  async scrapeAll() {
    const allLots = [];
    await this.init();
    
    for (const brand of BRANDS) {
      try {
        const lots = await retry(() => this.scrapeBrand(brand), 2);
        allLots.push(...lots);
        await sleep(4000);
      } catch (error) {
        console.error(`[BidCars] Failed ${brand}:`, error.message);
      }
    }
    
    await this.close();
    return allLots;
  }
}

module.exports = BidCarsScraper;
