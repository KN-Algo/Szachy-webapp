/**
 * backend-integration.js
 * Integracja frontendu (vanilla JS) z backendem (Symfony + MQTT + Mercure).
 *
 * Zasady:
 * - ZERO zmian w HTML/CSS.
 * - Nie zmieniamy protokołu ani endpointów (localhost).
 * - Dźwięki: moveSound przy potwierdzonych ruchach (web/AI), errorSound przy odrzuceniach.
 * - Bezpiecznik: po rozpoczęciu gry NIE akceptujemy przypadkowego FEN pozycji startowej
 *   (chyba że przyjdzie event `game_reset`).
 * - NOWE: detekcja bicia na podstawie eventu z polem { move:{from,to} } → dodaj do placeholdera.
 */

console.log('[INIT] backend-integration.js załadowany');

// ===============================
// Pomocniki
// ===============================
function statesEqual(a, b) {
  const aKeys = Object.keys(a || {});
  const bKeys = Object.keys(b || {});
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) if (a[k] !== b[k]) return false;
  return true;
}

function clearHighlights() {
  document.querySelectorAll('.square.active, .square.invalid')
    .forEach(el => el.classList.remove('active', 'invalid'));
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

// fallback gdyby window.getPieceTeam nie było jeszcze zdefiniowane
function getTeam(code) {
  return (window.getPieceTeam ? window.getPieceTeam(code) : (code?.[0] === 'w' ? 'w' : code?.[0] === 'b' ? 'b' : null));
}

// ===============================
// Bezpiecznik "nie resetuj do startu"
// ===============================
let START_BOARD = null;         // snapshot pozycji startowej (z frontu)
let gameStarted = false;
let allowResetToStart = false;

/**
 * Zastosuj stan z backendu (zabezpiecz przed cofnięciem do startu).
 * Dodatkowo: jeśli przekazano `move`, spróbuj wykryć bicie i dodać figurę do placeholdera.
 *
 * @param {{fen:string}} state
 * @param {string} reason
 * @param {{from:string, to:string}|undefined} move
 */
function applyIncomingState(state, reason = 'update', move) {
  if (!state?.fen) {
    console.warn('[Backend] Brak FEN w stanie:', state);
    return;
  }

  const prev = { ...(window.boardState || {}) };
  const incoming = fenToBoardState(state.fen);

  if (!START_BOARD) START_BOARD = { ...(window.boardState || {}) };

  // 1) nic się nie zmieniło → nie renderujemy
  if (statesEqual(incoming, window.boardState)) {
    console.log('[STATE]', reason, '– bez zmian (pomijam render).');
    return;
  }

  // 2) ochrona przed przypadkowym powrotem do startu
  if (gameStarted && statesEqual(incoming, START_BOARD) && !allowResetToStart) {
    console.warn('[STATE]', reason, '→ zignorowano FEN pozycji startowej (bez resetu).');
    return;
  }

  // 3) DETEKCJA BICIA (tylko jeśli znamy ruch {from,to})
  //    klasyczne bicie: na polu "to" była figura przeciwnika w poprzednim stanie.
  let capturedCode = null;
  if (move && prev[move.to]) {
    const movingTeam = getTeam(prev[move.from]);
    const targetTeam = getTeam(prev[move.to]);
    if (movingTeam && targetTeam && movingTeam !== targetTeam) {
      capturedCode = prev[move.to]; // to właśnie zbiliśmy
    }
  }
  // Uwaga: en passant/promotion – na razie pomijamy, bo protokół nie precyzuje.

  // 4) zastosuj nowy stan i narysuj
  window.boardState = incoming;
  window.selectedSquare = null;
  renderBoard(window.boardState);

  // 5) placeholder + dźwięk, jeśli było bicie
  if (capturedCode) {
    try { window.capturePiece?.(capturedCode); } catch(_) {}
    try { window.captureSound?.play?.(); } catch(_) {}
  }

  // 6) zaktualizuj flagi
  const isStart = statesEqual(window.boardState, START_BOARD);
  if (!isStart) gameStarted = true;
  if (allowResetToStart && isStart) {
    gameStarted = false;
    allowResetToStart = false;
  }
}

// ===============================
// Start: po załadowaniu DOM
// ===============================
window.addEventListener('DOMContentLoaded', () => {
  console.log('[BOOT] typeof renderBoard:', typeof renderBoard);

  START_BOARD = { ...(window.boardState || {}) };
  gameStarted = false;
  allowResetToStart = false;

  // 1) pobierz /state
  fetch('http://localhost:8000/state')
    .then(res => res.json())
    .then(state => {
      if (state && state.fen) {
        applyIncomingState(state, '/state');
        console.log('[API] Stan początkowy pobrany.');
      } else {
        console.warn('[API] /state bez pola fen – pomijam render.', state);
      }
    })
    .catch(err => {
      console.error('[API] Nie udało się pobrać stanu gry:', err);
    });

  // 2) Mercure (SSE)
  console.log('[Mercure] EventSource support:', typeof EventSource !== 'undefined');
  const mercureUrl = new URL('http://localhost:3000/.well-known/mercure');
  mercureUrl.searchParams.append('topic', 'http://127.0.0.1:8000/chess/updates');
  console.log('[Mercure] ===== INITIALIZING CONNECTION =====');
  console.log('[Mercure] URL:', mercureUrl.toString());

  const eventSource = new EventSource(mercureUrl, { withCredentials: false });

  eventSource.onopen = () => {
    console.log('[Mercure] ===== CONNECTION OPENED =====');
  };

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
          console.log('[Mercure] move_confirmed');
          // przekazujemy też data.move, by wykryć bicie
          applyIncomingState(data.state, 'move_confirmed', data.move);
          try { window.moveSound?.play?.(); } catch (_) {}
          break;
        }
        case 'move_rejected': {
          console.log('[Mercure] move_rejected:', data.reason);
          showMoveRejected(data.reason);
          break;
        }
        case 'state/update': {
          console.log('[Mercure] state/update');
          applyIncomingState(data, 'state/update'); // bez move – nie próbujemy wykrywać bicia
          break;
        }
        case 'raspi_status': {
          const status = data?.data?.status || 'unknown';
          console.log('[STATUS][RPi]', status, data?.data || {});
          break;
        }
        case 'engine_status': {
          const status = data?.data?.status || 'unknown';
          console.log('[STATUS][ENGINE]', status, data?.data || {});
          break;
        }
        case 'ai_move_executed': {
          console.log('[AI] move_executed:', data?.move);
          if (data?.state?.fen) applyIncomingState(data.state, 'ai_move_executed', data.move);
          try { window.moveSound?.play?.(); } catch (_) {}
          break;
        }
        case 'move_pending': {
          console.log('[Mercure] move_pending:', data?.move, 'physical =', data?.physical);
          break;
        }
        case 'game_reset': {
          console.log('[Mercure] game_reset');
          allowResetToStart = true; // świadomie pozwalamy na powrót do startu
          if (data?.state?.fen) applyIncomingState(data.state, 'game_reset');
          break;
        }
        case 'log/update': {
          console.log('[LOG][UPDATE]', data);
          break;
        }
        default: {
          console.log('[Mercure] ===== UNHANDLED MESSAGE TYPE =====', data.type, data);
        }
      }
    } catch (parseError) {
      console.error('[Mercure] JSON parse error:', parseError, 'RAW:', event.data);
    }
  };

  eventSource.onerror = (error) => {
    console.error('[Mercure] ===== CONNECTION ERROR =====', error);
  };

  // 3) (opcjonalne) przyciski testowe
  const btnState = document.getElementById('test-state');
  if (btnState) {
    btnState.addEventListener('click', () => {
      fetch('http://localhost:8000/state')
        .then(r => r.json())
        .then(s => { if (s?.fen) applyIncomingState(s, '/state (manual)'); })
        .catch(e => console.error('[TEST:/state] ERROR', e));
    });
  }

  const btnLog = document.getElementById('test-log');
  if (btnLog) {
    btnLog.addEventListener('click', () => {
      fetch('http://localhost:8000/log')
        .then(r => r.json().catch(()=>r.text()))
        .then(payload => console.log('[TEST:/log] OK', payload))
        .catch(e => console.error('[TEST:/log] ERROR', e));
    });
  }
});

// ===============================
// API: żądanie możliwych ruchów
// ===============================
function requestPossibleMoves(position) {
  fetch('http://localhost:8000/possible-moves', {
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

// ===============================
// UI: podświetlenie możliwych ruchów (bez pełnego renderu)
// ===============================
function highlightPossibleMoves(origin, moves) {
  clearHighlights();
  const originEl = document.querySelector(`.square[data-coord="${origin}"]`);
  if (originEl) originEl.classList.add('active');
  (moves || []).forEach((coord) => {
    const el = document.querySelector(`.square[data-coord="${coord}"]`);
    if (el) el.classList.add('active');
  });
}

// ===============================
// UI: odrzucony ruch
// ===============================
function showMoveRejected(reason) {
  console.warn('[Ruch odrzucony]', reason);
  try { window.errorSound?.play?.(); } catch(_) {}
  window.selectedSquare = null;
  renderBoard(window.boardState);
}
