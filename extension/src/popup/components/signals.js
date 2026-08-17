// extension/src/popup/components/signals.js

export function renderSignalsComponent(posUl, negUl, positives, negatives) {
  renderList(posUl, positives, 'No strong positive signals found.');
  renderList(negUl, negatives, 'No red flags detected.');
}

function renderList(ul, items, emptyMsg) {
  if (!ul) return;
  ul.replaceChildren();

  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.className = 'findlist__empty';
    li.textContent = emptyMsg;
    ul.appendChild(li);
    return;
  }

  for (const item of items.slice(0, 8)) {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  }
}
