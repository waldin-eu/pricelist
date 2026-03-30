// Price calculator utility functions

/**
 * Rounds a number to 2 decimal places
 * @param {number} n - The number to round
 * @returns {string} The rounded number as a string with 2 decimals
 */
function round2(n) {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

/**
 * Calculates the final price with discount
 * Formula: final = brutto / ((100 + VAT)/100) * ((100 - discount)/100)
 * @param {number} brutto - The brutto price in EUR
 * @param {number} vat - The VAT percentage (e.g., 23 for 23%)
 * @param {number} discount - The discount percentage (e.g., 10 for 10%)
 * @returns {string|null} The final price as a string with 2 decimals, or null if invalid
 */
function calculateFinalPrice(brutto, vat = 0, discount = 0) {
  const bruttoNum = parseFloat(brutto);
  const vatNum = parseFloat(vat) || 0;
  const discountNum = parseFloat(discount) || 0;

  if (!Number.isFinite(bruttoNum)) {
    return null;
  }

  const finalPrice = bruttoNum / ((100 + vatNum) / 100) * ((100 - discountNum) / 100);
  return round2(finalPrice);
}

/**
 * Calculates discount price for a brutto price with default VAT
 * @param {number} bruttoPrice - The brutto price
 * @param {number} discountPercent - The discount percentage
 * @returns {string|null} The discount price, or null if invalid
 */
function calculateDiscountPrice(bruttoPrice, discountPercent = 0) {
  return calculateFinalPrice(bruttoPrice, 0, discountPercent);
}
