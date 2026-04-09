const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/auctions.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS auction_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    platform TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    lot_number TEXT,
    vin TEXT,
    current_bid_usd REAL,
    estimated_final_usd REAL,
    buy_now_usd REAL,
    damage_type TEXT,
    damage_risk TEXT DEFAULT 'medium',
    mileage_miles INTEGER,
    condition TEXT,
    status TEXT DEFAULT 'live',
    sale_date TEXT,
    sale_timestamp INTEGER,
    location_state TEXT,
    location_country TEXT,
    seller_type TEXT,
    repair_estimate_usd REAL DEFAULT 0,
    ship_to_dubai_usd REAL DEFAULT 2800,
    uae_import_tax_usd REAL DEFAULT 0,
    dubai_market_price_usd REAL DEFAULT 0,
    estimated_profit_usd REAL DEFAULT 0,
    roi_percent REAL DEFAULT 0,
    is_avoid INTEGER DEFAULT 0,
    image_url TEXT,
    detail_url TEXT,
    scraped_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, lot_number)
  );

  CREATE TABLE IF NOT EXISTS sold_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    lot_number TEXT,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    final_bid_usd REAL,
    sale_date TEXT,
    damage_type TEXT,
    mileage_miles INTEGER,
    would_have_profit REAL,
    image_url TEXT,
    scraped_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, lot_number)
  );

  CREATE TABLE IF NOT EXISTS dubai_market_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    year_min INTEGER,
    year_max INTEGER,
    avg_price_usd REAL,
    min_price_usd REAL,
    max_price_usd REAL,
    sample_count INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(brand, model, year_min, year_max)
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lot_id INTEGER NOT NULL,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lot_id)
  );

  CREATE TABLE IF NOT EXISTS scrape_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    lots_found INTEGER DEFAULT 0,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_lots_brand ON auction_lots(brand);
  CREATE INDEX IF NOT EXISTS idx_lots_status ON auction_lots(status);
  CREATE INDEX IF NOT EXISTS idx_lots_profit ON auction_lots(estimated_profit_usd);
  CREATE INDEX IF NOT EXISTS idx_lots_roi ON auction_lots(roi_percent);
  CREATE INDEX IF NOT EXISTS idx_lots_damage_risk ON auction_lots(damage_risk);
  CREATE INDEX IF NOT EXISTS idx_lots_sale ON auction_lots(sale_timestamp);
  CREATE INDEX IF NOT EXISTS idx_sold_brand ON sold_history(brand);
  CREATE INDEX IF NOT EXISTS idx_sold_date ON sold_history(sale_date);
`);

// Prepared statements
const statements = {
  upsertLot: db.prepare(`
    INSERT INTO auction_lots (
      source, platform, brand, model, year, lot_number, vin,
      current_bid_usd, estimated_final_usd, buy_now_usd,
      damage_type, damage_risk, mileage_miles, condition, status,
      sale_date, sale_timestamp, location_state, location_country, seller_type,
      repair_estimate_usd, ship_to_dubai_usd, uae_import_tax_usd,
      dubai_market_price_usd, estimated_profit_usd, roi_percent, is_avoid,
      image_url, detail_url
    ) VALUES (
      @source, @platform, @brand, @model, @year, @lot_number, @vin,
      @current_bid_usd, @estimated_final_usd, @buy_now_usd,
      @damage_type, @damage_risk, @mileage_miles, @condition, @status,
      @sale_date, @sale_timestamp, @location_state, @location_country, @seller_type,
      @repair_estimate_usd, @ship_to_dubai_usd, @uae_import_tax_usd,
      @dubai_market_price_usd, @estimated_profit_usd, @roi_percent, @is_avoid,
      @image_url, @detail_url
    ) ON CONFLICT(source, lot_number) DO UPDATE SET
      current_bid_usd = @current_bid_usd,
      estimated_final_usd = @estimated_final_usd,
      status = @status,
      dubai_market_price_usd = @dubai_market_price_usd,
      estimated_profit_usd = @estimated_profit_usd,
      roi_percent = @roi_percent,
      is_avoid = @is_avoid,
      updated_at = CURRENT_TIMESTAMP
  `),

  upsertSold: db.prepare(`
    INSERT INTO sold_history (
      source, lot_number, brand, model, year,
      final_bid_usd, sale_date, damage_type, mileage_miles, would_have_profit, image_url
    ) VALUES (
      @source, @lot_number, @brand, @model, @year,
      @final_bid_usd, @sale_date, @damage_type, @mileage_miles, @would_have_profit, @image_url
    ) ON CONFLICT(source, lot_number) DO UPDATE SET
      final_bid_usd = @final_bid_usd,
      would_have_profit = @would_have_profit
  `),

  upsertDubaiPrice: db.prepare(`
    INSERT INTO dubai_market_prices (
      brand, model, year_min, year_max,
      avg_price_usd, min_price_usd, max_price_usd, sample_count
    ) VALUES (
      @brand, @model, @year_min, @year_max,
      @avg_price_usd, @min_price_usd, @max_price_usd, @sample_count
    ) ON CONFLICT(brand, model, year_min, year_max) DO UPDATE SET
      avg_price_usd = @avg_price_usd,
      min_price_usd = @min_price_usd,
      max_price_usd = @max_price_usd,
      sample_count = @sample_count,
      updated_at = CURRENT_TIMESTAMP
  `),

  logScrape: db.prepare(`
    INSERT INTO scrape_logs (source, status, lots_found, error_message, duration_ms)
    VALUES (@source, @status, @lots_found, @error_message, @duration_ms)
  `),

  getMarketPrice: db.prepare(`
    SELECT avg_price_usd FROM dubai_market_prices
    WHERE brand = @brand 
      AND LOWER(model) LIKE '%' || LOWER(@model) || '%'
      AND @year BETWEEN COALESCE(year_min, 0) AND COALESCE(year_max, 9999)
    LIMIT 1
  `),

  deleteOldLots: db.prepare(`
    DELETE FROM auction_lots
    WHERE status = 'sold' AND updated_at < datetime('now', '-7 days')
  `),

  addToWatchlist: db.prepare(`
    INSERT OR IGNORE INTO watchlist (lot_id) VALUES (?)
  `),

  removeFromWatchlist: db.prepare(`
    DELETE FROM watchlist WHERE lot_id = ?
  `),

  getWatchlist: db.prepare(`
    SELECT al.* FROM auction_lots al
    JOIN watchlist w ON al.id = w.lot_id
    ORDER BY al.sale_timestamp ASC
  `)
};

module.exports = { db, statements };
