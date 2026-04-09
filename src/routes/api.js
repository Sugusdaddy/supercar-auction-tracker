const express = require('express');
const { db, statements } = require('../database');
const { USD_TO_AED } = require('../utils/calculator');

const router = express.Router();

// Get all lots with filtering
router.get('/lots', (req, res) => {
  try {
    const {
      brand = null,
      source = null,
      status = null,
      damage_risk = null,
      min_profit = null,
      sort = 'profit',
      limit = 100,
      offset = 0
    } = req.query;

    let sql = `
      SELECT * FROM auction_lots
      WHERE 1=1
    `;
    const params = [];

    if (brand) {
      sql += ` AND brand = ?`;
      params.push(brand);
    }
    if (source) {
      sql += ` AND source = ?`;
      params.push(source);
    }
    if (status) {
      if (status === 'live') {
        sql += ` AND status = 'live'`;
      } else if (status === 'week') {
        sql += ` AND status IN ('live', 'upcoming') AND sale_timestamp <= ?`;
        params.push(Math.floor(Date.now() / 1000) + 7 * 86400);
      } else if (status === 'future') {
        sql += ` AND status IN ('upcoming', 'future')`;
      } else if (status === 'sold') {
        sql += ` AND status = 'sold'`;
      }
    }
    if (damage_risk) {
      if (damage_risk === 'low') {
        sql += ` AND damage_risk = 'low'`;
      } else if (damage_risk === 'medium') {
        sql += ` AND damage_risk IN ('low', 'medium')`;
      } else if (damage_risk === 'avoid') {
        sql += ` AND is_avoid = 1`;
      }
    }
    if (min_profit) {
      sql += ` AND estimated_profit_usd >= ?`;
      params.push(parseFloat(min_profit));
    }

    // Sorting
    switch (sort) {
      case 'profit':
        sql += ` ORDER BY estimated_profit_usd DESC`;
        break;
      case 'roi':
        sql += ` ORDER BY roi_percent DESC`;
        break;
      case 'price':
        sql += ` ORDER BY current_bid_usd ASC`;
        break;
      case 'soonest':
        sql += ` ORDER BY sale_timestamp ASC`;
        break;
      default:
        sql += ` ORDER BY estimated_profit_usd DESC`;
    }

    sql += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const lots = db.prepare(sql).all(...params);

    // Add AED values
    const lotsWithAED = lots.map(lot => ({
      ...lot,
      current_bid_aed: Math.round(lot.current_bid_usd * USD_TO_AED),
      estimated_profit_aed: Math.round(lot.estimated_profit_usd * USD_TO_AED),
      dubai_market_price_aed: Math.round(lot.dubai_market_price_usd * USD_TO_AED)
    }));

    res.json({
      success: true,
      count: lots.length,
      data: lotsWithAED
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single lot detail
router.get('/lots/:id', (req, res) => {
  try {
    const lot = db.prepare('SELECT * FROM auction_lots WHERE id = ?').get(req.params.id);
    if (!lot) {
      return res.status(404).json({ success: false, error: 'Lot not found' });
    }
    
    lot.current_bid_aed = Math.round(lot.current_bid_usd * USD_TO_AED);
    lot.estimated_profit_aed = Math.round(lot.estimated_profit_usd * USD_TO_AED);
    lot.dubai_market_price_aed = Math.round(lot.dubai_market_price_usd * USD_TO_AED);
    
    res.json({ success: true, data: lot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get profit breakdown for a lot
router.get('/lots/:id/breakdown', (req, res) => {
  try {
    const lot = db.prepare('SELECT * FROM auction_lots WHERE id = ?').get(req.params.id);
    if (!lot) {
      return res.status(404).json({ success: false, error: 'Lot not found' });
    }

    const { calculateProfit } = require('../utils/calculator');
    const breakdown = calculateProfit(lot, lot.dubai_market_price_usd);

    res.json({
      success: true,
      data: {
        lot,
        breakdown
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get sold history (last 30 days)
router.get('/history', (req, res) => {
  try {
    const { brand = null, limit = 50 } = req.query;
    
    let sql = `
      SELECT * FROM sold_history
      WHERE sale_date >= date('now', '-30 days')
    `;
    const params = [];

    if (brand) {
      sql += ` AND brand = ?`;
      params.push(brand);
    }

    sql += ` ORDER BY sale_date DESC LIMIT ?`;
    params.push(parseInt(limit));

    const history = db.prepare(sql).all(...params);

    res.json({
      success: true,
      count: history.length,
      data: history
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Dubai market prices
router.get('/dubai-prices', (req, res) => {
  try {
    const { brand = null } = req.query;
    
    let sql = `SELECT * FROM dubai_market_prices`;
    const params = [];

    if (brand) {
      sql += ` WHERE brand = ?`;
      params.push(brand);
    }

    sql += ` ORDER BY brand, model`;

    const prices = db.prepare(sql).all(...params);

    // Add AED values
    const pricesWithAED = prices.map(p => ({
      ...p,
      avg_price_aed: Math.round(p.avg_price_usd * USD_TO_AED),
      min_price_aed: Math.round(p.min_price_usd * USD_TO_AED),
      max_price_aed: Math.round(p.max_price_usd * USD_TO_AED)
    }));

    res.json({
      success: true,
      count: prices.length,
      data: pricesWithAED
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get dashboard stats
router.get('/stats', (req, res) => {
  try {
    const overall = db.prepare(`
      SELECT 
        COUNT(*) as total_lots,
        COUNT(CASE WHEN status = 'live' THEN 1 END) as live_lots,
        COUNT(CASE WHEN estimated_profit_usd > 0 AND is_avoid = 0 THEN 1 END) as profitable_lots,
        AVG(CASE WHEN is_avoid = 0 THEN estimated_profit_usd END) as avg_profit,
        MAX(CASE WHEN is_avoid = 0 THEN estimated_profit_usd END) as max_profit,
        SUM(CASE WHEN estimated_profit_usd > 0 AND is_avoid = 0 THEN estimated_profit_usd ELSE 0 END) as total_profit_pool,
        AVG(CASE WHEN is_avoid = 0 THEN roi_percent END) as avg_roi,
        COUNT(CASE WHEN status = 'live' AND sale_timestamp <= ? THEN 1 END) as urgent_48h
      FROM auction_lots
    `).get(Math.floor(Date.now() / 1000) + 48 * 3600);

    const byBrand = db.prepare(`
      SELECT 
        brand,
        COUNT(*) as count,
        AVG(current_bid_usd) as avg_bid,
        AVG(CASE WHEN is_avoid = 0 THEN estimated_profit_usd END) as avg_profit,
        AVG(CASE WHEN is_avoid = 0 THEN roi_percent END) as avg_roi
      FROM auction_lots
      WHERE status != 'sold'
      GROUP BY brand
      ORDER BY count DESC
    `).all();

    const bySource = db.prepare(`
      SELECT 
        source,
        COUNT(*) as count,
        AVG(CASE WHEN is_avoid = 0 THEN estimated_profit_usd END) as avg_profit
      FROM auction_lots
      WHERE status != 'sold'
      GROUP BY source
      ORDER BY count DESC
    `).all();

    const recentScrapes = db.prepare(`
      SELECT * FROM scrape_logs 
      ORDER BY created_at DESC 
      LIMIT 10
    `).all();

    res.json({
      success: true,
      data: {
        overall: {
          totalLots: overall.total_lots || 0,
          liveLots: overall.live_lots || 0,
          profitableLots: overall.profitable_lots || 0,
          avgProfit: Math.round(overall.avg_profit || 0),
          avgProfitAED: Math.round((overall.avg_profit || 0) * USD_TO_AED),
          maxProfit: Math.round(overall.max_profit || 0),
          maxProfitAED: Math.round((overall.max_profit || 0) * USD_TO_AED),
          totalProfitPool: Math.round(overall.total_profit_pool || 0),
          totalProfitPoolAED: Math.round((overall.total_profit_pool || 0) * USD_TO_AED),
          avgRoi: Math.round((overall.avg_roi || 0) * 10) / 10,
          urgent48h: overall.urgent_48h || 0
        },
        byBrand,
        bySource,
        recentScrapes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get top opportunities
router.get('/opportunities', (req, res) => {
  try {
    const { min_roi = 15, limit = 20 } = req.query;

    const opportunities = db.prepare(`
      SELECT * FROM auction_lots
      WHERE estimated_profit_usd > 0 
        AND roi_percent >= ?
        AND is_avoid = 0
        AND status IN ('live', 'upcoming')
      ORDER BY roi_percent DESC
      LIMIT ?
    `).all(parseFloat(min_roi), parseInt(limit));

    res.json({
      success: true,
      count: opportunities.length,
      data: opportunities
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get best of month
router.get('/best-month', (req, res) => {
  try {
    const best = db.prepare(`
      SELECT * FROM auction_lots
      WHERE is_avoid = 0
        AND updated_at >= date('now', '-30 days')
      ORDER BY estimated_profit_usd DESC
      LIMIT 10
    `).all();

    res.json({
      success: true,
      data: best
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Watchlist endpoints
router.get('/watchlist', (req, res) => {
  try {
    const watchlist = statements.getWatchlist.all();
    
    const withAED = watchlist.map(lot => ({
      ...lot,
      current_bid_aed: Math.round(lot.current_bid_usd * USD_TO_AED),
      estimated_profit_aed: Math.round(lot.estimated_profit_usd * USD_TO_AED)
    }));

    const totalProfit = watchlist.reduce((sum, lot) => sum + (lot.estimated_profit_usd > 0 ? lot.estimated_profit_usd : 0), 0);

    res.json({
      success: true,
      count: watchlist.length,
      totalProfit: Math.round(totalProfit),
      totalProfitAED: Math.round(totalProfit * USD_TO_AED),
      data: withAED
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/watchlist/:id', (req, res) => {
  try {
    statements.addToWatchlist.run(req.params.id);
    res.json({ success: true, message: 'Added to watchlist' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/watchlist/:id', (req, res) => {
  try {
    statements.removeFromWatchlist.run(req.params.id);
    res.json({ success: true, message: 'Removed from watchlist' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get watchlist by IDs (for localStorage sync)
router.get('/watchlist/ids/:ids', (req, res) => {
  try {
    const ids = req.params.ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (ids.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const placeholders = ids.map(() => '?').join(',');
    const lots = db.prepare(`SELECT * FROM auction_lots WHERE id IN (${placeholders})`).all(...ids);

    res.json({
      success: true,
      data: lots
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trigger manual scrape
router.post('/refresh', async (req, res) => {
  try {
    const ScrapeManager = require('../scrape-all');
    const manager = new ScrapeManager();
    
    // Run in background
    manager.runAll().catch(err => console.error('Scrape error:', err));
    
    res.json({
      success: true,
      message: 'Scrape started in background'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// History chart data (avg price per model over 30 days)
router.get('/history/chart', (req, res) => {
  try {
    const { brand = null } = req.query;

    let sql = `
      SELECT 
        brand,
        model,
        sale_date,
        AVG(final_bid_usd) as avg_price
      FROM sold_history
      WHERE sale_date >= date('now', '-30 days')
    `;
    const params = [];

    if (brand) {
      sql += ` AND brand = ?`;
      params.push(brand);
    }

    sql += ` GROUP BY brand, model, sale_date ORDER BY sale_date`;

    const data = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
