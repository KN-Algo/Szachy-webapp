console.log('[TEST] backend-integration.js załadowany');

window.addEventListener('DOMContentLoaded', () => {
  console.log('[TEST] typeof renderBoard:', typeof renderBoard);

  // ===============================
  // Pobranie stanu początkowego
  // ===============================

  fetch('http://localhost:8000/state')
    .then(res => res.json())
    .then(state => {
      boardState = fenToBoardState(state.fen);
      renderBoard(boardState);
    })
    .catch(err => {
      console.error('[API] Nie udało się pobrać stanu gry:', err);
    });

  // ===============================
  // Subskrypcja Mercure (tylko raz!)
  // ===============================

console.log('[Mercure] Testing EventSource support:', typeof EventSource !== 'undefined');

const mercureUrl = new URL('http://localhost:3000/.well-known/mercure');
mercureUrl.searchParams.append('topic', 'http://127.0.0.1:8000/chess/updates');

  console.log('[Mercure] ===== INITIALIZING CONNECTION =====');
  console.log('[Mercure] Full URL:', mercureUrl.toString());
  console.log('[Mercure] Topic:', mercureUrl.searchParams.get('topic'));

  const eventSource = new EventSource(mercureUrl, { withCredentials: false });
  

  console.log('[Mercure] EventSource created, readyState:', eventSource.readyState);

  eventSource.onopen = (event) => {
    console.log('[Mercure] ===== CONNECTION OPENED =====');
    console.log('[Mercure] Event:', event);
    console.log('[Mercure] ReadyState:', eventSource.readyState);
    console.log('[Mercure] URL used:', eventSource.url);
  };

  eventSource.onmessage = (event) => {
    console.log('[Mercure] ===== RAW EVENT =====');
    console.log('[Mercure] Raw event data:', event.data);
    console.log('[Mercure] Event type:', event.type);
    console.log('[Mercure] Event lastEventId:', event.lastEventId);
    
    try {
      const data = JSON.parse(event.data);
      console.log('[Mercure] ===== PARSED DATA =====');
      console.log('[Mercure] Parsed data:', data);
      console.log('[Mercure] Data type:', data.type);
      
      switch (data.type) {
        case 'possible_moves':
          console.log('[Mercure] ===== PROCESSING possible_moves =====');
          console.log('[Mercure] Position:', data.position);
          console.log('[Mercure] Moves:', data.moves);
          highlightPossibleMoves(data.position, data.moves);
          break;

        case 'move_confirmed':
          console.log('[Mercure] Processing move_confirmed');
          updateBoardFromBackend(data.state);
          break;

        case 'move_rejected':
          console.log('[Mercure] Processing move_rejected');
          showMoveRejected(data.reason);
          break;

        case 'state/update':
          console.log('[Mercure] Processing state/update');
          updateBoardFromBackend(data);
          break;

        default:
          console.log('[Mercure] ===== UNHANDLED MESSAGE TYPE =====');
          console.log('[Mercure] Type:', data.type);
          console.log('[Mercure] Full data:', data);
      }
    } catch (parseError) {
      console.error('[Mercure] Failed to parse JSON:', parseError);
      console.error('[Mercure] Raw data was:', event.data);
    }
  };

  eventSource.onerror = (error) => {
    console.error('[Mercure] ===== CONNECTION ERROR =====');
    console.error('[Mercure] Error:', error);
    console.error('[Mercure] ReadyState:', eventSource.readyState);
    console.error('[Mercure] URL:', mercureUrl.toString());
  };
});


// ===============================
// POST: Żądanie możliwych ruchów
// ===============================

function requestPossibleMoves(position) {
  fetch('http://localhost:8000/possible-moves', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ position }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.status === 'request_sent') {
        console.log('[API] Żądanie możliwych ruchów wysłane...');
      } else {
        console.error('[API] Błąd logiczny:', data.error);
        errorSound?.play?.();
      }
    })
    .catch((err) => {
      console.error('[API] Błąd sieci:', err);
      errorSound?.play?.();
    });
}


// ===============================
// Podświetlenie możliwych ruchów
// ===============================

function highlightPossibleMoves(origin, moves) {
  renderBoard(boardState);

  const originEl = document.querySelector(`.square[data-coord="${origin}"]`);
  if (originEl) originEl.classList.add('active');

  moves.forEach((coord) => {
    const el = document.querySelector(`.square[data-coord="${coord}"]`);
    if (el) el.classList.add('active');
  });
}


// ===============================
// Aktualizacja planszy z FEN
// ===============================

function updateBoardFromBackend(state) {
  if (!state?.fen) {
    console.warn('[Backend] Brak FEN w stanie:', state);
    return;
  }

  boardState = fenToBoardState(state.fen);
  selectedSquare = null;
  renderBoard(boardState);
}


// ===============================
// Obsługa odrzuconego ruchu
// ===============================

function showMoveRejected(reason) {
  console.warn('[Ruch odrzucony]', reason);
  errorSound?.play?.();
  selectedSquare = null;
  renderBoard(boardState);
}


// ===============================
// Parser FEN → boardState
// ===============================

function fenToBoardState(fen) {
  const board = {};
  const [positions] = fen.split(' ');
  const rows = positions.split('/');

  const pieceMap = {
    p: 'p', r: 'r', n: 'n', b: 'b', q: 'q', k: 'k',
  };

  const files = ['a','b','c','d','e','f','g','h'];

  rows.forEach((row, rIndex) => {
    let colIndex = 0;
    for (const char of row) {
      if (!isNaN(char)) {
        colIndex += parseInt(char);
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
