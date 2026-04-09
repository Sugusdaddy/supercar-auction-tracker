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

// Repair estimates by damage type (USD)
const REPAIR_ESTIMATES = {
  'clean': 0,
  'normal wear': 500,
  'minor dents/scratches': 1500,
  'front end': 8000,
  'rear end': 6000,
  'side': 5000,
  'undercarriage': 4000,
  'hail': 3000,
  'flood': 15000,
  'vandalism': 3000,
  'mechanical': 7000,
  'burn': 25000,
  'rollover': 20000,
  'biohazard': 8000,
  'all over': 18000,
  'default': 5000
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

function getPlatformFee(platform) {
  if (!platform) return PLATFORM_FEES['default'];
  const normalized = platform.toLowerCase().trim();
  return PLATFORM_FEES[normalized] || PLATFORM_FEES['default'];
}

/**
 * Calculate full profit potential for Dubai resale
 * @param {Object} lot - Auction lot data
 * @param {number} dubaiMarketPrice - Expected sell price in Dubai (USD)
 * @returns {Object} - Calculated costs and profit
 */
function calculateProfit(lot, dubaiMarketPrice) {
  const bidPrice = lot.estimated_final_usd || lot.current_bid_usd || 0;
  const platform = lot.platform || lot.source || 'default';
  const country = lot.location_country || 'USA';
  const damageType = lot.damage_type || 'default';

  // 1. Auction costs
  const platformFeeRate = getPlatformFee(platform);
  const buyerFee = bidPrice * platformFeeRate;
  const inlandTransport = 800; // Transport to port in USA
  const totalAuctionCost = bidPrice + buyerFee + inlandTransport;

  // 2. Repair estimate
  const repairCost = lot.repair_estimate_usd || getRepairEstimate(damageType);

  // 3. Shipping to Dubai
  const shippingCost = lot.ship_to_dubai_usd || getShippingCost(country);

  // 4. Marine insurance
  const insuranceCost = totalAuctionCost * UAE_IMPORT.INSURANCE_RATE;

  // 5. CIF (Cost, Insurance, Freight) value
  const cifValue = totalAuctionCost + repairCost + shippingCost + insuranceCost;

  // 6. UAE Import taxes
  const customsDuty = cifValue * UAE_IMPORT.DUTY_RATE;
  const vat = (cifValue + customsDuty) * UAE_IMPORT.VAT_RATE;
  const totalImportTax = customsDuty + vat;

  // 7. Dubai fixed costs
  const dubaiFixedCosts = UAE_IMPORT.RTA_REGISTRATION + UAE_IMPORT.LOCAL_INSURANCE + UAE_IMPORT.ADS_LISTING;

  // 8. Total investment
  const totalCost = cifValue + totalImportTax + dubaiFixedCosts;

  // 9. Profit calculation
  const profit = dubaiMarketPrice - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

  return {
    bidPrice,
    buyerFee: Math.round(buyerFee),
    inlandTransport,
    totalAuctionCost: Math.round(totalAuctionCost),
    repairCost,
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
    roi: Math.round(roi * 10) / 10
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

module.exports = {
  SHIPPING_COSTS,
  REPAIR_ESTIMATES,
  PLATFORM_FEES,
  UAE_IMPORT,
  getShippingCost,
  getRepairEstimate,
  getPlatformFee,
  calculateProfit,
  parsePrice,
  parseMileage,
  normalizeBrand,
  sleep,
  retry
};
