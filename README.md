# Supercar Auction Tracker

Global supercar auction aggregator with Dubai flip profit calculator.

## Features

- **Multi-source scraping**: CarFast, BidCars, CarsFromWest, Emirates Auction
- **Dubai market prices**: Live data from DubiCars for profit calculations
- **Full cost breakdown**: Auction fees, shipping, repairs, UAE import taxes
- **ROI calculator**: Automatic profit and ROI calculation for each lot
- **Auto-refresh**: Scrapes every 6 hours via cron

## Quick Start

```bash
# Install dependencies
npm install

# Initialize database and start
npm start

# Or run initial scrape first
npm run scrape
```

Open http://localhost:3000

## Scraping Sources

| Source | Type | Data |
|--------|------|------|
| CarFast.express | US Auctions | Live lots, history |
| Bid.cars | US Aggregator | Live lots, sold prices |
| CarsFromWest | US Auctions | Live lots |
| Emirates Auction | UAE | Dubai local auctions |
| DubiCars | UAE Market | Resale prices |

## Profit Calculation

For each lot, calculates:

1. **Auction costs**: Bid + 22% fees + $800 transport
2. **Repair estimate**: Based on damage type ($0-$25,000)
3. **Shipping**: USA $2,800 / Japan $1,200 / Germany $1,500
4. **UAE Import**: CIF × 10.5% (5% duty + 5% VAT)
5. **Dubai fixed**: RTA $1,350 + Insurance $400 + Ads $200
6. **Profit**: Dubai market price - total cost

## API Endpoints

```
GET /api/lots           - All lots with filters
GET /api/lots/:id       - Single lot detail
GET /api/lots/:id/breakdown - Full cost breakdown
GET /api/opportunities  - High ROI lots (>15%)
GET /api/history        - Sold in last 30 days
GET /api/dubai-prices   - Dubai market prices
GET /api/stats          - Dashboard statistics
POST /api/scrape        - Trigger manual scrape
```

## Tech Stack

- Node.js + Express
- Puppeteer + Cheerio (scraping)
- SQLite (better-sqlite3)
- Chart.js + TailwindCSS (frontend)
- node-cron (scheduling)

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
