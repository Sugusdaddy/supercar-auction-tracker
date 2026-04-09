const express = require('express');
const path = require('path');
const cron = require('node-cron');

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', apiRoutes);

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Schedule scraping every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('[CRON] Starting scheduled scrape...');
  try {
    const ScrapeManager = require('./scrape-all');
    const manager = new ScrapeManager();
    await manager.runAll();
  } catch (error) {
    console.error('[CRON] Scrape failed:', error.message);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║     SUPERCAR AUCTION TRACKER                              ║
║     Dubai Flip Profit Calculator                          ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                  ║
║  API endpoints: /api/lots, /api/stats, /api/opportunities ║
║  Auto-scrape: Every 6 hours                               ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
