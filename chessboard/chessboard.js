console.log('[Chessboard] Plansza załadowana.');

// ===============================
//  DŹWIĘKI INTERFEJSU
// ===============================
const moveSound    = new Audio('./assets/sounds/move.wav');
const captureSound = new Audio('./assets/sounds/capture.wav');
const errorSound   = new Audio('./assets/sounds/error.wav');
const selectSound  = new Audio('./assets/sounds/select.wav');

// zamiast "const moveSound = new Audio(...)" itd.:
window.moveSound    = window.moveSound    || new Audio('./assets/sounds/move.wav');
window.captureSound = window.captureSound || new Audio('./assets/sounds/capture.wav');
window.errorSound   = window.errorSound   || new Audio('./assets/sounds/error.wav');
window.selectSound  = window.selectSound  || new Audio('./assets/sounds/select.wav');


// ===============================
//  STAN POCZĄTKOWY PLANSZY (globalnie na window)
// ===============================
window.boardState = {
  a1: 'wr', b1: 'wn', c1: 'wb', d1: 'wq', e1: 'wk', f1: 'wb', g1: 'wn', h1: 'wr',
  a2: 'wp', b2: 'wp', c2: 'wp', d2: 'wp', e2: 'wp', f2: 'wp', g2: 'wp', h2: 'wp',
  a7: 'bp', b7: 'bp', c7: 'bp', d7: 'bp', e7: 'bp', f7: 'bp', g7: 'bp', h7: 'bp',
  a8: 'br', b8: 'bn', c8: 'bb', d8: 'bq', e8: 'bk', f8: 'bb', g8: 'bn', h8: 'br'
};

window.selectedSquare = null;

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
//  RENDEROWANIE PLANSZY (z obiektu `window.boardState`)
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

  if (window.selectedSquare) {
    const selectedEl = document.querySelector(`.square[data-coord="${window.selectedSquare}"]`);
    if (selectedEl) selectedEl.classList.add('active');
  }
}

// ===============================
//  OBSŁUGA KLIKNIĘĆ NA POLA (lekki feedback – bez pełnego renderu)
// ===============================
document.querySelectorAll('.square').forEach(square => {
  square.addEventListener('click', () => {
    const coord = square.dataset.coord;
    const piece = (window.boardState || {})[coord];

    square.classList.add('clicked');
    setTimeout(() => square.classList.remove('clicked'), 400);

    // ZAWSZE pozwól wybrać nową figurę i wysłać nowe żądanie
    if (piece) {
      window.selectedSquare = coord;

      // czyść stare highlighty i podświetl bieżące źródłowe pole
      document.querySelectorAll('.square.active, .square.invalid')
        .forEach(el => el.classList.remove('active', 'invalid'));
      document.querySelector(`.square[data-coord="${coord}"]`)?.classList.add('active');

      // dźwięk wyboru
      try { selectSound.currentTime = 0; selectSound.play(); } catch(e) {}

      // wyślij żądanie możliwych ruchów (backend może je liczyć wiele razy)
      if (typeof requestPossibleMoves === 'function') {
        requestPossibleMoves(coord);
      }
    } else {
      // klik w puste pole: wyczyść wybór i highlighty
      window.selectedSquare = null;
      document.querySelectorAll('.square.active, .square.invalid')
        .forEach(el => el.classList.remove('active', 'invalid'));
    }
  });
});

//  Inicjalne renderowanie planszy (pozycja startowa – natychmiast)
renderBoard(window.boardState);

// =================================================================================================================
// Flaga pomocnicza – chroni przed „dubletem” (klik + event)
window.__isResetInProgress = false;

// 1) Lokalny soft-reset UI (bez FEN) – na czas oczekiwania na event z backendu
window.UI_ResetLocal = function(optimistic = true){
  try {
    window.__isResetInProgress = true;

    // zamknij modale game-over / komunikaty
    const go = document.querySelector('.go-overlay');
    if (go) go.classList.remove('active');

    // wyczyść highlighty / podpowiedzi / stany ładowania
    if (typeof window.clearAllHighlights === 'function') window.clearAllHighlights();
    if (typeof window.clearMoveLoading === 'function') window.clearMoveLoading('*','*');

    // wyczyść logi ruchów (lokalnie)
    if (window.MovesLog?.reset) window.MovesLog.reset();

    // wyczyść zbijane
    if (typeof window.resetCaptures === 'function') window.resetCaptures();

    // indikator tury – ustaw domyślnie na białych (wizualnie), backend to potwierdzi w eventcie
    if (typeof window.setTurnIndicator === 'function') window.setTurnIndicator('white');

    // opcjonalnie pokaż jakiś lekki loader w panelu
    if (typeof window.UI_ShowInfo === 'function' && optimistic) {
      window.UI_ShowInfo('Resetowanie gry…');
    }
  } catch(e){
    console.warn('[UI_ResetLocal]', e);
  }
};

// 2) Twarde zastosowanie resetu z backendu (z FEN)
window.UI_ApplyGameReset = function(state){
  try {
    // Wczytaj pozycję ze stanu backendu (źródło prawdy)
    if (typeof window.__setBoardFromFEN === 'function') {
      window.__setBoardFromFEN(state?.fen);
    } else if (typeof window.setBoardFromFEN === 'function') {
      window.setBoardFromFEN(state?.fen);
    }

    // Wyczyść i zainicjalizuj logi
    if (window.MovesLog?.reset) window.MovesLog.reset();

    // Zbicia puste
    if (typeof window.resetCaptures === 'function') window.resetCaptures();

    // Indikator tury z eventu
    if (typeof window.setTurnIndicator === 'function') {
      const t = state?.turn || 'white';
      window.setTurnIndicator(t);
    }

    // odśwież rendering planszy jeśli masz renderer
    if (typeof window.__renderBoard === 'function') window.__renderBoard();

    // dźwięk potwierdzenia / resetu (opcjonalnie)
    if (window.sounds?.select) { try { window.sounds.select.play(); } catch(_){} }

    // komunikat
    if (typeof window.UI_ShowSuccess === 'function') window.UI_ShowSuccess('Gra zresetowana.');

  } finally {
    window.__isResetInProgress = false;
  }
};


// ===============================
//  EXPORT DO GLOBALNEGO ZASIĘGU (dla backend-integration.js)
// ===============================
window.renderBoard    = renderBoard;
window.moveSound      = moveSound;
window.captureSound   = captureSound;
window.errorSound     = errorSound;
window.selectSound    = selectSound;
window.capturePiece   = capturePiece;
window.getPieceTeam   = getPieceTeam;
