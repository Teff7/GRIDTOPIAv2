// script.js — wired to your current index.html
const FILE = 'Clues.json';
const CROSSWORD_ID = '000001';

// Elements
const welcome = document.getElementById('welcome');
const game = document.getElementById('game');
const gridEl = document.getElementById('grid');
const clueHeaderEl = document.getElementById('clueHeader');
const clueTextEl = document.getElementById('clueText');
const mobileInput = document.getElementById('mobileInput');
const btnPlay = document.getElementById('btnPlay');
const topMenuWrap = document.getElementById('topMenuWrap');
const btnMenu = document.getElementById('btnMenu');
const menuPanel = document.getElementById('menuPanel');
const menuHelp = document.getElementById('menuHelp');
const menuRestart = document.getElementById('menuRestart');
const hintDropdown = document.getElementById('hintDropdown');

// Help + Hints
const btnHelp = document.getElementById('btnHelp');
const btnHelpGame = document.getElementById('btnHelpGame');
const btnHelpBottom = document.getElementById('btnHelpBottom');
const helpModal = document.getElementById('helpModal');
const helpClose = document.getElementById('helpClose');

const btnHints = document.getElementById('btnHints');
const hintMenu = document.getElementById('hintMenu');
const btnHintDef = document.getElementById('hintDef');
const btnHintLetter = document.getElementById('hintLetter');
const btnHintAnalyse = document.getElementById('hintWordplay');

const btnBack = document.getElementById('btnBack');

// Additional controls
const btnGiveUp = document.getElementById('btnGiveUp');
const btnShare = document.getElementById('btnShare');

let puzzle = null;
let grid = [];
let cellMap = new Map();
let entries = [];
let currentEntry = null;
let activeCellKey = null;
let lastClickedCellKey = null;
const dirToggle = new Map();

const TIP = {
  acrostic: 'Take first letters.',
  hidden: 'Look within the fodder.',
  anagram: 'Shuffle the letters.',
  deletion: 'Remove letters.',
  charade: 'Build from parts.',
  lit: 'Whole clue is both definition and wordplay.'
};

function convertClues(puz, cwId){
  const clues = (puz.clues || []).filter(c => c.crossword === cwId);
  const blockSet = new Set((puz.grid.blocks || []).map(([r,c]) => key(r,c)));
  const nums = (puz.grid.numbers && puz.grid.numbers.all) || [];
  function findStart(num, dir){
    const label = String(num);
    for (const [r,c,lbl] of nums){
      if (lbl !== label) continue;
      if (dir === 'across' && (c === 0 || blockSet.has(key(r,c-1)))) return {row:r, col:c};
      if (dir === 'down' && (r === 0 || blockSet.has(key(r-1,c)))) return {row:r, col:c};
    }
    return {row:0, col:0};
  }
  return clues.map(c => {
    const dir = c.direction.toUpperCase() === 'A' ? 'across' : 'down';
    const start = findStart(c.number, dir);
    return {
      id: `${c.number} ${dir}`,
      direction: dir,
      row: start.row,
      col: start.col,
      answer: c.solution.toUpperCase(),
      clue: {
        surface: c.clue,
        clueType: c.clueType,
        segments: (c.tooltips || []).map(t => {
          if (t.type === 'definition') {
            return { type: 'definition', text: t.section, tooltip: t.text };
          } else if (t.type === 'fodder') {
            return { type: 'fodder', text: t.section, tooltip: t.text };
          } else {
            const cat = t.type === 'literally' ? 'lit' : t.type;
            return { type: 'indicator', category: cat, text: t.section, tooltip: t.text };
          }
        })
      }
    };
  });
}

function key(r,c){ return `${r},${c}`; }

// Exposed in HTML: onclick="startGame()"
function startGame(){
  // Use the hidden attribute, not style.display
  welcome.hidden = true;
  game.hidden = false;
  if (mobileInput) mobileInput.focus();
}
window.startGame = startGame;

// Wire Play immediately so it works even before data loads
if (btnPlay) btnPlay.addEventListener('click', startGame);

// Robust fallback: delegate click to handle dynamic or missed bindings
document.addEventListener('click', function(e){
  var target = e.target;
  if (!target) return;
  if (target.id === 'btnPlay' || (target.closest && target.closest('#btnPlay'))){
    startGame();
  }
});

// ----- Grid build -----
function buildGrid(){
  const { rows, cols, blocks = [], numbers = {} } = puzzle.grid;
  const blockSet = new Set(blocks.map(([r,c]) => key(r,c)));
  gridEl.innerHTML = '';
  grid = [];
  cellMap.clear();

  for (let r=0;r<rows;r++){
    const rowArr = [];
    for (let c=0;c<cols;c++){
      const k = key(r,c);
      const cell = { r,c, block:blockSet.has(k), letter:'', entries:[], el:document.createElement('div'), nums:[] };
      cell.el.className = 'cell' + (cell.block ? ' block' : '');
      cell.el.setAttribute('role','gridcell');
      if (!cell.block) cell.el.addEventListener('click', () => handleCellClick(k));
      gridEl.appendChild(cell.el);
      rowArr.push(cell);
      cellMap.set(k, cell);
    }
    grid.push(rowArr);
  }

  // Numbers (if present)
  const all = numbers.all || [];
  all.forEach(([r,c,label]) => {
    const cell = cellMap.get(key(r,c));
    if (!cell || cell.block) return;
    cell.nums.push(String(label));
    const numEl = document.createElement('div');
    numEl.className = 'num';
    numEl.textContent = String(label);
    cell.el.appendChild(numEl);
  });
}

function placeEntries(){
  entries = (puzzle.entries||[]).map(e => ({
    id: e.id,
    direction: e.direction, // 'across'|'down'
    row: e.row,
    col: e.col,
    answer: e.answer.toUpperCase(),
    clue: e.clue,
    cells: [],
    iActive: 0
  }));

  entries.forEach(ent => {
    for (let i=0;i<ent.answer.length;i++){
      const r = ent.row + (ent.direction==='down' ? i : 0);
      const c = ent.col + (ent.direction==='across' ? i : 0);
      const cell = cellMap.get(key(r,c));
      if (!cell || cell.block) continue;
      ent.cells.push(cell);
      cell.entries.push(ent);
    }
  });
}

function renderClue(ent){
  const segs = (ent.clue && ent.clue.segments) || [];
  let html;
  if (segs.length) {
    // Build annotated segments from the clue.
    // Each segment is wrapped in a span with a class corresponding to its type
    // and a data-tooltip attribute for the hover text.
    html = segs.map(seg => {
      const cls = seg.type === 'definition' ? 'def' : seg.type;
      // Use provided tooltip or fall back to generic hint based on category.
      const tip = seg.tooltip || TIP[seg.category] || '';
      return `<span class="${cls}" data-tooltip="${escapeHtml(tip)}">${escapeHtml(seg.text)}</span>`;
    }).join(' ');
    // Append enumeration (answer length) in parentheses at the end.
    const enumeration = ent.answer ? String(ent.answer.length) : '';
    if (enumeration) {
      html += ` (<span class="enumeration">${enumeration}</span>)`;
    }
  } else {
    // Use the clue surface as-is; it may already contain enumeration
    html = escapeHtml((ent.clue && ent.clue.surface) || '');
  }
  const dirLabel = ent.direction[0].toUpperCase() + ent.direction.slice(1);
  clueHeaderEl.textContent = `${ent.id} — ${dirLabel}`;
  const typeClass = ent.clue && ent.clue.clueType ? (ent.clue.clueType === 'literally' ? 'lit' : ent.clue.clueType) : '';
  clueTextEl.className = 'clue' + (typeClass ? ` ${typeClass}` : '');
  clueTextEl.innerHTML = html;
}

function renderLetters(){
  // First clear existing letter elements and remove active state
  grid.flat().forEach(cell => {
    // Remove any children that are not the number overlay
    [...cell.el.childNodes].forEach(n => {
      if (n.nodeType === 1 && n.classList.contains('num')) return;
      cell.el.removeChild(n);
    });
    cell.el.classList.remove('active');
  });
  // Render letters.  Instead of iterating through entries (which would
  // duplicate letters when a cell belongs to multiple entries), iterate
  // through every cell once.  For each cell with a letter, append a
  // single letter element.  This avoids the duplicated letters seen
  // when filling answers that cross.
  grid.flat().forEach(cell => {
    if (cell.letter) {
      const d = document.createElement('div');
      d.className = 'letter';
      d.style.display = 'grid';
      d.style.placeItems = 'center';
      d.style.width = '100%';
      d.style.height = '100%';
      d.style.fontWeight = '700';
      d.textContent = cell.letter;
      cell.el.appendChild(d);
    }
  });
  highlightActive();
}

function setCurrentEntry(ent, fromCellKey=null){
  currentEntry = ent;
  if (!ent) return;
  renderClue(ent);
  if (fromCellKey){
    const i = ent.cells.findIndex(c => key(c.r,c.c)===fromCellKey);
    ent.iActive = (i>=0 ? i : 0);
  } else if (ent.iActive==null){
    ent.iActive = 0;
  }
  const cell = ent.cells[ent.iActive];
  activeCellKey = key(cell.r,cell.c);
  renderLetters();
}

function highlightActive(){
  if (!currentEntry) return;
  const cell = currentEntry.cells[currentEntry.iActive];
  if (cell) cell.el.classList.add('active');
}

function handleCellClick(k){
  const cell = cellMap.get(k);
  if (!cell || cell.block) return;
  const belongs = cell.entries || [];
  if (!belongs.length) return;

  let pref = dirToggle.get(k) || 'across';
  if (lastClickedCellKey === k) pref = pref==='across' ? 'down' : 'across';
  lastClickedCellKey = k;

  const ent = belongs.find(e => e.direction===pref) || belongs[0];
  dirToggle.set(k, ent.direction);
  setCurrentEntry(ent, k);
}

function nextCell(inc){
  if (!currentEntry) return null;
  let i = currentEntry.iActive + inc;
  i = Math.max(0, Math.min(i, currentEntry.cells.length-1));
  currentEntry.iActive = i;
  const cell = currentEntry.cells[i];
  activeCellKey = key(cell.r,cell.c);
  return cell;
}

function typeChar(ch){
  if (!currentEntry) return;
  const cell = currentEntry.cells[currentEntry.iActive];
  cell.letter = ch.toUpperCase();
  nextCell(+1);
  renderLetters();
}

function backspace(){
  if (!currentEntry) return;
  const cell = currentEntry.cells[currentEntry.iActive];
  cell.letter = '';
  nextCell(-1);
  renderLetters();
}

function submitAnswer(){
  if (!currentEntry) return;
  const guess = currentEntry.cells.map(c => c.letter||' ').join('').toUpperCase();
  const target = currentEntry.answer.toUpperCase();
  if (guess === target){
    game.classList.add('flash-green');
    setTimeout(() => {
      game.classList.remove('flash-green');
      const idx = entries.indexOf(currentEntry);
      const next = entries[idx+1];
      if (next) setCurrentEntry(next); else finishGame();
    }, 650);
  } else {
    game.classList.add('flash-red');
    setTimeout(() => game.classList.remove('flash-red'), 450);
  }
}

function finishGame(){
  var fireworks = document.getElementById('fireworks');
  if (fireworks) fireworks.classList.add('on');
}

// ----- Help & hints & misc -----
function setupHandlers(){
  // Help modal open/close
  const openHelp = () => { helpModal.hidden = false; };
  const closeHelp = () => { helpModal.hidden = true; };
  if (btnHelp) btnHelp.addEventListener('click', openHelp);
  if (btnHelpGame) btnHelpGame.addEventListener('click', openHelp);
  if (btnHelpBottom) btnHelpBottom.addEventListener('click', openHelp);
  if (helpClose) helpClose.addEventListener('click', closeHelp);

  // Hints dropdown
  if (btnHints) btnHints.addEventListener('click', () => {
    const expanded = btnHints.getAttribute('aria-expanded') === 'true';
    btnHints.setAttribute('aria-expanded', String(!expanded));
    if (hintMenu) hintMenu.setAttribute('aria-hidden', String(expanded));
    if (hintDropdown){
      if (expanded) hintDropdown.classList.remove('open'); else hintDropdown.classList.add('open');
    }
  });
  if (btnHintDef) btnHintDef.addEventListener('click', () => {
    clueTextEl.classList.toggle('help-on');
  });
  if (btnHintLetter) btnHintLetter.addEventListener('click', () => {
    if (!currentEntry) return;
    const empties = currentEntry.cells.map((c,i)=>c.letter?null:i).filter(i=>i!==null);
    if (!empties.length) return;
    const idx = empties[Math.floor(Math.random()*empties.length)];
    currentEntry.cells[idx].letter = currentEntry.answer[idx];
    currentEntry.iActive = idx;
    activeCellKey = key(currentEntry.cells[idx].r, currentEntry.cells[idx].c);
    renderLetters();
  });
  if (btnHintAnalyse) btnHintAnalyse.addEventListener('click', () => {
    clueTextEl.classList.toggle('annot-on');
  });

  // Top Menu dropdown
  if (btnMenu) btnMenu.addEventListener('click', () => {
    const expanded = btnMenu.getAttribute('aria-expanded') === 'true';
    btnMenu.setAttribute('aria-expanded', String(!expanded));
    if (menuPanel) menuPanel.setAttribute('aria-hidden', String(expanded));
    if (topMenuWrap){
      if (expanded) topMenuWrap.classList.remove('open'); else topMenuWrap.classList.add('open');
    }
  });
  if (menuHelp) menuHelp.addEventListener('click', () => {
    if (helpModal) helpModal.hidden = false;
  });
  if (menuRestart) menuRestart.addEventListener('click', () => {
    restartGame();
    // close menu
    if (btnMenu) btnMenu.setAttribute('aria-expanded','false');
    if (menuPanel) menuPanel.setAttribute('aria-hidden','true');
    if (topMenuWrap) topMenuWrap.classList.remove('open');
  });

  // Reveal answer: fill the current entry with the correct letters and mark it as solved
  if (btnGiveUp) btnGiveUp.addEventListener('click', () => {
    if (!currentEntry) return;
    // Fill in all letters for the active entry
    currentEntry.cells.forEach((cell, idx) => {
      cell.letter = currentEntry.answer[idx];
    });
    renderLetters();
    submitAnswer();
  });

  // Share result: construct a simple textual representation of the grid and copy it to clipboard
  if (btnShare) btnShare.addEventListener('click', () => {
    if (!puzzle) return;
    // Build rows of the current grid for sharing
    const rows = [];
    for (let r = 0; r < grid.length; r++) {
      let row = '';
      for (let c = 0; c < grid[r].length; c++) {
        const cell = grid[r][c];
        if (cell.block) row += '⬛';
        else if (cell.letter) row += cell.letter;
        else row += '⬜';
      }
      rows.push(row);
    }
    const header = `Daily 5×5 Cryptic${puzzle.id ? ' ' + puzzle.id : ''}`;
    const shareText = header + '\n' + rows.join('\n');
    // Attempt to use the Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText).then(() => {
        alert('Copied your grid to the clipboard!');
      }).catch(err => {
        console.warn('Clipboard copy failed', err);
        alert('Unable to copy your results');
      });
    } else {
      // Fallback using a temporary textarea
      const temp = document.createElement('textarea');
      temp.value = shareText;
      temp.style.position = 'fixed';
      temp.style.top = '-1000px';
      document.body.appendChild(temp);
      temp.focus();
      temp.select();
      try {
        document.execCommand('copy');
        alert('Copied your grid to the clipboard!');
      } catch (e) {
        alert('Unable to copy your results');
      }
      document.body.removeChild(temp);
    }
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    const t = e.target;
    // Hints
    if (hintDropdown && !hintDropdown.contains(t)){
      if (hintDropdown.classList.contains('open')){
        hintDropdown.classList.remove('open');
        if (btnHints) btnHints.setAttribute('aria-expanded','false');
        if (hintMenu) hintMenu.setAttribute('aria-hidden','true');
      }
    }
    // Top menu
    if (topMenuWrap && !topMenuWrap.contains(t)){
      if (topMenuWrap.classList.contains('open')){
        topMenuWrap.classList.remove('open');
        if (btnMenu) btnMenu.setAttribute('aria-expanded','false');
        if (menuPanel) menuPanel.setAttribute('aria-hidden','true');
      }
    }
  });

  // Back
  if (btnBack) btnBack.addEventListener('click', () => {
    game.hidden = true;
    welcome.hidden = false;
  });

  // Typing
  if (mobileInput) mobileInput.addEventListener('input', e => {
    const char = e.data || e.target.value;
    if (/^[a-zA-Z]$/.test(char)) typeChar(char);
    e.target.value = '';
  });
  document.addEventListener('keydown', e => {
    if (/^[a-zA-Z]$/.test(e.key)) typeChar(e.key);
    else if (e.key === 'Backspace'){ e.preventDefault(); backspace(); }
    else if (e.key === 'Enter'){ submitAnswer(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp'){ nextCell(-1); renderLetters(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown'){ nextCell(+1); renderLetters(); }
  });
}
function restartGame(){
  // Clear all letters and reset to the first entry
  entries.forEach(ent => ent.cells.forEach(c => { c.letter = ''; }));
  setCurrentEntry(entries[0]);
  renderLetters();
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
  ));
}

// ----- Boot -----
window.addEventListener('load', () => {
  // Set up UI handlers immediately
  setupHandlers();

  // 1) Try inline JSON first (most reliable on static hosts)
  let inlineLoaded = false;
  const inline = document.getElementById('puzzleData');
  if (inline && inline.textContent) {
    try {
      const parsed = JSON.parse(inline.textContent);
      const converted = convertClues(parsed, CROSSWORD_ID);
      if (converted.length) {
        puzzle = parsed;
        puzzle.entries = converted;
        inlineLoaded = true;
      }
    } catch (e) {
      console.error('Inline JSON parse failed', e);
    }
  }
  if (inlineLoaded) {
    puzzle.entries = convertClues(puzzle, CROSSWORD_ID);
    buildGrid();
    placeEntries();
    setCurrentEntry((puzzle.entries || [])[0]);
    return;
  }
  // 2) Fallback to fetching the file relative to this location
  fetch(FILE)
    .then(r => {
      if (!r.ok) throw new Error(`Failed to load ${FILE}: ${r.status}`);
      return r.json();
    })
    .then(json => {
      puzzle = json;
      puzzle.entries = convertClues(puzzle, CROSSWORD_ID);
      buildGrid();
      placeEntries();
      setCurrentEntry((puzzle.entries || [])[0]);
    })
    .catch(err => {
      console.warn('All data sources failed, using tiny placeholder:', err);
      // Final fallback so UI still works even if JSON is invalid
      puzzle = {
        grid: { rows: 5, cols: 5, blocks: [] },
        entries: [{ id: '1A', direction: 'across', row: 0, col: 0, answer: 'HELLO', clue: { surface: 'Wave politely (5)' } }]
      };
      buildGrid();
      placeEntries();
      setCurrentEntry(puzzle.entries[0]);
    });
});
