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

  const mercureUrl = new URL('http://localhost:3000/.well-known/mercure');
  mercureUrl.searchParams.append('topic', 'https://127.0.0.1:8000/chess/updates');

const source = new EventSource(mercureUrl.toString(), {
  withCredentials: true
});


  source.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('[Mercure]', data);

    switch (data.type) {
      case 'possible_moves':
        highlightPossibleMoves(data.position, data.moves);
        break;

      case 'move_confirmed':
        updateBoardFromBackend(data.state);
        break;

      case 'move_rejected':
        showMoveRejected(data.reason);
        break;

      case 'state/update':
        updateBoardFromBackend(data);
        break;

      default:
        console.log('[Mercure] Nieobsługiwany typ wiadomości:', data.type);
    }
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
