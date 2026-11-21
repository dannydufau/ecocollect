'use strict';

// EcoPoints formulas (FR18).
// Volunteer: (3 x quantity) + (4 x estimatedWeightKg). Resident: volunteer / 2.
// Calculated in hundredths (whole numbers) to avoid floating-point errors.
// Formula text saved with each award and sent in events (contract 15.1).
const VOLUNTEER_FORMULA = '3 * quantity + 4 * estimatedWeightKg';
const RESIDENT_FORMULA = '(3 * quantity + 4 * estimatedWeightKg) / 2';


function toHundredths(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`expected a non-negative number, got ${value}`);
    }
    const hundreths = Math.round(value * 100);
if (Math.abs(value * 100 - hundreths) > 1e-6) {
    throw new Error (`expected at mostt 2 decimals, got ${value}`);
}
    return hundreths;
}

function volunteerHundredths(quantity, estimatedWeightKg) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`expected a whole quantity of at least 1, got ${quantity}`);
  }
  return 300 * quantity + 4 * toHundredths(estimatedWeightKg);
}

// The volunteer total in hundredths is always even, so the resident half is exact.
function deliveryPoints(quantity, estimatedWeightKg) {
  const volunteer = volunteerHundredths(quantity, estimatedWeightKg);
  return {
    volunteer: volunteer / 100,
    resident: volunteer / 2 / 100,
  };
}

module.exports = { VOLUNTEER_FORMULA, RESIDENT_FORMULA, toHundredths, deliveryPoints };