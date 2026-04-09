const express = require('express');
const path = require('path');
const { db, statements } = require('../database');

const router = express.Router();

// Get all lots with filtering
router.get('/lots', (req, res) => {
  try {
    const {
      brand = null,
      status = null,
      minProfit = null,
      sortBy = 'profit',
      limit = 100,
      offset = 0
    } = req.query;

    const lots = statements.getLots.all({
      brand: brand || null,
      status: status || null,
      minProfit: minProfit ? parseFloat(minProfit) : null,
      sortBy,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      count: lots.length,
      data: lots
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
    res.json({ success: true, data: lot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get sold history
router.get('/history', (req, res) => {
  try {
    const { brand = null, limit = 50 } = req.query;
    
    const history = statements.getSoldHistory.all({
      brand: brand || null,
      limit: parseInt(limit)
    });

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
    
    const prices = statements.getDubaiPrices.all({
      brand: brand || null
    });

    res.json({
      success: true,
      count: prices.length,
      data: prices
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get overall stats
router.get('/stats', (req, res) => {
  try {
    const overall = statements.getStats.get();
    const byBrand = statements.getStatsByBrand.all();

    // Get recent scrape logs
    const logs = db.prepare(`
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
          maxProfit: Math.round(overall.max_profit || 0),
          avgRoi: Math.round((overall.avg_roi || 0) * 10) / 10
        },
        byBrand,
        recentScrapes: logs
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get top opportunities
router.get('/opportunities', (req, res) => {
  try {
    const { minRoi = 15, limit = 20 } = req.query;

    const opportunities = db.prepare(`
      SELECT * FROM auction_lots
      WHERE estimated_profit_usd > 0 
        AND roi_percent >= ?
        AND status = 'live'
      ORDER BY roi_percent DESC
      LIMIT ?
    `).all(parseFloat(minRoi), parseInt(limit));

    res.json({
      success: true,
      count: opportunities.length,
      data: opportunities
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trigger manual scrape
router.post('/scrape', async (req, res) => {
  try {
    const ScrapeManager = require('./scrape-all');
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

// Get profit breakdown for a lot
router.get('/lots/:id/breakdown', (req, res) => {
  try {
    const lot = db.prepare('SELECT * FROM auction_lots WHERE id = ?').get(req.params.id);
    if (!lot) {
      return res.status(404).json({ success: false, error: 'Lot not found' });
    }

    const { calculateProfit } = require('./utils/calculator');
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

module.exports = router;
