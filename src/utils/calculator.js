// Shipping costs by origin country (USD)
const SHIPPING_COSTS = {
  'USA': 2800,
  'US': 2800,
  'United States': 2800,
  'Japan': 1200,
  'JP': 1200,
  'Germany': 1500,
  'DE': 1500,
  'UK': 1800,
  'GB': 1800,
  'UAE': 0,
  'AE': 0,
  'default': 2500
};

// Repair estimates by damage type (USD) - SUPERCAR SPECIFIC
const REPAIR_ESTIMATES = {
  // Low risk
  'clean': 0,
  'normal wear': 7500,
  'minor dent': 7500,
  'scratches': 7500,
  'minor dents/scratches': 7500,
  
  // Medium risk
  'front end': 30000,
  'front': 30000,
  'rear end': 20000,
  'rear': 20000,
  'side': 18000,
  'left side': 18000,
  'right side': 18000,
  'left front': 25000,
  'right front': 25000,
  'left rear': 18000,
  'right rear': 18000,
  'theft recovery': 10000,
  'theft': 10000,
  'recovered theft': 10000,
  'undercarriage': 18000,
  'mechanical': 15000,
  'hail': 8000,
  'vandalism': 10000,
  
  // HIGH RISK - FLAG AS AVOID
  'all over': 999999,
  'flood': 999999,
  'burn': 999999,
  'fire': 999999,
  'water': 999999,
  'biohazard': 999999,
  'rollover': 999999,
  
  // Unknown
  'unknown': 25000,
  'default': 25000
};

// Damage risk categories
const DAMAGE_RISK = {
  'clean': 'low',
  'normal wear': 'low',
  'minor dent': 'low',
  'scratches': 'low',
  'hail': 'low',
  'front end': 'medium',
  'front': 'medium',
  'rear end': 'medium',
  'rear': 'medium',
  'side': 'medium',
  'theft recovery': 'medium',
  'undercarriage': 'medium',
  'mechanical': 'medium',
  'all over': 'avoid',
  'flood': 'avoid',
  'burn': 'avoid',
  'fire': 'avoid',
  'water': 'avoid',
  'biohazard': 'avoid',
  'rollover': 'avoid',
  'default': 'medium'
};

// Auction platform fees (percentage of hammer price)
const PLATFORM_FEES = {
  'copart': 0.22,
  'iaai': 0.22,
  'carfast': 0.15,
  'bidcars': 0.18,
  'carsfromwest': 0.15,
  'emirates': 0.10,
  'uss': 0.12,
  'taa': 0.12,
  'default': 0.18
};

// UAE import costs
const UAE_IMPORT = {
  DUTY_RATE: 0.05,      // 5% customs duty
  VAT_RATE: 0.05,       // 5% VAT
  INSURANCE_RATE: 0.005, // 0.5% marine insurance
  RTA_REGISTRATION: 1350,
  LOCAL_INSURANCE: 400,
  ADS_LISTING: 200
};

// AED conversion
const USD_TO_AED = 3.67;

function getShippingCost(country) {
  if (!country) return SHIPPING_COSTS['default'];
  const normalized = country.toUpperCase().trim();
  for (const [key, value] of Object.entries(SHIPPING_COSTS)) {
    if (normalized.includes(key.toUpperCase())) {
      return value;
    }
  }
  return SHIPPING_COSTS['default'];
}

function getRepairEstimate(damageType) {
  if (!damageType) return REPAIR_ESTIMATES['default'];
  const normalized = damageType.toLowerCase().trim();
  for (const [key, value] of Object.entries(REPAIR_ESTIMATES)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  return REPAIR_ESTIMATES['default'];
}

function getDamageRisk(damageType) {
  if (!damageType) return 'medium';
  const normalized = damageType.toLowerCase().trim();
  for (const [key, value] of Object.entries(DAMAGE_RISK)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  return 'medium';
}

function getPlatformFee(platform) {
  if (!platform) return PLATFORM_FEES['default'];
  const normalized = platform.toLowerCase().trim();
  return PLATFORM_FEES[normalized] || PLATFORM_FEES['default'];
}

/**
 * Estimate final bid based on current bid and days to sale
 */
function estimateFinalBid(currentBid, saleDate, status) {
  if (status === 'sold') return currentBid; // Already final
  
  if (!saleDate) {
    // Unknown date, assume 7+ days
    return currentBid * 1.6;
  }

  const now = new Date();
  const sale = new Date(saleDate);
  const daysToSale = Math.ceil((sale - now) / (1000 * 60 * 60 * 24));

  if (daysToSale > 7) {
    return Math.round(currentBid * 1.6);
  } else if (daysToSale >= 3) {
    return Math.round(currentBid * 1.8);
  } else {
    return Math.round(currentBid * 2.0);
  }
}

/**
 * Calculate full profit potential for Dubai resale
 */
function calculateProfit(lot, dubaiMarketPrice) {
  const currentBid = lot.current_bid_usd || 0;
  const estimatedFinal = lot.estimated_final_usd || estimateFinalBid(currentBid, lot.sale_date, lot.status);
  const platform = lot.platform || lot.source || 'default';
  const country = lot.location_country || 'USA';
  const damageType = lot.damage_type || 'unknown';

  // Get repair estimate
  const repairCost = lot.repair_estimate_usd || getRepairEstimate(damageType);
  
  // Check if should avoid
  const isAvoid = repairCost >= 999999;
  const actualRepairCost = isAvoid ? 80000 : repairCost;

  // 1. Auction costs
  const platformFeeRate = getPlatformFee(platform);
  const buyerFee = estimatedFinal * platformFeeRate;
  const inlandTransport = 800;
  const totalAuctionCost = estimatedFinal + buyerFee + inlandTransport;

  // 2. Shipping to Dubai
  const shippingCost = lot.ship_to_dubai_usd || getShippingCost(country);

  // 3. Marine insurance
  const insuranceCost = totalAuctionCost * UAE_IMPORT.INSURANCE_RATE;

  // 4. CIF value
  const cifValue = totalAuctionCost + actualRepairCost + shippingCost + insuranceCost;

  // 5. UAE Import taxes
  const customsDuty = cifValue * UAE_IMPORT.DUTY_RATE;
  const vat = (cifValue + customsDuty) * UAE_IMPORT.VAT_RATE;
  const totalImportTax = customsDuty + vat;

  // 6. Dubai fixed costs
  const dubaiFixedCosts = UAE_IMPORT.RTA_REGISTRATION + UAE_IMPORT.LOCAL_INSURANCE + UAE_IMPORT.ADS_LISTING;

  // 7. Total investment
  const totalCost = cifValue + totalImportTax + dubaiFixedCosts;

  // 8. Profit calculation
  const profit = dubaiMarketPrice - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

  return {
    currentBid,
    estimatedFinal,
    buyerFee: Math.round(buyerFee),
    inlandTransport,
    totalAuctionCost: Math.round(totalAuctionCost),
    repairCost: actualRepairCost,
    shippingCost,
    insuranceCost: Math.round(insuranceCost),
    cifValue: Math.round(cifValue),
    customsDuty: Math.round(customsDuty),
    vat: Math.round(vat),
    totalImportTax: Math.round(totalImportTax),
    dubaiFixedCosts,
    totalCost: Math.round(totalCost),
    dubaiMarketPrice,
    profit: Math.round(profit),
    profitAED: Math.round(profit * USD_TO_AED),
    roi: Math.round(roi * 10) / 10,
    isAvoid,
    damageRisk: getDamageRisk(damageType)
  };
}

/**
 * Parse price string to number
 */
function parsePrice(priceStr) {
  if (!priceStr) return 0;
  if (typeof priceStr === 'number') return priceStr;
  const cleaned = priceStr.toString().replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Parse mileage string to number
 */
function parseMileage(mileageStr) {
  if (!mileageStr) return 0;
  if (typeof mileageStr === 'number') return mileageStr;
  const cleaned = mileageStr.toString().replace(/[^0-9]/g, '');
  return parseInt(cleaned) || 0;
}

/**
 * Normalize brand name
 */
function normalizeBrand(brand) {
  if (!brand) return 'Unknown';
  const brandMap = {
    'ferrari': 'Ferrari',
    'lamborghini': 'Lamborghini',
    'mclaren': 'McLaren',
    'porsche': 'Porsche',
    'aston martin': 'Aston Martin',
    'aston': 'Aston Martin',
    'bentley': 'Bentley',
    'rolls-royce': 'Rolls-Royce',
    'rolls royce': 'Rolls-Royce',
    'mercedes': 'Mercedes-AMG',
    'mercedes-benz': 'Mercedes-AMG',
    'mercedes-amg': 'Mercedes-AMG',
    'amg': 'Mercedes-AMG'
  };
  const normalized = brand.toLowerCase().trim();
  return brandMap[normalized] || brand;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Random delay between min and max ms
 */
function randomDelay(min = 2000, max = 5000) {
  return sleep(Math.floor(Math.random() * (max - min + 1)) + min);
}

/**
 * Retry helper
 */
async function retry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`Retry ${i + 1}/${retries} after error: ${error.message}`);
      await sleep(delay * (i + 1));
    }
  }
}

/**
 * Random user agent
 */
function getRandomUserAgent() {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

module.exports = {
  SHIPPING_COSTS,
  REPAIR_ESTIMATES,
  DAMAGE_RISK,
  PLATFORM_FEES,
  UAE_IMPORT,
  USD_TO_AED,
  getShippingCost,
  getRepairEstimate,
  getDamageRisk,
  getPlatformFee,
  estimateFinalBid,
  calculateProfit,
  parsePrice,
  parseMileage,
  normalizeBrand,
  sleep,
  randomDelay,
  retry,
  getRandomUserAgent
};
