// extension/src/popup/components/score.js

export function renderScoreComponent(el, targetScore) {
  if (!el) return;
  const score = Math.max(0, Math.min(100, Math.round(targetScore || 0)));

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    el.textContent = String(score);
    return;
  }

  const dur = 900;
  const start = performance.now();

  function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(score * eased));
    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
