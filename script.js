function renderClue(ent){
  const surface = (ent.clue && ent.clue.surface) || '';
  const segs = (ent.clue && ent.clue.segments) || [];
  let html = surface;
  // Apply highlights in order, only for the first occurrence
  segs.forEach(seg => {
    const cls = seg.type === 'definition' ? 'def' : seg.type;
    const tip = seg.tooltip || TIP[seg.type] || '';
    const regex = new RegExp(escapeRegExp(seg.text));
    html = html.replace(regex, `<span class="${cls}" data-tooltip="${escapeHtml(tip)}">${escapeHtml(seg.text)}</span>`);
  });
  const enumeration = ent.answer ? String(ent.answer.length) : '';
  if (enumeration){
    html += ` (<span class="enumeration">${enumeration}</span>)`;
  }
  const dirLabel = ent.direction[0].toUpperCase() + ent.direction.slice(1);
  clueHeaderEl.textContent = `${ent.id} — ${dirLabel}`;
  const typeClass = ent.clue && ent.clue.clueType ? (ent.clue.clueType === 'literally' ? 'lit' : ent.clue.clueType) : '';
  clueTextEl.className = 'clue' + (typeClass ? ` ${typeClass}` : '');
  clueTextEl.innerHTML = html;
}

// Utility to escape RegExp special chars
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\\]\]/g, '\\$&');
}

// Utility to escape HTML
function escapeHtml(string) {
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/>/g, '&gt;')
    .replace(/</g, '&lt;');
}