// extension/src/popup/components/risk-level.js

export function renderRiskLevelComponent(badgeEl, textEl, riskLevel, riskLabel) {
  const normRisk = String(riskLevel || 'MODERATE').toUpperCase().replace(/\s+/g, '_');

  if (badgeEl) {
    let displayLabel = riskLabel;
    if (!displayLabel) {
      if (normRisk === 'LOW' || normRisk === 'SAFE') displayLabel = 'Low Risk';
      else if (normRisk === 'MODERATE') displayLabel = 'Moderate Risk';
      else if (normRisk === 'HIGH') displayLabel = 'High Risk';
      else displayLabel = 'Very High Risk';
    }
    badgeEl.textContent = displayLabel;
    badgeEl.setAttribute('data-risk', normRisk.toLowerCase());
  }

  if (textEl) {
    let recLabel = 'Be Cautious';
    if (normRisk === 'LOW' || normRisk === 'SAFE') recLabel = 'Safe to Apply';
    else if (normRisk === 'MODERATE') recLabel = 'Be Cautious';
    else if (normRisk === 'HIGH') recLabel = 'High Risk';
    else if (normRisk === 'VERY_HIGH' || normRisk === 'CRITICAL') recLabel = 'Likely Scam';

    textEl.textContent = `Recommendation: ${recLabel}`;
  }
}
