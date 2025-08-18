// script.js — wired to your current index.html
const FILE = 'Clues.json';

// Elements
const welcome = document.getElementById('welcome');
const game = document.getElementById('game');
const gridEl = document.getElementById('grid');
const clueHeaderEl = document.getElementById('clueHeader');
const clueTextEl = document.getElementById('clueText');
const mobileInput = document.getElementById('mobileInput');
const btnPlay = document.getElementById('btnPlay');

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
const btnHintAnalyse = document.getElementById('hintAnalyse');

const btnBack = document.getElementById('btnBack');

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

function key(r,c){ return `${r},${c}`; }

// Exposed in HTML: onclick="startGame()"
function startGame(){
  // Use the hidden attribute, not style.display
  welcome.hidden = true;
  game.hidden = false;
  mobileInput?.focus();
}
window.startGame = startGame;

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
  const segs = ent.clue?.segments || [];
  const html = segs.length
    ? segs.map(s => {
        const cls = s.type === 'definition' ? 'def' : s.type;
        const tip = s.tooltip || TIP[s.category] || '';
        return `<span class="${cls}" data-tooltip="${escapeHtml(tip)}">${escapeHtml(s.text)}</span>`;
      }).join(' ')
    : escapeHtml(ent.clue?.surface || '');
  const dirLabel = ent.direction[0].toUpperCase() + ent.direction.slice(1);
  clueHeaderEl.textContent = `${ent.id} — ${dirLabel}`;
  clueTextEl.className = 'clue';
  clueTextEl.innerHTML = html;
}

function renderLetters(){
  grid.flat().forEach(cell => {
    // keep numbers
    [...cell.el.childNodes].forEach(n => {
      if (!(n.nodeType===1 && n.classList.contains('num'))) cell.el.removeChild(n);
    });
    cell.el.classList.remove('active');
  });
  entries.forEach(ent => {
    ent.cells.forEach(cell => {
      if (cell.letter){
        const d = document.createElement('div');
        d.style.display='grid'; d.style.placeItems='center';
        d.style.width='100%'; d.style.height='100%';
        d.style.fontWeight='700';
        d.textContent = cell.letter;
        cell.el.appendChild(d);
      }
    });
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
  document.getElementById('fireworks')?.classList.add('on');
}

// ----- Help & hints & misc -----
function setupHandlers(){
  // Play button
  btnPlay?.addEventListener('click', startGame);

  // Help modal open/close
  const openHelp = () => { helpModal.hidden = false; };
  const closeHelp = () => { helpModal.hidden = true; };
  btnHelp?.addEventListener('click', openHelp);
  btnHelpGame?.addEventListener('click', openHelp);
  btnHelpBottom?.addEventListener('click', openHelp);
  helpClose?.addEventListener('click', closeHelp);

  // Hints dropdown
  btnHints?.addEventListener('click', () => {
    const expanded = btnHints.getAttribute('aria-expanded') === 'true';
    btnHints.setAttribute('aria-expanded', String(!expanded));
    hintMenu?.setAttribute('aria-hidden', String(expanded));
  });
  btnHintDef?.addEventListener('click', () => {
    clueTextEl.classList.toggle('help-on');
  });
  btnHintLetter?.addEventListener('click', () => {
    if (!currentEntry) return;
    const empties = currentEntry.cells.map((c,i)=>c.letter?null:i).filter(i=>i!==null);
    if (!empties.length) return;
    const idx = empties[Math.floor(Math.random()*empties.length)];
    currentEntry.cells[idx].letter = currentEntry.answer[idx];
    currentEntry.iActive = idx;
    activeCellKey = key(currentEntry.cells[idx].r, currentEntry.cells[idx].c);
    renderLetters();
  });
  btnHintAnalyse?.addEventListener('click', () => {
    clueTextEl.classList.toggle('annot-on');
  });

  // Back
  btnBack?.addEventListener('click', () => {
    game.hidden = true;
    welcome.hidden = false;
  });

  // Typing
  mobileInput?.addEventListener('input', e => {
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

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
  ));
}

// ----- Boot -----
window.addEventListener('load', () => {
  fetch(FILE)
    .then(r => { if (!r.ok) throw new Error(`Failed to load ${FILE}: ${r.status}`); return r.json(); })
    .then(json => {
      puzzle = json;
      buildGrid();
      placeEntries();
      setCurrentEntry((puzzle.entries||[])[0]);
      setupHandlers();
    })
    .catch(err => {
      console.error(err);
      // Fallback so UI still works even if JSON is invalid
      puzzle = {
        grid: { rows: 5, cols: 5, blocks: [] },
        entries: [{ id:'1A', direction:'across', row:0, col:0, answer:'HELLO', clue:{ surface:'Wave politely (5)'} }]
      };
      buildGrid(); placeEntries(); setCurrentEntry(puzzle.entries[0]); setupHandlers();
    });
});
