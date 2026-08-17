// extension/src/popup/components/recommendation.js

export function renderRecommendationComponent(el, recommendationText) {
  if (!el) return;
  el.replaceChildren();

  const strong = document.createElement('strong');
  strong.textContent = 'Advice: ';

  el.append(strong, document.createTextNode(recommendationText || 'Exercise normal caution when applying.'));
}
