// extension/src/popup/components/risk-level.js

export function renderRiskLevelComponent(badgeEl, textEl, riskLevel, riskLabel) {
  if (badgeEl) {
    badgeEl.textContent = riskLabel || 'Moderate Risk';
    badgeEl.setAttribute('data-risk', riskLevel || 'medium');
  }

  if (textEl) {
    let recLabel = 'Safe';
    if (riskLevel === 'safe' || riskLevel === 'low') recLabel = 'Safe to Apply';
    else if (riskLevel === 'medium') recLabel = 'Be Cautious';
    else if (riskLevel === 'high') recLabel = 'High Risk';
    else if (riskLevel === 'critical') recLabel = 'Likely Scam';

    textEl.textContent = `Recommendation: ${recLabel}`;
  }
}
