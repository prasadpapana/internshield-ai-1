// shared/constants/risk-levels.js

export const RISK_BANDS = Object.freeze([
  { min: 80, max: 100, level: 'LOW', label: 'Low Risk', trustLabel: 'Looks legitimate' },
  { min: 60, max: 79, level: 'MODERATE', label: 'Moderate Risk', trustLabel: 'Probably fine' },
  { min: 40, max: 59, level: 'HIGH', label: 'High Risk', trustLabel: 'Be cautious' },
  { min: 0, max: 39, level: 'VERY_HIGH', label: 'Very High Risk', trustLabel: 'Likely scam' },
]);

export function getRiskLevelFromScore(score) {
  const safeScore = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  for (const band of RISK_BANDS) {
    if (safeScore >= band.min) return band.level;
  }
  return 'VERY_HIGH';
}
