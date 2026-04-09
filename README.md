# SupercarFlip - Global Auction Tracker

Real-time supercar auction aggregator with Dubai flip profit calculator.

![Dashboard](https://i.imgur.com/placeholder.png)

## Features

- **Multi-source scraping**: CarFast, BidCars, CarsFromWest, Emirates Auction
- **Dubai market prices**: Live data from DubiCars for profit calculations
- **Repair cost estimates**: Realistic costs based on damage type for supercars
- **Full cost breakdown**: Auction fees, shipping, repairs, UAE import taxes
- **ROI calculator**: Automatic profit and ROI for each lot
- **Bid estimation**: Predicts final price based on time to auction
- **Watchlist**: Save and track interesting lots
- **Auto-refresh**: Scrapes every 6 hours via cron

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000

## Initial Scrape

```bash
npm run scrape
```

## Repair Estimates (Supercars)

| Damage Type | Estimate |
|-------------|----------|
| Normal wear / minor dents | $7,500 |
| Front end | $30,000 |
| Rear end | $20,000 |
| Side | $18,000 |
| Theft recovery | $10,000 |
| Undercarriage | $18,000 |
| All over / flood / burn | **AVOID** |
| Unknown | $25,000 |

## Bid Estimation

| Time to Sale | Multiplier |
|--------------|------------|
| > 7 days | 1.6x current |
| 3-7 days | 1.8x current |
| < 3 days | 2.0x current |

## Profit Calculation

1. **Auction Total**: Estimated final + 22% fees + $800 transport
2. **Repair**: Based on damage type
3. **Shipping**: USA $2,800 / Japan $1,200 / Germany $1,500 / UAE $0
4. **Insurance**: 0.5% of auction total
5. **CIF Value**: Auction total + repair + shipping + insurance
6. **UAE Import**: 5% customs + 5% VAT on CIF
7. **Dubai Fixed**: RTA $1,350 + insurance $400 + ads $200
8. **Profit**: Dubai market price - total cost

## API Endpoints

```
GET /api/lots                - All lots with filters
GET /api/lots/:id            - Single lot detail
GET /api/lots/:id/breakdown  - Full cost breakdown
GET /api/opportunities       - High ROI lots (>15%)
GET /api/history             - Sold last 30 days
GET /api/dubai-prices        - Dubai market prices
GET /api/stats               - Dashboard stats
GET /api/watchlist           - Server watchlist
GET /api/watchlist/ids/:ids  - Get lots by IDs
GET /api/best-month          - Top 10 this month
POST /api/refresh            - Trigger scrape
```

### Filter Parameters

- `brand`: Ferrari, Lamborghini, McLaren, Porsche, etc.
- `source`: copart, iaai, carfast, bidcars, emirates
- `status`: live, week, future, sold
- `damage_risk`: low, medium, avoid
- `min_profit`: Minimum profit USD
- `sort`: profit, roi, price, soonest

## Tech Stack

- Node.js + Express
- Puppeteer + Cheerio (scraping)
- SQLite (better-sqlite3)
- Chart.js + TailwindCSS (frontend)
- node-cron (scheduling)

## Adding New Sources

1. Create scraper in `src/scrapers/newsource.js`
2. Implement `scrapeAll()` returning array of lots
3. Add to `ScrapeManager` in `src/scrape-all.js`
4. Add badge color in `public/index.html`

## Deploy to VPS

```bash
# Install dependencies
npm install --production

# Start with PM2
pm2 start src/index.js --name supercar-tracker
pm2 save
pm2 startup

# Nginx (optional)
sudo nano /etc/nginx/sites-available/supercar
# Add proxy_pass to localhost:3000
```

## Environment Variables

- `PORT`: Server port (default: 3000)
- `SCRAPE_INTERVAL`: Cron schedule (default: every 6h)

## Brands Tracked

- Ferrari
- Lamborghini
- McLaren
- Porsche
- Bentley
- Rolls-Royce
- Aston Martin
- Mercedes-AMG

## License

MIT
