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

  for (const item of items.slice(0, 10)) {
    const li = document.createElement('li');
    if (typeof item === 'string') {
      li.textContent = item;
    } else if (item && typeof item === 'object') {
      const desc = item.description || item.label || item.type || 'Flagged signal';
      if (item.severity) {
        const span = document.createElement('span');
        span.className = `signal-tag signal-tag--${String(item.severity).toLowerCase()}`;
        span.textContent = `[${item.severity}] `;
        li.appendChild(span);
        li.appendChild(document.createTextNode(desc));
      } else {
        li.textContent = desc;
      }
    }
    ul.appendChild(li);
  }
}
