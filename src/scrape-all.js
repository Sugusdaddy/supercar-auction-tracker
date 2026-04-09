const { db, statements } = require('./database');
const { calculateProfit, getRepairEstimate, getShippingCost, getDamageRisk, estimateFinalBid } = require('./utils/calculator');

// Import all scrapers
const CarfastScraper = require('./scrapers/carfast');
const BidCarsScraper = require('./scrapers/bidcars');
const CarsFromWestScraper = require('./scrapers/carsfromwest');
const DubiCarsScraper = require('./scrapers/dubicars');
const EmiratesAuctionScraper = require('./scrapers/emirates');

class ScrapeManager {
  constructor() {
    this.scrapers = {
      carfast: new CarfastScraper(),
      bidcars: new BidCarsScraper(),
      carsfromwest: new CarsFromWestScraper(),
      dubicars: new DubiCarsScraper(),
      emirates: new EmiratesAuctionScraper()
    };
  }

  /**
   * Get Dubai market price for a specific car
   */
  getDubaiPrice(brand, model, year) {
    try {
      const result = statements.getMarketPrice.get({
        brand,
        model: model || '',
        year: year || 2020
      });
      return result?.avg_price_usd || this.getDefaultPrice(brand);
    } catch (e) {
      return this.getDefaultPrice(brand);
    }
  }

  /**
   * Default prices by brand if no market data
   */
  getDefaultPrice(brand) {
    const defaults = {
      'Ferrari': 280000,
      'Lamborghini': 320000,
      'McLaren': 250000,
      'Porsche': 140000,
      'Bentley': 200000,
      'Rolls-Royce': 400000,
      'Aston Martin': 180000,
      'Mercedes-AMG': 160000
    };
    return defaults[brand] || 180000;
  }

  /**
   * Process and save a lot with profit calculations
   */
  saveLot(lot) {
    try {
      // Get repair estimate
      lot.repair_estimate_usd = lot.repair_estimate_usd || getRepairEstimate(lot.damage_type);
      
      // Get damage risk level
      lot.damage_risk = getDamageRisk(lot.damage_type);
      
      // Check if should avoid
      const isAvoid = lot.repair_estimate_usd >= 999999;
      if (isAvoid) {
        lot.repair_estimate_usd = 80000; // Mark as $80k+ for display
      }
      
      // Get shipping cost
      lot.ship_to_dubai_usd = lot.ship_to_dubai_usd || getShippingCost(lot.location_country);
      
      // Estimate final price based on days to sale
      lot.estimated_final_usd = lot.estimated_final_usd || estimateFinalBid(lot.current_bid_usd, lot.sale_date, lot.status);
      
      // Get sale timestamp
      let saleTimestamp = null;
      if (lot.sale_date) {
        const parsed = new Date(lot.sale_date);
        if (!isNaN(parsed.getTime())) {
          saleTimestamp = Math.floor(parsed.getTime() / 1000);
        }
      }
      
      // Get Dubai market price
      lot.dubai_market_price_usd = this.getDubaiPrice(lot.brand, lot.model, lot.year);
      
      // Calculate profit
      const calc = calculateProfit(lot, lot.dubai_market_price_usd);
      lot.uae_import_tax_usd = calc.totalImportTax;
      lot.estimated_profit_usd = isAvoid ? -999999 : calc.profit;
      lot.roi_percent = isAvoid ? 0 : calc.roi;

      // Save to database
      statements.upsertLot.run({
        source: lot.source,
        platform: lot.platform,
        brand: lot.brand,
        model: lot.model || 'Unknown',
        year: lot.year,
        lot_number: lot.lot_number,
        vin: lot.vin,
        current_bid_usd: lot.current_bid_usd,
        estimated_final_usd: lot.estimated_final_usd,
        buy_now_usd: lot.buy_now_usd || null,
        damage_type: lot.damage_type,
        damage_risk: lot.damage_risk,
        mileage_miles: lot.mileage_miles,
        condition: lot.condition,
        status: lot.status || 'live',
        sale_date: lot.sale_date,
        sale_timestamp: saleTimestamp,
        location_state: lot.location_state,
        location_country: lot.location_country,
        seller_type: lot.seller_type,
        repair_estimate_usd: lot.repair_estimate_usd,
        ship_to_dubai_usd: lot.ship_to_dubai_usd,
        uae_import_tax_usd: lot.uae_import_tax_usd,
        dubai_market_price_usd: lot.dubai_market_price_usd,
        estimated_profit_usd: lot.estimated_profit_usd,
        roi_percent: lot.roi_percent,
        is_avoid: isAvoid ? 1 : 0,
        image_url: lot.image_url,
        detail_url: lot.detail_url
      });

      return true;
    } catch (error) {
      console.error(`Error saving lot ${lot.lot_number}:`, error.message);
      return false;
    }
  }

  /**
   * Save sold history with would-have profit calculation
   */
  saveSoldHistory(sold) {
    try {
      // Calculate what profit would have been
      const dubaiPrice = this.getDubaiPrice(sold.brand, sold.model, sold.year);
      const mockLot = {
        current_bid_usd: sold.final_bid_usd,
        estimated_final_usd: sold.final_bid_usd,
        damage_type: sold.damage_type,
        location_country: 'USA',
        status: 'sold'
      };
      const calc = calculateProfit(mockLot, dubaiPrice);

      statements.upsertSold.run({
        source: sold.source,
        lot_number: sold.lot_number,
        brand: sold.brand,
        model: sold.model || 'Unknown',
        year: sold.year,
        final_bid_usd: sold.final_bid_usd,
        sale_date: sold.sale_date,
        damage_type: sold.damage_type,
        mileage_miles: sold.mileage_miles,
        would_have_profit: calc.isAvoid ? null : calc.profit,
        image_url: sold.image_url
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Save Dubai market prices
   */
  saveDubaiPrices(prices) {
    let saved = 0;
    for (const price of prices) {
      try {
        statements.upsertDubaiPrice.run({
          brand: price.brand,
          model: price.model,
          year_min: price.year_min,
          year_max: price.year_max,
          avg_price_usd: price.avg_price_usd,
          min_price_usd: price.min_price_usd,
          max_price_usd: price.max_price_usd,
          sample_count: price.sample_count
        });
        saved++;
      } catch (e) {}
    }
    return saved;
  }

  /**
   * Log scrape result
   */
  logScrape(source, status, lotsFound, errorMessage, durationMs) {
    try {
      statements.logScrape.run({
        source,
        status,
        lots_found: lotsFound,
        error_message: errorMessage,
        duration_ms: durationMs
      });
    } catch (e) {}
  }

  /**
   * Run a single scraper
   */
  async runScraper(name) {
    const scraper = this.scrapers[name];
    if (!scraper) {
      console.error(`Unknown scraper: ${name}`);
      return { success: false, lots: 0 };
    }

    const startTime = Date.now();
    console.log(`\n${'='.repeat(50)}\n[${name.toUpperCase()}] Starting scrape...\n${'='.repeat(50)}`);

    try {
      let lots = [];
      
      if (name === 'dubicars') {
        // DubiCars returns aggregated prices, not lots
        const prices = await scraper.scrapeAll();
        const saved = this.saveDubaiPrices(prices);
        this.logScrape(name, 'success', saved, null, Date.now() - startTime);
        console.log(`[${name.toUpperCase()}] Saved ${saved} market prices`);
        return { success: true, lots: saved };
      }

      lots = await scraper.scrapeAll();
      
      let saved = 0;
      for (const lot of lots) {
        if (this.saveLot(lot)) saved++;
      }

      this.logScrape(name, 'success', saved, null, Date.now() - startTime);
      console.log(`[${name.toUpperCase()}] Saved ${saved}/${lots.length} lots`);
      
      return { success: true, lots: saved };
    } catch (error) {
      this.logScrape(name, 'error', 0, error.message, Date.now() - startTime);
      console.error(`[${name.toUpperCase()}] Error:`, error.message);
      return { success: false, lots: 0, error: error.message };
    }
  }

  /**
   * Run all scrapers
   */
  async runAll() {
    console.log('\n' + '='.repeat(60));
    console.log('STARTING FULL SCRAPE - ' + new Date().toISOString());
    console.log('='.repeat(60));

    const results = {};
    
    // First scrape Dubai prices for profit calculations
    console.log('\n[1/5] Scraping Dubai market prices first...');
    results.dubicars = await this.runScraper('dubicars');

    // Then scrape auction sites
    const auctionSites = ['carfast', 'bidcars', 'carsfromwest', 'emirates'];
    
    for (let i = 0; i < auctionSites.length; i++) {
      console.log(`\n[${i + 2}/5] Scraping ${auctionSites[i]}...`);
      results[auctionSites[i]] = await this.runScraper(auctionSites[i]);
    }

    // Clean up old sold lots
    statements.deleteOldLots.run();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SCRAPE COMPLETE');
    console.log('='.repeat(60));
    
    let totalLots = 0;
    for (const [source, result] of Object.entries(results)) {
      console.log(`  ${source}: ${result.success ? '✓' : '✗'} ${result.lots} items`);
      totalLots += result.lots;
    }
    console.log(`  TOTAL: ${totalLots} items`);
    console.log('='.repeat(60) + '\n');

    return results;
  }
}

module.exports = ScrapeManager;

// Allow running directly
if (require.main === module) {
  const manager = new ScrapeManager();
  manager.runAll().then(() => {
    console.log('Done!');
    process.exit(0);
  }).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
