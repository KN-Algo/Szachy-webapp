console.log('[Chessboard] Plansza załadowana.');


// ===============================
//  DŹWIĘKI INTERFEJSU
// ===============================
const moveSound = new Audio('./assets/sounds/move.wav');
const captureSound = new Audio('./assets/sounds/capture.wav');
const errorSound = new Audio('./assets/sounds/error.wav');


// ===============================
//  STAN POCZĄTKOWY PLANSZY
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

// Zwraca drużynę figury na podstawie jej kodu
function getPieceTeam(code) {
  return code?.[0] === 'w' ? 'w' : code?.[0] === 'b' ? 'b' : null;
}

// Dodaje zbitą figurę do placeholdera
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
//  RENDEROWANIE PLANSZY
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
    }
  });

  if (selectedSquare) {
    const selectedEl = document.querySelector(`.square[data-coord="${selectedSquare}"]`);
    if (selectedEl) selectedEl.classList.add('active');
  }
}


// ===============================
//  OBSŁUGA KLIKNIĘĆ NA POLA
// ===============================
document.querySelectorAll('.square').forEach(square => {
  square.addEventListener('click', () => {
    const coord = square.dataset.coord;
    const piece = boardState[coord];

    // Animacja kliknięcia
    square.classList.add('clicked');
    setTimeout(() => square.classList.remove('clicked'), 400);

    // Etap 1: zaznaczenie figury
    if (selectedSquare === null && piece) {
      selectedSquare = coord;
      renderBoard(boardState);
    }

    // Etap 2: wybrano drugie pole
    else if (selectedSquare !== null) {
      if (coord === selectedSquare) return;

      const fromPiece = boardState[selectedSquare];
      const toPiece = boardState[coord];

      const teamFrom = getPieceTeam(fromPiece);
      const teamTo = getPieceTeam(toPiece);

      //  Próba zbicia figury z tej samej drużyny
      if (teamFrom && teamTo && teamFrom === teamTo) {
        square.classList.add('invalid');
        errorSound.play();
        setTimeout(() => square.classList.remove('invalid'), 500);
        return;
      }

      //  Zbicie przeciwnika
      if (toPiece && teamFrom !== teamTo) {
        capturePiece(toPiece);
        captureSound.play();
      }

      //  Przesunięcie figury
      boardState[coord] = fromPiece;
      if (!toPiece) moveSound.play();
      delete boardState[selectedSquare];

      selectedSquare = null;
      renderBoard(boardState);
    }
  });
});

//  Inicjalne renderowanie planszy
renderBoard(boardState);
