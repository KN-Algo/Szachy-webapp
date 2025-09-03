/**
 * backend-integration.js
 * Integracja frontendu (vanilla JS) z backendem (Symfony + MQTT + Mercure).
 *
 * Prawda o stanie gry przychodzi z backendu (FEN).
 * REST: http://localhost:8000  | Mercure SSE: http://localhost:3000
 * Dźwięki: move/capture przy confirmed/AI, error przy rejected, victory przy game_over.
 * Guard: przypadkowy START_FEN jest ignorowany, CHYBA że to świadomy reset (game_reset).
 */

console.log('[INIT] backend-integration.js załadowany');

/* ========================================================================== */
/*  USTAWIENIA                                                                */
/* ========================================================================== */

const PREVIEW_ENABLED = false; // optymistyczny podgląd – domyślnie off

// Adres backendu – możesz nadpisać w index.php: window.CHESS_BACKEND_URL = 'http://127.0.0.1:8000'
const API_BASE = (window.CHESS_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const api = (path) => `${API_BASE}${path}`;

// Bufory UI
window._lastUIMove = null;
window._previewTimeout = null;

// Dźwięki
try {
  window.moveSound    = window.moveSound    || new Audio('./assets/sounds/move.wav');
  window.captureSound = window.captureSound || new Audio('./assets/sounds/capture.wav');
  window.errorSound   = window.errorSound   || new Audio('./assets/sounds/error.wav');
  window.selectSound  = window.selectSound  || new Audio('./assets/sounds/select.wav');
} catch(_) {}

/* ========================================================================== */
/*  POMOCNIKI                                                                  */
/* ========================================================================== */

function statesEqual(a, b) {
  const aKeys = Object.keys(a || {});
  const bKeys = Object.keys(b || {});
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) if (a[k] !== b[k]) return false;
  return true;
}

function clearHighlights() {
  document
    .querySelectorAll('.square.active, .square.invalid, .square.move-target')
    .forEach(el => el.classList.remove('active', 'invalid', 'move-target'));
}

function fenToBoardState(fen) {
  const board = {};
  const [positions] = (fen || '').split(' ');
  const rows = (positions || '').split('/');
  const pieceMap = { p: 'p', r: 'r', n: 'n', b: 'b', q: 'q', k: 'k' };
  const files = ['a','b','c','d','e','f','g','h'];

  rows.forEach((row, rIndex) => {
    let colIndex = 0;
    for (const char of (row || '')) {
      if (!isNaN(char)) {
        colIndex += parseInt(char, 10);
      } else {
        const isWhite = char === char.toUpperCase();
        const pieceCode = (isWhite ? 'w' : 'b') + pieceMap[char.toLowerCase()];
        const square = files[colIndex] + (8 - rIndex);
        board[square] = pieceCode;
        colIndex++;
      }
    }
  });
  return board;
}

function getTeam(code) {
  return (window.getPieceTeam ? window.getPieceTeam(code) : (code?.[0] === 'w' ? 'w' : code?.[0] === 'b' ? 'b' : null));
}

function previewMove(from, to) {
  const prev = { ...(window.boardState || {}) };
  const moving = prev[from];
  if (!moving) return false;

  let capturedCode = null;
  if (prev[to]) {
    const mTeam = getTeam(moving);
    const tTeam = getTeam(prev[to]);
    if (mTeam && tTeam && mTeam !== tTeam) capturedCode = prev[to];
  }

  delete prev[from];
  prev[to] = moving;

  window.boardState = prev;
  renderBoard(window.boardState);

  if (capturedCode) {
    try { window.capturePiece?.(capturedCode); } catch(_) {}
    try { window.captureSound?.play?.(); } catch(_) {}
  } else {
    try { window.moveSound?.play?.(); } catch(_) {}
  }
  return true;
}

/* ===== DIFF „LICZENIOWY” ZBIĆ ===== */

function countPieces(board) {
  const cnt = Object.create(null);
  for (const sq in (board || {})) {
    const code = board[sq];
    cnt[code] = (cnt[code] || 0) + 1;
  }
  return cnt;
}

function diffCapturedByCount(prevBoard, nextBoard) {
  const prev = countPieces(prevBoard);
  const next = countPieces(nextBoard);
  const removed = [];
  const CODES = ['wp','wr','wn','wb','wq','wk','bp','br','bn','bb','bq','bk'];
  for (const code of CODES) {
    const d = (prev[code] || 0) - (next[code] || 0);
    for (let i = 0; i < d; i++) removed.push(code);
  }
  return removed;
}

function initialMissingPieces(nextBoard) {
  const start = {
    a1:'wr', b1:'wn', c1:'wb', d1:'wq', e1:'wk', f1:'wn', g1:'wb', h1:'wr',
    a2:'wp', b2:'wp', c2:'wp', d2:'wp', e2:'wp', f2:'wp', g2:'wp', h2:'wp',
    a8:'br', b8:'bn', c8:'bb', d8:'bq', e8:'bk', f8:'bn', g8:'bb', h8:'br',
    a7:'bp', b7:'bp', c7:'bp', d7:'bp', e7:'bp', f7:'bp', g7:'bp', h7:'bp',
  };
  return diffCapturedByCount(start, nextBoard);
}

/* ========================================================================== */
/*  BEZPIECZNIK „NIE RESETUJ DO STARTU”                                       */
/* ========================================================================== */

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let START_BOARD = null;
let gameStarted = false;
let allowResetToStart = false;

/** Zastosuj stan z backendu + wykryj bicie (z move) lub fallback liczeniowy */
function applyIncomingState(state, reason = 'update', move) {
  if (!state?.fen) {
    console.warn('[Backend] Brak FEN w stanie:', state);
    return;
  }

  const prev = { ...(window.boardState || {}) };
  const incoming = fenToBoardState(state.fen);

  if (!START_BOARD) START_BOARD = { ...(window.boardState || {}) };

  if (statesEqual(incoming, window.boardState)) {
    console.log('[STATE]', reason, '– bez zmian (pomijam render).');
    return;
  }

  const isStartBoard = statesEqual(incoming, START_BOARD);
  if (gameStarted && isStartBoard && !allowResetToStart) {
    console.warn('[STATE]', reason, '→ zignorowano FEN pozycji startowej (bez resetu).');
    return;
  }

  // Detekcja bicia (jeśli znamy move)
  let capturedCode = null;
  if (move && prev[move.to]) {
    const movingTeam = getTeam(prev[move.from]);
    const targetTeam = getTeam(prev[move.to]);
    if (movingTeam && targetTeam && movingTeam !== targetTeam) {
      capturedCode = prev[move.to];
    }
  }

  // Zastosuj stan i wyrenderuj
  window.boardState = incoming;
  window.selectedSquare = null;
  renderBoard(window.boardState);

  // Biciez move
  if (capturedCode) {
    try { window.capturePiece?.(capturedCode); } catch(_) {}
    try { window.captureSound?.play?.(); } catch(_) {}
  }

  // Fallback liczeniowy (odporny na specjalne ruchy)
  {
    let removed = diffCapturedByCount(prev, incoming); // ['bp','wn',...]
    if (capturedCode) {
      const i = removed.indexOf(capturedCode);
      if (i !== -1) removed.splice(i, 1);
    }
    if (removed.length) {
      removed.forEach(code => { try { window.capturePiece?.(code); } catch(_) {} });
      try { window.captureSound?.play?.(); } catch(_) {}
    }
  }

  // Flagi
  if (!isStartBoard) gameStarted = true;
  if (allowResetToStart && isStartBoard) {
    gameStarted = false;
    allowResetToStart = false;
  }
}

/* ========================================================================== */
/*  UI: Statusy / Tura / Log ruchów                                           */
/* ========================================================================== */

function setBadge(el, status, label) {
  if (!el) return;
  el.className = 'badge';
  const s = String(status||'').toLowerCase();
  if (s === 'ready' || s === 'healthy' || s === 'ok') el.classList.add('badge-ok');
  else if (s === 'thinking' || s === 'warning') el.classList.add('badge-warn');
  else if (s === 'error' || s === 'down') el.classList.add('badge-err');
  else el.classList.add('badge-muted');
  el.textContent = `${label}: ${status||'—'}`;
}

function updateTurnIndicator(turn){
  const el = document.getElementById('turn-indicator');
  if (!el) return;
  el.classList.toggle('white', turn === 'white');
  el.classList.toggle('black', turn === 'black');
  const label = el.querySelector('.label');
  if (label) label.textContent = (turn === 'white' ? 'Białe' : 'Czarne');
}

const MovesLog = (function(){
  const tbody = () => document.getElementById('moves-tbody');
  const data = [];
  let lastNo = 0;

  function toCellText(move, san){
    if (san && typeof san === 'string') return san;
    if (!move) return '';
    return `${(move.from||'').toLowerCase()}–${(move.to||'').toLowerCase()}`;
  }

  function add(move, color /* 'white'|'black' */, san){
    if (!move || !move.from || !move.to) return;
    if (color === 'white'){
      lastNo += 1;
      data.push({ no:lastNo, white: toCellText(move, san), black:'' });
    } else {
      if (!data.length) { lastNo = 1; data.push({ no:lastNo, white:'', black: toCellText(move, san) }); }
      else { data[data.length-1].black = toCellText(move, san); }
    }
    render();
  }

  function clear(){ data.length = 0; lastNo = 0; render(); }

  function render(){
    const tb = tbody(); if (!tb) return;
    const wrap = tb.parentElement;
    const stick = wrap ? (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 4) : false;

    tb.innerHTML = data.map(r=>`<tr><td>${r.no}</td><td>${r.white||''}</td><td>${r.black||''}</td></tr>`).join('');

    if (wrap && stick) wrap.scrollTop = wrap.scrollHeight;
  }

  return { add, clear };
})();

/* ========================================================================== */
/*  TŁO: Particles                                                             */
/* ========================================================================== */

function startParticles(){
  if (typeof window.resetCaptures === 'function') window.resetCaptures();
  const cvs = document.getElementById('bgParticles'); if (!cvs) return;
  const ctx = cvs.getContext('2d');
  let W=0, H=0, rafId=null, running=true;

  const dots = [];
  function resize(){
    W = cvs.width = window.innerWidth;
    H = cvs.height = window.innerHeight;
    const target = Math.round(W*H*0.00012);
    while(dots.length < target) dots.push(spawn());
    while(dots.length > target) dots.pop();
  }
  function spawn(){
    return {
      x: Math.random()*W, y: Math.random()*H,
      vx: (-0.2 + Math.random()*0.4), vy: (-0.2 + Math.random()*0.4),
      r: 0.6 + Math.random()*1.2,
      c: Math.random() < 0.5 ? 'rgba(255,242,240,0.35)' : 'rgba(13,110,253,0.28)'
    };
  }
  function step(){
    ctx.clearRect(0,0,W,H);
    for(const p of dots){
      p.x += p.vx; p.y += p.vy;
      if (p.x < -5) p.x = W+5; else if (p.x > W+5) p.x = -5;
      if (p.y < -5) p.y = H+5; else if (p.y > H+5) p.y = -5;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=p.c; ctx.fill();
    }
    for(let i=0;i<dots.length;i++){
      for(let j=i+1;j<dots.length;j++){
        const a=dots[i], b=dots[j];
        const dx=a.x-b.x, dy=a.y-b.y, d = Math.hypot(dx,dy);
        if (d<110){
          ctx.globalAlpha = 1 - (d/110);
          ctx.strokeStyle = 'rgba(13,110,253,0.25)';
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    if(running) rafId = requestAnimationFrame(step);
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', ()=>{ running = !document.hidden; if(running) step(); });
  resize(); step();
}

/* ========================================================================== */
/*  GAME OVER – modal + confetti + victory sound                               */
/* ========================================================================== */

const GO = (function () {
  const overlay = document.getElementById('gameOverOverlay');
  const title   = document.getElementById('goTitle');
  const sub     = document.getElementById('goSubtitle');
  const btnResume = document.getElementById('goResume');
  const btnReset  = document.getElementById('goReset');
  const canvas = document.getElementById('goConfetti');
  let ctx, W, H, particles = [];
  let gameEnded = false;
  let resumeArmed = false;
  let rafId = null;

  let victorySound = null;
  try { victorySound = new Audio('./assets/sounds/victory.wav'); } catch (_) {}
  function playVictory() {
    try {
      if (victorySound) { victorySound.currentTime = 0; victorySound.play(); }
      else { window.moveSound?.play?.(); }
    } catch(_) {}
  }

  function spawnConfetti(n = 160) {
    if (!canvas || !overlay) return;
    cancelAnimationFrame(rafId);
    W = canvas.width = overlay.clientWidth;
    H = canvas.height = overlay.clientHeight;
    ctx = canvas.getContext('2d');

    const g = 0.045;
    const wind = () => (Math.sin(performance.now() / 900) * 0.05);
    particles = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: -20 - Math.random() * 120,
      vx: -0.7 + Math.random() * 1.4, vy: 1.5 + Math.random() * 2.2,
      rot: Math.random() * Math.PI * 2, vr: (-0.12 + Math.random() * 0.24),
      s: 6 + Math.random() * 10, a: 1,
      c: Math.random() < 0.5 ? '#fff2f0' : '#0d6efd'
    }));

    const step = () => {
      const overlayActive = overlay.classList.contains('active');
      ctx.clearRect(0, 0, W, H);
      const w = wind();

      particles.forEach(p => {
        p.vx += w * 0.01; p.vy += g;
        p.x  += p.vx;     p.y  += p.vy;
        p.rot += p.vr;
        if (!overlayActive || p.y > H * 0.6) p.a -= 0.008;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.a);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s/2, -p.s/2, p.s, p.s);
        ctx.restore();
      });

      particles = particles.filter(p => p.a > 0 && p.y < H + 40 && p.x > -40 && p.x < W + 40);

      if (overlayActive || particles.length) rafId = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, W, H);
    };

    rafId = requestAnimationFrame(step);
  }

  function show({ winner, result }) {
    if (!overlay) return;

    gameEnded = true;
    resumeArmed = true;

    const kolor = winner === 'white' ? 'Biali' : winner === 'black' ? 'Czarni' : 'Nikt';
    const wynik = result === 'checkmate' ? 'szach mat'
                 : result === 'stalemate' ? 'pat'
                 : result === 'draw' ? 'remis'
                 : (result || '');
    if (title) title.textContent = 'Koniec gry';
    if (sub)   sub.textContent   = winner ? `${kolor} wygrali (${wynik})` : `Gra zakończona${wynik ? ` (${wynik})` : ''}`;

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    spawnConfetti();
    playVictory();

    if (btnResume) {
      btnResume.onclick = () => {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
      };
    }

    if (btnReset) {
      btnReset.onclick = async () => {
        try {
          const res = await fetch(api('/restart'), { method:'POST', headers:{ 'Content-Type':'application/json' }});
          console.debug('[RESET] /restart (modal) status:', res.status);
          if (!res.ok) throw new Error('Restart failed');
        } catch (e) {
          console.error(e);
        } finally {
          overlay.classList.remove('active');
          overlay.setAttribute('aria-hidden', 'true');
          gameEnded = false;
          resumeArmed = false;
        }
      };
    }
  }

  return {
    show,
    clearFlagsOnReset() {
      gameEnded = false;
      resumeArmed = false;
      cancelAnimationFrame(rafId);
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    hide() {
      if (!overlay) return;
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    },
  };
})();

/* ========================================================================== */
/*  START                                                                      */
/* ========================================================================== */

window.addEventListener('DOMContentLoaded', () => {
  // Tło
  startParticles();
  document.getElementById('captured-opponent')?.classList.add('no-dim');
  document.getElementById('captured-player')?.classList.add('no-dim');

  // Snapshot startu
  START_BOARD = { ...(window.boardState || {}) };
  gameStarted = false;
  allowResetToStart = false;

  // Reset – przycisk w panelu
  const btnReset = document.getElementById('btn-reset');
  if (btnReset) {
    btnReset.addEventListener('click', async ()=>{
      btnReset.disabled = true;
      try{
        const res = await fetch(api('/restart'), { method:'POST', headers:{ 'Content-Type':'application/json' }});
        console.debug('[RESET] /restart (panel) status:', res.status);
        if(!res.ok) throw new Error('Restart failed');
      }catch(e){ console.error(e); }
      finally{ btnReset.disabled = false; }
    });
  }

  // Pobierz stan początkowy
  fetch(api('/state'))
    .then(res => res.json())
    .then(state => {
      if (state && state.fen) {
        applyIncomingState(state, '/state');
        console.log('[API] Stan początkowy pobrany.');
        if (state?.turn) updateTurnIndicator(state.turn);

        // Jednorazowo uzupełnij „zbite” brakami względem startu (zimny start w środku partii)
        try {
          if (!window.__initialCapturesFilled) {
            const missing = initialMissingPieces(window.boardState);
            if (missing && missing.length) {
              window.resetCaptures?.();
              missing.forEach(code => window.capturePiece?.(code));
            }
            window.__initialCapturesFilled = true;
          }
        } catch(_) {}

      } else {
        console.warn('[API] /state bez pola fen – pomijam render.', state);
      }
    })
    .catch(err => {
      console.error('[API] Nie udało się pobrać stanu gry:', err);
    });

  // Mercure (SSE)
  const mercureUrl = new URL('http://localhost:3000/.well-known/mercure');
  mercureUrl.searchParams.append('topic', 'http://127.0.0.1:8000/chess/updates');
  const eventSource = new EventSource(mercureUrl, { withCredentials: false });

  eventSource.onopen  = () => console.log('[Mercure] ===== CONNECTION OPENED =====');
  eventSource.onerror = (error) => console.error('[Mercure] ===== CONNECTION ERROR =====', error);

  // Helpery do resetu po stronie eventów
  function _applyResetState(state){
    // Odblokuj guard – pozwól przyjąć FEN startowy
    allowResetToStart = true;

    // Czyszczenie UI
    try { if (typeof clearHighlights === 'function') clearHighlights(); } catch(_){}
    try { if (window.MovesLog?.clear) window.MovesLog.clear(); } catch(_){}
    try { if (typeof resetCaptures === 'function') resetCaptures(); } catch(_){}
    try { if (typeof updateTurnIndicator === 'function') updateTurnIndicator(state?.turn || 'white'); } catch(_){}

    // Wczytaj stan/FEN
    try { if (state) applyIncomingState(state, 'game_reset'); } catch(_){}

    // Zamknij modal końcowy
    try { GO.hide(); } catch(_){}

    try { window.selectSound?.play?.(); } catch(_){}
    console.log('[RESET] Zastosowano stan resetu (guard przepuszczony).');
  }

  function _looksLikeResetState(payload){
    const fen = payload?.fen || payload?.state?.fen;
    const moves = payload?.moves || payload?.state?.moves;
    const turn = payload?.turn || payload?.state?.turn;
    return fen === START_FEN && Array.isArray(moves) && moves.length === 0 && (turn === 'white' || !turn);
  }

  // Odbiór zdarzeń Mercure
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'possible_moves': {
          console.log('[Mercure] possible_moves:', data.position, data.moves);
          highlightPossibleMoves(data.position, data.moves || []);
          break;
        }

        case 'move_confirmed': {
          clearTimeout(window._previewTimeout); window._previewTimeout = null;

          // log + tura
          const nextTurn = data?.state?.turn; // tura PO ruchu
          const justMoved = nextTurn === 'black' ? 'white' : 'black';
          MovesLog.add(data.move, justMoved, data.san);
          if (nextTurn) updateTurnIndicator(nextTurn);

          // koniec gry
          const ended =
            data?.state?.game_ended === true ||
            ['checkmate','stalemate','draw'].includes(String(data?.state?.game_status || '').toLowerCase());
          if (ended) {
            const winner = data?.state?.winner || data?.winner;
            const result = (data?.state?.game_status || data?.result || '').toLowerCase();
            GO.show({ winner, result });
          }

          applyIncomingState(data.state, 'move_confirmed', data.move);
          try { window.moveSound?.play?.(); } catch (_) {}
          break;
        }

        case 'move_rejected': {
          clearTimeout(window._previewTimeout); window._previewTimeout = null;
          console.log('[Mercure] move_rejected:', data.reason);
          showMoveRejected(data.reason);
          break;
        }

        case 'state/update': {
          clearTimeout(window._previewTimeout); window._previewTimeout = null;

          // jeśli to startowy FEN i pusta historia, traktuj jak reset
          if (_looksLikeResetState(data)) {
            console.log('[Mercure] state/update wygląda jak reset → traktuję jak reset');
            _applyResetState(data);
            break;
          }

          if (data?.turn) updateTurnIndicator(data.turn);
          applyIncomingState(data, 'state/update'); // tu fallback liczeniowy, jeśli brak move
          break;
        }

        case 'raspi_status': {
          const el = document.getElementById('status-raspi');
          setBadge(el, data?.data?.status || 'unknown', 'RPi');
          console.log('[STATUS][RPi]', data?.data || {});
          break;
        }

        case 'engine_status': {
          const el = document.getElementById('status-engine');
          setBadge(el, data?.data?.status || 'unknown', 'Silnik');
          console.log('[STATUS][ENGINE]', data?.data || {});
          break;
        }

        case 'ai_move_executed': {
          clearTimeout(window._previewTimeout); window._previewTimeout = null;

          const nextTurn = data?.state?.turn;
          const justMoved = nextTurn === 'black' ? 'white' : 'black';
          MovesLog.add(data.move, justMoved, data.san);
          if (nextTurn) updateTurnIndicator(nextTurn);

          if (data?.state?.fen) applyIncomingState(data.state, 'ai_move_executed', data.move);
          try { window.moveSound?.play?.(); } catch (_) {}
          break;
        }

        case 'move_pending': {
          const from     = data?.move?.from;
          const to       = data?.move?.to;
          const fen      = data?.state?.fen || null;
          const physical = !!data?.physical;

          console.log('[Mercure] move_pending:', { from, to, physical, hasFen: !!fen });

          if (fen) {
            const incoming = fenToBoardState(fen);
            if (!statesEqual(incoming, window.boardState)) {
              applyIncomingState({ fen }, 'move_pending', data.move);
              break;
            }
            console.log('[STATE] move_pending: FEN = aktualny → rozważę preview.');
          }

          if (!PREVIEW_ENABLED) { console.log('[UI] Preview OFF – czekam na confirmed/state.'); break; }
          if (physical) { console.log('[UI] Ruch fizyczny – bez preview.'); break; }

          const uiMove = window._lastUIMove;
          const sameAsUI = uiMove && uiMove.from === from && uiMove.to === to;

          if (from && to && sameAsUI) {
            clearHighlights();
            const ok = previewMove(from, to);
            if (!ok) { console.warn('[UI] previewMove nie zadziałał.'); break; }

            clearTimeout(window._previewTimeout);
            window._previewTimeout = setTimeout(() => {
              fetch(api('/state'))
                .then(r => r.json())
                .then(s => s?.fen && applyIncomingState(s, 'preview_timeout'))
                .catch(()=>{});
            }, 5000);
          } else {
            console.log('[UI] move_pending nie dotyczy ostatniego ruchu UI.');
          }
          break;
        }

        case 'game_reset': {
          clearTimeout(window._previewTimeout); window._previewTimeout = null;
          console.log('[Mercure] game_reset:', data?.state);
          _applyResetState(data.state);
          break;
        }

        case 'log/update': {
          console.log('[LOG][UPDATE]', data);
          break;
        }

        case 'game_over': {
          const winner = data?.winner;
          const result = (data?.result || '').toLowerCase();
          GO.show({ winner, result });
          break;
        }

        default:
          console.log('[Mercure] ===== UNHANDLED MESSAGE TYPE =====', data.type, data);
      }
    } catch (e) {
      console.error('[Mercure] JSON parse error:', e, 'RAW:', event.data);
    }
  };
});

/* ========================================================================== */
/*  API: możliwe ruchy / wysłanie ruchu                                        */
/* ========================================================================== */

function requestPossibleMoves(position) {
  fetch(api('/possible-moves'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.status === 'request_sent') {
        console.log('[API] Żądanie możliwych ruchów wysłane...');
      } else {
        console.error('[API] Błąd logiczny:', data?.error);
        try { window.errorSound?.play?.(); } catch(_) {}
      }
    })
    .catch((err) => {
      console.error('[API] Błąd sieci:', err);
      try { window.errorSound?.play?.(); } catch(_) {}
    });
}

function sendMove(from, to) {
  window._lastUIMove = { from, to, ts: Date.now() };

  const moveKey = `${from}-${to}`;
  if (!window._pendingMoves) window._pendingMoves = new Set();
  if (window._pendingMoves.has(moveKey)) return;
  window._pendingMoves.add(moveKey);

  fetch(api('/move'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  })
    .then(async (res) => {
      let data = null;
      try { data = await res.json(); } catch(_) {}
      if (res.ok) {
        console.log('[API] Ruch wysłany:', moveKey, data?.status || '');
      } else {
        console.error('[API] Błąd /move:', data?.error || res.status);
        window.errorSound?.play?.();
      }
    })
    .catch((err) => {
      console.error('[API] Błąd sieci /move:', err);
      window.errorSound?.play?.();
    })
    .finally(() => {
      window._pendingMoves.delete(moveKey);
    });
}

/* ========================================================================== */
/*  Possible moves – podświetlenie / rejected                                   */
/* ========================================================================== */

function highlightPossibleMoves(origin, moves) {
  renderBoard(window.boardState);
  document.querySelectorAll('.square.active, .square.move-target').forEach(el => {
    el.classList.remove('active', 'move-target');
    el.onclick = null;
  });

  const originEl = document.querySelector(`.square[data-coord="${origin}"]`);
  if (originEl) originEl.classList.add('active');

  (moves || []).forEach((to) => {
    const el = document.querySelector(`.square[data-coord="${to}"]`);
    if (!el) return;
    el.classList.add('move-target', 'active');
    const handler = () => {
      try { window.selectSound?.play?.(); } catch (_) {}
      sendMove(origin, to);
    };
    el.addEventListener('click', handler, { once: true });
  });

  console.log(`[UI] Podświetlono ${moves?.length || 0} ruchów z ${origin}`);
}

function showMoveRejected(reason) {
  console.warn('[Ruch odrzucony]', reason);
  try { window.errorSound?.play?.(); } catch(_) {}
  window.selectedSquare = null;
  renderBoard(window.boardState);
}

/* ========================================================================== */
/*  CAPTURES → prawy panel                                                     */
/* ========================================================================== */

(function () {
  function rightContainers() {
    const opp = document.querySelector('#panel-col #captured-opponent');
    const me  = document.querySelector('#panel-col #captured-player');
    return { opp, me };
  }
  function pieceImgSrc(code) { return `./assets/pieces/${code}.png`; }

  window.capturePiece = function capturePiece(code) {
    const { opp, me } = rightContainers();
    if (!opp || !me || !code) return;

    const wrap = document.createElement('div');
    wrap.className = 'cap-wrap';

    const img = document.createElement('img');
    img.src = pieceImgSrc(code);
    img.alt = code;
    img.className = 'captured-piece ' + (code[0] === 'b' ? 'is-black' : 'is-white');
    img.draggable = false;

    wrap.appendChild(img);

    const target = code[0] === 'w' ? opp : me;
    target.appendChild(wrap);
  };

  window.resetCaptures = function resetCaptures() {
    const { opp, me } = rightContainers();
    if (opp) opp.innerHTML = '';
    if (me)  me.innerHTML  = '';
  };
})();

/* ========================================================================== */
/*  RESET: oba przyciski (panel + modal)                                       */
/* ========================================================================== */

// Delegowany handler – działa dla każdego elementu z atrybutem data-action="reset-game"
(function attachGlobalResetHandler(){
  if (window.__resetHandlerAttached) return;
  window.__resetHandlerAttached = true;

  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action="reset-game"]');
    if (!btn) return;

    ev.preventDefault();
    console.log('[RESET] Kliknięto przycisk resetu.');

    // Soft-clean UI, jeśli masz funkcję – nie jest obowiązkowe
    try { clearHighlights(); } catch(_){}
    try { MovesLog.clear(); } catch(_){}
    try { resetCaptures(); } catch(_){}
    try { updateTurnIndicator('white'); } catch(_){}

    // Wyślij żądanie do backendu
    try {
      const res = await fetch(api('/restart'), { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const txt = await res.text();
      console.debug('[RESET] /restart status:', res.status, 'body:', txt);
    } catch (e) {
      console.error('[RESET] Błąd /restart:', e);
      try { window.errorSound?.play?.(); } catch(_){}
    }
  });
})();
