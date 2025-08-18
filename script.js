// script.js — wired to index.html + style.css IDs/classes
// Uses Clues.json (grid + entries)

const FILE = 'Clues.json';

// Elements matching index.html
const welcome = document.getElementById('welcome');
const game = document.getElementById('game');
const gridEl = document.getElementById('grid');
const clueTextEl = document.getElementById('clueText');
const clueHeaderEl = document.getElementById('clueHeader');
const mobileInput = document.getElementById('mobileInput');

// Hint buttons that exist in index.html
const btnHintDef = document.getElementById('hintDef');
const btnHintLetter = document.getElementById('hintLetter');
const btnHintAnalyse = document.getElementById('hintAnalyse');

let puzzle = null;
let grid = [];          // 2D cells: {r,c,block,el,letter,nums:[], entries:[]}
let cellMap = new Map();// "r,c" -> cell
let entries = [];       // [{id,direction,row,col,answer,clue,cells:[], iActive}]
let currentEntry = null;
let activeCellKey = null;
let lastClickedCellKey = null;
let toggleDirectionHint = new Map();

const TOOLTIP_FALLBACK = {
  acrostic: 'Take first letters.',
  hidden: 'Look inside the fodder.',
  anagram: 'Shuffle the letters.',
  deletion: 'Remove letters.',
  charade: 'Build from parts.',
  lit: 'Whole clue is definition & wordplay.'
};

function key(r, c){ return `${r},${c}`; }

function startGame(){
  // Hide welcome, show game (remove @hidden, not just display)
  if (welcome) welcome.hidden = true;
  if (game) game.hidden = false;
  mobileInput?.focus();
}
window.startGame = startGame; // expose to onclick in HTML

function buildGrid(){
  const rows = puzzle.grid.rows;
  const cols = puzzle.grid.cols;
  const blocks = new Set((puzzle.grid.blocks || []).map(([r,c]) => key(r,c)));

  grid = [];
  cellMap.clear();
  gridEl.innerHTML = '';

  for (let r = 0; r < rows; r++){
    const rowArr = [];
    for (let c = 0; c < cols; c++){
      const k = key(r,c);
      const isBlock = blocks.has(k);
      const cell = {
        r, c,
        block: isBlock,
        letter: '',
        nums: [],
        entries: [],
        el: document.createElement('div')
      };
      cell.el.className = 'cell' + (isBlock ? ' block' : '');
      cell.el.setAttribute('role', 'gridcell');

      if (!isBlock){
        cell.el.addEventListener('click', () => handleCellClick(k));
      }
      gridEl.appendChild(cell.el);
      rowArr.push(cell);
      cellMap.set(k, cell);
    }
    grid.push(rowArr);
  }

  // Place numbers
  const numsAll = (puzzle.grid.numbers?.all || []);
  numsAll.forEach(([r,c,label]) => {
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
  entries = (puzzle.entries || []).map(e => ({
    id: e.id,
    direction: e.direction, // 'across' | 'down'
    row: e.row,
    col: e.col,
    answer: e.answer.toUpperCase(),
    clue: e.clue,
    cells: [],
    iActive: 0
  }));

  // Map each entry to its cells
  entries.forEach(ent => {
    const len = ent.answer.length;
    for (let i = 0; i < len; i++){
      const r = ent.row + (ent.direction === 'down' ? i : 0);
      const c = ent.col + (ent.direction === 'across' ? i : 0);
      const cell = cellMap.get(key(r,c));
      if (!cell || cell.block) continue;
      ent.cells.push(cell);
      cell.entries.push(ent);
    }
  });
}

function renderClue(ent){
  const segs = ent.clue?.segments || [];
  const html = segs.map(s => {
    const cls = s.type === 'definition' ? 'def' : s.type; // map to CSS class names
    const tip = s.tooltip || TOOLTIP_FALLBACK[s.category] || '';
    return `<span class="${cls}" data-tip="${escapeHtml(tip)}">${escapeHtml(s.text)}</span>`;
  }).join(' ');

  const cat = segs.find(s => s.category)?.category || '';
  clueTextEl.className = 'clue ' + cat;
  clueTextEl.innerHTML = html || escapeHtml(ent.clue?.surface || '');

  // Header like "1A — across"
  const dirLabel = ent.direction[0].toUpperCase() + ent.direction.slice(1);
  clueHeaderEl.textContent = `${ent.id} — ${dirLabel}`;
}

function renderLetters(){
  // Clear letters but preserve numbers
  grid.flat().forEach(cell => {
    // Remove everything except .num
    [...cell.el.childNodes].forEach(n => {
      if (!(n.nodeType === 1 && n.classList.contains('num'))) cell.el.removeChild(n);
    });
    // Active styling reset
    cell.el.classList.remove('active');
  });

  // Write current letters
  entries.forEach(ent => {
    ent.cells.forEach((cell, i) => {
      const ch = cell.letter || '';
      if (ch){
        cell.el.appendChild(makeCentered(ch));
      }
    });
  });

  highlightActive();
}

function makeCentered(txt){
  const d = document.createElement('div');
  d.style.width = '100%';
  d.style.height = '100%';
  d.style.display = 'grid';
  d.style.placeItems = 'center';
  d.style.fontWeight = '700';
  d.textContent = txt;
  return d;
}

function setCurrentEntry(ent, fromCellKey = null){
  currentEntry = ent;
  if (!currentEntry) return;

  renderClue(currentEntry);

  if (fromCellKey){
    const idx = currentEntry.cells.findIndex(c => key(c.r,c.c) === fromCellKey);
    currentEntry.iActive = idx >= 0 ? idx : 0;
  } else if (!activeCellKey){
    currentEntry.iActive = 0;
  }
  const cell = currentEntry.cells[currentEntry.iActive];
  activeCellKey = key(cell.r, cell.c);

  renderLetters();
}

function highlightActive(){
  if (!currentEntry) return;
  currentEntry.cells.forEach((cell, i) => {
    if (key(cell.r,cell.c) === activeCellKey){
      cell.el.classList.add('active');
    }
  });
}

function handleCellClick(k){
  const cell = cellMap.get(k);
  if (!cell || cell.block) return;
  const belongs = cell.entries || [];
  if (!belongs.length) return;

  // Toggle across/down on repeated clicks at same cell
  let preferred = toggleDirectionHint.get(k) || 'across';
  if (lastClickedCellKey === k){
    preferred = (preferred === 'across') ? 'down' : 'across';
  }
  lastClickedCellKey = k;

  const ent = belongs.find(e => e.direction === preferred) || belongs[0];
  toggleDirectionHint.set(k, ent.direction);

  setCurrentEntry(ent, k);
}

function nextCell(inc){
  if (!currentEntry) return null;
  let i = currentEntry.iActive + inc;
  i = Math.max(0, Math.min(i, currentEntry.cells.length - 1));
  currentEntry.iActive = i;
  const cell = currentEntry.cells[i];
  activeCellKey = key(cell.r, cell.c);
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
  const guess = currentEntry.cells.map(c => (c.letter || ' ')).join('').toUpperCase();
  const target = currentEntry.answer.toUpperCase();

  if (guess === target){
    game.classList.add('flash-green');
    setTimeout(() => {
      game.classList.remove('flash-green');
      const idx = entries.indexOf(currentEntry);
      const next = entries[idx + 1];
      if (next) setCurrentEntry(next);
      else finishGame();
    }, 800);
  } else {
    game.classList.add('flash-red');
    setTimeout(() => game.classList.remove('flash-red'), 600);
  }
}

function finishGame(){
  document.getElementById('fireworks')?.classList.add('on');
}

function setupHandlers(){
  // Hints
  btnHintDef?.addEventListener('click', () => {
    // Toggle definition highlight
    clueTextEl.classList.toggle('help-on');
  });

  btnHintLetter?.addEventListener('click', () => {
    if (!currentEntry) return;
    const empties = currentEntry.cells
      .map((c, i) => (c.letter ? null : i))
      .filter(i => i !== null);
    if (!empties.length) return;
    const idx = empties[Math.floor(Math.random() * empties.length)];
    currentEntry.cells[idx].letter = currentEntry.answer[idx];
    currentEntry.iActive = idx;
    activeCellKey = key(currentEntry.cells[idx].r, currentEntry.cells[idx].c);
    renderLetters();
  });

  btnHintAnalyse?.addEventListener('click', () => {
    // Toggle colour + tooltips for indicator/fodder
    clueTextEl.classList.toggle('annot-on');
  });

  // Typing: desktop + hidden mobile input
  mobileInput?.addEventListener('input', e => {
    const char = e.data || e.target.value;
    if (/^[a-zA-Z]$/.test(char)) typeChar(char);
    e.target.value = '';
  });

  document.addEventListener('keydown', e => {
    if (/^[a-zA-Z]$/.test(e.key)){
      typeChar(e.key);
    } else if (e.key === 'Backspace'){
      e.preventDefault();
      backspace();
    } else if (e.key === 'Enter'){
      submitAnswer();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp'){
      nextCell(-1); renderLetters();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown'){
      nextCell(+1); renderLetters();
    }
  });
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
  ));
}

// Boot
window.addEventListener('load', () => {
  fetch(FILE)
    .then(r => {
      if (!r.ok) throw new Error(`Failed to load ${FILE}: ${r.status}`);
      return r.json();
    })
    .then(json => {
      puzzle = json;          // expects {grid, entries}
      buildGrid();            // builds 5×5 and numbers
      placeEntries();         // maps entries to cells
      setCurrentEntry(entries[0]); // select first entry
      setupHandlers();
    })
    .catch(err => {
      console.error(err);
      // Safe fallback
      puzzle = {
        grid: { rows: 1, cols: 5, blocks: [], numbers: { all: [[0,0,'1']] } },
        entries: [{
          id: '1A', direction: 'across', row: 0, col: 0,
          answer: 'HELLO',
          clue: { surface: 'Wave politely (5)', segments: [] }
        }]
      };
      buildGrid();
      placeEntries();
      setCurrentEntry(entries[0]);
      setupHandlers();
    });
});
