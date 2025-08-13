console.log('[Chessboard] Plansza załadowana.');

// ===============================
//  DŹWIĘKI INTERFEJSU
// ===============================
const moveSound = new Audio('./assets/sounds/move.wav');
const captureSound = new Audio('./assets/sounds/capture.wav');
const errorSound = new Audio('./assets/sounds/error.wav');
const selectSound = new Audio('./assets/sounds/select.wav');

// ===============================
//  STAN POCZĄTKOWY PLANSZY (front – natychmiastowy start)
// ===============================
let boardState = {
  a1: 'wr', b1: 'wn', c1: 'wb', d1: 'wq', e1: 'wk', f1: 'wb', g1: 'wn', h1: 'wr',
  a2: 'wp', b2: 'wp', c2: 'wp', d2: 'wp', e2: 'wp', f2: 'wp', g2: 'wp', h2: 'wp',
  a7: 'bp', b7: 'bp', c7: 'bp', d7: 'bp', e7: 'bp', f7: 'bp', g7: 'bp', h7: 'bp',
  a8: 'br', b8: 'bn', c8: 'bb', d8: 'bq', e8: 'bk', f8: 'bb', g8: 'bn', h8: 'br'
};

let selectedSquare = null;

// ===============================
// FUNKCJE POMOCNICZE
// ===============================
function getPieceTeam(code) {
  return code?.[0] === 'w' ? 'w' : code?.[0] === 'b' ? 'b' : null;
}

function capturePiece(code) {
  const team = getPieceTeam(code);
  const container = document.getElementById(team === 'w' ? 'captured-white' : 'captured-black');
  if (!container) return;

  const slots = container.querySelectorAll('.captured-slot');
  for (const slot of slots) {
    if (slot.childElementCount === 0) {
      const img = document.createElement('img');
      img.src = `./assets/pieces/${code}.png`;
      img.alt = code;
      img.classList.add('chess-piece');
      slot.appendChild(img);
      return;
    }
  }
}

// ===============================
//  RENDEROWANIE PLANSZY (z obiektu `boardState`)
// ===============================
function renderBoard(state) {
  document.querySelectorAll('.square').forEach(square => {
    const coord = square.dataset.coord;
    square.innerHTML = "";
    square.classList.remove('active', 'invalid');

    const pieceCode = state[coord];
    if (pieceCode) {
      const img = document.createElement('img');
      img.src = `./assets/pieces/${pieceCode}.png`;
      img.alt = pieceCode;
      img.classList.add('chess-piece');
      square.appendChild(img);
      console.log(`[RENDER] ${coord} → ${pieceCode}`);
    }
  });

  if (selectedSquare) {
    const selectedEl = document.querySelector(`.square[data-coord="${selectedSquare}"]`);
    if (selectedEl) selectedEl.classList.add('active');
  }
}

// ===============================
//  OBSŁUGA KLIKNIĘĆ NA POLA (lekki feedback – bez pełnego renderu)
// ===============================
document.querySelectorAll('.square').forEach(square => {
  square.addEventListener('click', () => {
    const coord = square.dataset.coord;
    const piece = boardState[coord];

    square.classList.add('clicked');
    setTimeout(() => square.classList.remove('clicked'), 400);

    // ZAWSZE pozwól wybrać nową figurę i wysłać nowe żądanie
    if (piece) {
      selectedSquare = coord;

      // czyść stare highlighty i podświetl bieżące źródłowe pole
      document.querySelectorAll('.square.active, .square.invalid')
        .forEach(el => el.classList.remove('active', 'invalid'));
      document.querySelector(`.square[data-coord="${coord}"]`)?.classList.add('active');

       // odtwórz dźwięk wyboru
    selectSound.currentTime = 0;
    selectSound.play().catch(() => {});


      // wyślij żądanie możliwych ruchów (backend może je liczyć wiele razy)
      requestPossibleMoves(coord);
    } else {
      // klik w puste pole: wyczyść wybór i highlighty
      selectedSquare = null;
      document.querySelectorAll('.square.active, .square.invalid')
        .forEach(el => el.classList.remove('active', 'invalid'));
    }
  });
});


//  Inicjalne renderowanie planszy (pozycja startowa – natychmiast)
renderBoard(boardState);

// ===============================
//  EXPORT DO GLOBALNEGO ZASIĘGU (dla backend-integration.js)
// ===============================
window.renderBoard   = renderBoard;
window.boardState    = boardState;
window.selectedSquare= selectedSquare;
window.moveSound     = moveSound;
window.captureSound  = captureSound;
window.errorSound    = errorSound;
window.capturePiece  = capturePiece;
window.getPieceTeam  = getPieceTeam;   
