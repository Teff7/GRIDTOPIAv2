/* Daily 5×5 Cryptic — refined game logic
 *
 * This script drives the 5×5 crossword game, incorporating
 * improvements from the single‑clue MVP. It builds the grid from
 * embedded JSON, handles navigation, hints, solution checking,
 * sharing and fireworks. The code avoids hard‑coded assumptions
 * about start squares, stops entry paths at blocks, and re‑shows
 * the tiny number overlays when letters are typed. Dropdowns are
 * fully accessible and the microcopy matches the humorous tone
 * defined in the design review.
 */

const GRID_SIZE = 5;
const gridEl      = document.getElementById('grid');
const clueTextEl  = document.getElementById('clueText');
const clueHeaderEl= document.getElementById('clueHeader');
const fireworksEl = document.getElementById('fireworks');
const hintMenu    = document.getElementById('hintMenu');
const btnHints    = document.getElementById('btnHints');

let puzzle      = null;
let cells       = [];
let letters     = Array(GRID_SIZE*GRID_SIZE).fill('');
let blocks      = new Set();
let entries     = [];
let cursor      = { index: 0, dir: 'across' };
let currentEntry= null;
let entryState  = new Map(); // entry id → { hintsUsed:boolean, solved:boolean, gaveUp:boolean }

/* Playful tooltip dictionary for device indicators */
const DEVICE_TOOLTIPS = {
  anagram:  'Anagram indicator — jumble the letters of the fodder.',
  hidden:   'Hidden‑word indicator — look inside the fodder.',
  container:'Container — put one thing inside another.',
  reversal: 'Reversal — read it backwards (look for “back”, “returned”, etc.).',
  deletion: 'Deletion — drop a bit (ends, firsts, middles—your clue will say).',
  homophone:'Homophone — sounds like it.',
  acrostic: 'Acrostic — take the first letters (spelled out in the clue).',
  charade:  'Charade — stack parts to build the whole.',
  double:   'Double definition — two straight meanings, one answer.',
  lit:      '“&lit” — the whole clue is both definition and wordplay. Spicy!'
};

/* Helpers */
const idx       = (r,c) => r*GRID_SIZE + c;
const inBounds  = (r,c) => r>=0 && r<GRID_SIZE && c>=0 && c<GRID_SIZE;
const opposite  = dir => dir === 'across' ? 'down' : 'across';
function rcFromIndex(i){ return { r: Math.floor(i/GRID_SIZE), c: i%GRID_SIZE }; }

function showModal(id, open){
  document.getElementById(id).hidden = !open;
}

function clearFireworks(){ fireworksEl.innerHTML = ''; }
function fireworks(){
  clearFireworks();
  for(let i=0; i<120; i++){
    const p = document.createElement('div');
    p.className = 'pixel';
    p.style.left = Math.random()*100 + 'vw';
    p.style.top  = Math.random()*100 + 'vh';
    fireworksEl.appendChild(p);
  }
  setTimeout(clearFireworks, 1500);
}

/* Welcome actions */
function startGame(){
  document.getElementById('welcome').hidden = true;
  document.getElementById('game').hidden    = false;
  document.getElementById('mobileInput').focus();
}
document.getElementById('btnPlay').addEventListener('click', startGame);
document.getElementById('btnHelp').addEventListener('click', () => showModal('helpModal', true));
document.getElementById('helpClose').addEventListener('click', () => showModal('helpModal', false));

// Back button: return to welcome
const btnBack = document.getElementById('btnBack');
if(btnBack){
  btnBack.addEventListener('click', () => {
    document.getElementById('game').hidden    = true;
    document.getElementById('welcome').hidden = false;
  });
}
// In-game help button
const btnHelpGame = document.getElementById('btnHelpGame');
if(btnHelpGame){
  btnHelpGame.addEventListener('click', () => showModal('helpModal', true));
}

/* Dropdown toggle */
btnHints.addEventListener('click', (e) => {
  e.stopPropagation();
  const parent = btnHints.parentElement;
  const isOpen = parent.classList.toggle('open');
  hintMenu.setAttribute('aria-hidden', String(!isOpen));
  btnHints.setAttribute('aria-expanded', String(isOpen));
});
// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if(!btnHints.contains(e.target) && !hintMenu.contains(e.target)){
    btnHints.parentElement.classList.remove('open');
    hintMenu.setAttribute('aria-hidden','true');
    btnHints.setAttribute('aria-expanded','false');
  }
});

/* Hint actions */
document.getElementById('hintDef').addEventListener('click', () => {
  if(!currentEntry) return;
  clueTextEl.classList.toggle('help-on');
  markHintUsed();
});
document.getElementById('hintAnalyse').addEventListener('click', () => {
  if(!currentEntry) return;
  clueTextEl.classList.toggle('annot-on');
  markHintUsed();
});
document.getElementById('hintLetter').addEventListener('click', () => {
  if(!currentEntry) return;
  revealALetter(currentEntry);
  markHintUsed();
});
document.getElementById('btnGiveUp').addEventListener('click', () => {
  if(!currentEntry) return;
  giveUp(currentEntry);
});
document.getElementById('btnShare').addEventListener('click', () => {
  const text = shareString();
  navigator.clipboard.writeText(text).then(() => {
    btnToast('Copied. Brag responsibly.');
  });
});

/* Input handling: keyboard and mobile */
document.addEventListener('keydown', (e) => {
  if(!currentEntry) return;
  // arrow movement
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();
    moveCursor(e.key);
    return;
  }
  if(e.key === 'Backspace'){
    e.preventDefault();
    setCellLetter(cursor.index, '');
    movePrev();
    return;
  }
  if(/^[a-zA-Z]$/.test(e.key)){
    setCellLetter(cursor.index, e.key.toUpperCase());
    moveNext();
    checkSolve(currentEntry);
  }
});
document.getElementById('mobileInput').addEventListener('input', e => {
  const ch = (e.data || e.target.value || '').toUpperCase().replace(/[^A-Z]/g,'');
  if(!ch) return;
  setCellLetter(cursor.index, ch[0]);
  e.target.value='';
  moveNext();
  checkSolve(currentEntry);
});

/* Cursor movement along an entry */
function movePrev(){
  const path = currentEntry.path;
  const i    = path.indexOf(cursor.index);
  if(i > 0){
    focusCell(path[i-1], currentEntry.dir);
  }
}
function moveNext(){
  const path = currentEntry.path;
  const i    = path.indexOf(cursor.index);
  if(i < path.length - 1){
    focusCell(path[i+1], currentEntry.dir);
  }
}
function moveCursor(arrow){
  const {r,c} = rcFromIndex(cursor.index);
  let nr=r, nc=c;
  if(arrow === 'ArrowLeft')  nc--;
  if(arrow === 'ArrowRight') nc++;
  if(arrow === 'ArrowUp')    nr--;
  if(arrow === 'ArrowDown')  nr++;
  if(inBounds(nr,nc) && !blocks.has(idx(nr,nc))){
    const targetIndex = idx(nr,nc);
    const entryAt = findEntryAt(targetIndex, cursor.dir) || findEntryAt(targetIndex, opposite(cursor.dir));
    if(entryAt){ selectEntry(entryAt, targetIndex); }
  }
}

/* Puzzle data is embedded directly to avoid fetch() CORS issues on file:// */
const PUZZLE_DATA = {
  "id": "2025-08-19",
  "grid": {
    "rows": 5,
    "cols": 5,
    "blocks": [[1,1], [1,3], [3,1], [3,3]],
    "numbers": {
      "all": [[0,0,"1"], [0,2,"2"], [0,4,"3"], [2,0,"2"], [4,0,"3"]]
    }
  },
  "entries": [
    {
      "id": "1A",
      "direction": "across",
      "row": 0,
      "col": 0,
      "answer": "DISCO",
      "clue": {
        "surface": "At first, did I seem cautious over a certain type of fever? (5)",
        "segments": [
          { "type": "indicator", "category": "acrostic", "text": "At first", "tooltip": "Acrostic indicator — take the first letters of the following words." },
          { "type": "fodder", "text": "did I seem cautious over", "tooltip": "😉 D id I S eem C autious O ver 😉" },
          { "type": "definition", "text": "a certain type of fever?", "tooltip": "Definition" }
        ]
      }
    },
    {
      "id": "2A",
      "direction": "across",
      "row": 2,
      "col": 0,
      "answer": "INANE",
      "clue": {
        "surface": "Win a necktie within (Boring!) (5)",
        "segments": [
          { "type": "indicator", "category": "hidden", "text": "within", "tooltip": "Hidden‑word indicator — look within the fodder." },
          { "type": "fodder", "text": "Win a necktie", "tooltip": "…w[ IN A NE ]cktie…" },
          { "type": "definition", "text": "(Boring!)", "tooltip": "Definition" }
        ]
      }
    },
    {
      "id": "3A",
      "direction": "across",
      "row": 4,
      "col": 0,
      "answer": "TAROT",
      "clue": {
        "surface": "Endlessly rotate and shuffle these cards (5)",
        "segments": [
          { "type": "indicator", "category": "deletion", "text": "Endlessly", "tooltip": "Delete the end of the next word." },
          { "type": "fodder", "text": "rotate", "tooltip": "ROTATE → ROTAT(e) after deletion" },
          { "type": "indicator", "category": "anagram", "text": "shuffle", "tooltip": "Anagram indicator — shuffle the letters." },
          { "type": "definition", "text": "these cards", "tooltip": "Definition" }
        ]
      }
    },
    {
      "id": "1D",
      "direction": "down",
      "row": 0,
      "col": 0,
      "answer": "DRIFT",
      "clue": {
        "surface": "Five hundred fight and then go with the tide. (5)",
        "segments": [
          { "type": "indicator", "category": "charade", "text": "—", "tooltip": "Charade — build the answer from parts." },
          { "type": "fodder", "text": "Five hundred", "tooltip": "Roman numeral: D = 500" },
          { "type": "fodder", "text": "fight", "tooltip": "RIFT = fight" },
          { "type": "definition", "text": "go with the tide", "tooltip": "Definition" }
        ]
      }
    },
    {
      "id": "2D",
      "direction": "down",
      "row": 0,
      "col": 2,
      "answer": "STAIR",
      "clue": {
        "surface": "A single step!, (&Lit) (5)",
        "segments": [
          { "type": "indicator", "category": "lit", "text": "A single step!", "tooltip": "“&lit” — the whole clue is both definition and wordplay." }
        ]
      }
    },
    {
      "id": "3D",
      "direction": "down",
      "row": 0,
      "col": 4,
      "answer": "OVERT",
      "clue": {
        "surface": "Over the top! (5) (&lit)",
        "segments": [
          { "type": "indicator", "category": "lit", "text": "Over the top!", "tooltip": "Over + T (top’s first letter) → OVERT; &lit." }
        ]
      }
    }
  ]
};

// Initialise puzzle and prepare number map for quick overlay
puzzle = PUZZLE_DATA;
puzzle.grid.numbers.allMap = {};
(puzzle.grid.numbers.all || []).forEach(([r,c,txt]) => {
  puzzle.grid.numbers.allMap[idx(r,c)] = txt;
});
document.getElementById('puzzleDate').textContent = puzzle.id || '';
buildGrid(puzzle);
buildEntries(puzzle);
// focus first across entry
{
  const e = entries.find(x => x.id === '1A');
  if(e) selectEntry(e, e.path[0]);
}

/* Build the grid: create DOM cells and attach number overlays */
function buildGrid(puz){
  blocks.clear();
  (puz.grid.blocks || []).forEach(([r,c]) => blocks.add(idx(r,c)));
  gridEl.innerHTML = '';
  cells = [];
  for(let r=0; r<GRID_SIZE; r++){
    for(let c=0; c<GRID_SIZE; c++){
      const i = idx(r,c);
      const cell = document.createElement('div');
      cell.className = 'cell' + (blocks.has(i) ? ' block' : '');
      cell.dataset.index = i;
      if(!blocks.has(i)){
        cell.tabIndex = 0;
        cell.addEventListener('click', () => onCellClick(i));
      }
      gridEl.appendChild(cell);
      cells.push(cell);
    }
  }
  // draw numbers using explicit lists (we ignore numbers.all to avoid duplicates)
  Object.entries(puz.grid.numbers || {}).forEach(([key,list]) => {
    if(key === 'all') return;
    list.forEach(([r,c,txt]) => {
      const i = idx(r,c);
      if(blocks.has(i)) return;
      const n = document.createElement('div');
      n.className = 'num';
      n.textContent = txt;
      cells[i].appendChild(n);
    });
  });
}

/* Build entry objects from puzzle definition, stopping at blocks */
function buildEntries(puz){
  entries = puz.entries.map(e => {
    const path = [];
    if(e.direction === 'across'){
      for(let c = e.col; c < GRID_SIZE && !blocks.has(idx(e.row, c)); c++){
        path.push(idx(e.row, c));
      }
    }else{
      for(let r = e.row; r < GRID_SIZE && !blocks.has(idx(r, e.col)); r++){
        path.push(idx(r, e.col));
      }
    }
    const obj = {
      id: e.id,
      dir: e.direction,
      answer: e.answer.toUpperCase(),
      row: e.row,
      col: e.col,
      clue: e.clue,
      path
    };
    entryState.set(obj.id, { hintsUsed:false, solved:false, gaveUp:false });
    return obj;
  });
}

/* Find an entry containing the given index and direction */
function findEntryAt(index, dir){
  return entries.find(e => e.dir === dir && e.path.includes(index));
}

/* Update cursor and highlight active cell */
function focusCell(index, dir){
  cursor = { index, dir };
  cells.forEach(c => c.classList.remove('active'));
  if(cells[index]) cells[index].classList.add('active');
  // refocus hidden input so mobile keyboard stays up
  document.getElementById('mobileInput').focus();
}

/* Select an entry and update the clue panel */
function selectEntry(entry, atIndex){
  currentEntry = entry;
  focusCell(atIndex ?? entry.path[0], entry.dir);
  renderClue(entry);
}

/* Cell click handler: toggle direction at start squares, else select entry */
function onCellClick(i){
  if(blocks.has(i)) return;
  const starting = entries.filter(e => e.path[0] === i);
  if(starting.length === 2){
    // if clicking again on the same start, toggle to the other direction
    if(currentEntry && currentEntry.path.includes(i)){
      const other = starting.find(e => e.dir !== currentEntry.dir);
      selectEntry(other, i);
      return;
    }
  }
  const entry = starting[0] || entries.find(e => e.path.includes(i));
  if(entry) selectEntry(entry, i);
}

/* Render the clue with annotated spans */
function renderClue(entry){
  clueTextEl.className = 'clue ' + primaryDevice(entry);
  clueTextEl.classList.remove('help-on','annot-on');
  clueHeaderEl.textContent = `${entry.id.replace('A',' Across').replace('D',' Down')} — ${entry.answer.length} letters`;
  const frag = document.createDocumentFragment();
  entry.clue.segments.forEach((seg,i) => {
    if(i > 0) frag.append(' ');
    const span = document.createElement('span');
    span.textContent = seg.text;
    span.className = seg.type;
    if(seg.type === 'indicator'){
      const tip = seg.tooltip || DEVICE_TOOLTIPS[seg.category] || '';
      span.dataset.tip = tip;
      span.classList.add(seg.category);
    }else{
      span.dataset.tip = seg.tooltip || (seg.type === 'fodder' ? 'Fodder — material to transform' : 'Definition');
    }
    frag.append(span);
  });
  clueTextEl.innerHTML = '';
  clueTextEl.appendChild(frag);
}

/* Determine the primary device category for colouring */
function primaryDevice(entry){
  const ind = entry.clue.segments.find(s => s.type === 'indicator');
  return ind?.category || '';
}

/* Set a letter in the grid and reapply number overlay */
function setCellLetter(i, ch){
  if(blocks.has(i)) return;
  letters[i] = (ch || '').toUpperCase();
  cells[i].textContent = letters[i] || '';
  // reapply small number overlay
  const number = puzzle.grid.numbers.allMap[i];
  if(number){
    const n = document.createElement('div');
    n.className = 'num';
    n.textContent = number;
    cells[i].appendChild(n);
  }
}

/* Check if an entry is solved */
function checkSolve(entry){
  const word = entry.path.map(i => letters[i] || '').join('');
  if(word.length === entry.answer.length && word === entry.answer){
    fireworks();
    const st = entryState.get(entry.id);
    if(st) st.solved = true;
  }
}

/* Reveal one random letter in the entry */
function revealALetter(entry){
  const st = entryState.get(entry.id);
  const empties = entry.path.filter(i => !(letters[i] || '').match(/[A-Z]/));
  if(!empties.length) return;
  const pick = empties[Math.floor(Math.random() * empties.length)];
  const pos  = entry.path.indexOf(pick);
  const ch   = entry.answer[pos];
  setCellLetter(pick, ch);
}

/* Reveal the entire answer for an entry */
function giveUp(entry){
  const st = entryState.get(entry.id);
  if(st) st.gaveUp = true;
  entry.path.forEach((i,pos) => setCellLetter(i, entry.answer[pos]));
}

function markHintUsed(){
  if(!currentEntry) return;
  const st = entryState.get(currentEntry.id);
  if(st) st.hintsUsed = true;
}

/* Lightweight toast for share feedback */
function btnToast(msg){
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed',
    bottom:'18px',
    left:'50%',
    transform:'translateX(-50%)',
    background:'#222',
    color:'#fff',
    padding:'.5rem .75rem',
    borderRadius:'10px',
    border:'1px solid #444',
    zIndex:9999,
    opacity:0
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => t.style.opacity = 1);
  setTimeout(() => {
    t.style.opacity = 0;
    setTimeout(() => t.remove(), 250);
  }, 1400);
}

/* Generate a shareable result string */
function shareString(){
  const grid = Array.from({length: GRID_SIZE}, () => Array(GRID_SIZE).fill('⬜'));
  (puzzle.grid.blocks || []).forEach(([r,c]) => { grid[r][c] = '⬛'; });
  entries.filter(e => e.dir === 'across').forEach(entry => {
    const st = entryState.get(entry.id);
    let glyph = '⬜';
    if(st?.gaveUp) glyph = '🟥';
    else if(st?.solved && st?.hintsUsed) glyph = '🟨';
    else if(st?.solved) glyph = '🟩';
    entry.path.forEach(i => {
      const {r,c} = rcFromIndex(i);
      if(grid[r][c] !== '⬛') grid[r][c] = glyph;
    });
  });
  const header = `Daily 5×5 Cryptic — ${puzzle.id}`;
  const rows   = grid.map(r => r.join('')).join('\n');
  return `${header}\n${rows}\n#cryptic`;
}