/**
 * backend-integration.js
 * Integracja frontendu (vanilla JS) z backendem (Symfony + MQTT + Mercure).
 *
 * Prawda o stanie gry przychodzi z backendu (FEN).
 * REST: http://localhost:8000  | Mercure SSE: http://localhost:3000
 * Guard: przypadkowy START_FEN jest ignorowany, CHYBA że to świadomy reset (game_reset).
 */

console.log("[INIT] backend-integration.js załadowany");

/* ========================================================================== */
/*  USTAWIENIA                                                                */
/* ========================================================================== */

const PREVIEW_ENABLED = false; // optymistyczny podgląd – domyślnie off

// Adres backendu – możesz nadpisać w index.php: window.CHESS_BACKEND_URL = 'http://127.0.0.1:8000'
const API_BASE = (window.CHESS_BACKEND_URL || "http://127.0.0.1:8000").replace(
  /\/+$/,
  ""
);
const api = (path) => `${API_BASE}${path}`;

// Bufory UI
window._lastUIMove = null;
window._previewTimeout = null;

/* ========================================================================== */
/*  POMOCNIKI                                                                  */
/* ========================================================================== */

function statesEqual(a, b) {
  if (a === b) return true;
  const aKeys = Object.keys(a || {});
  const bKeys = Object.keys(b || {});
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function fenToBoardState(fen) {
  const board = {};
  const [positions] = (fen || "").split(" ");
  const rows = (positions || "").split("/");
  const pieceMap = { p: "p", r: "r", n: "n", b: "b", q: "q", k: "k" };
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

  rows.forEach((row, rIndex) => {
    let colIndex = 0;
    for (const char of row || "") {
      if (!isNaN(char)) {
        colIndex += parseInt(char, 10);
      } else {
        const isWhite = char === char.toUpperCase();
        const pieceCode = (isWhite ? "w" : "b") + pieceMap[char.toLowerCase()];
        const square = files[colIndex] + (8 - rIndex);
        board[square] = pieceCode;
        colIndex++;
      }
    }
  });
  return board;
}

function getTeam(code) {
  return window.getPieceTeam
    ? window.getPieceTeam(code)
    : code?.[0] === "w"
    ? "w"
    : code?.[0] === "b"
    ? "b"
    : null;
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
  if (typeof window.renderBoard === "function")
    window.renderBoard(window.boardState);

  if (capturedCode) {
    try {
      window.capturePiece?.(capturedCode);
    } catch (_) {}
    try {
      window.captureSound?.play?.();
    } catch (_) {}
  } else {
    try {
      window.moveSound?.play?.();
    } catch (_) {}
  }
  return true;
}

function setBadgeSafe(el, state, label) {
  if (typeof window.setBadge === "function" && el) {
    window.setBadge(el, state, label);
  }
}


/* ===== DIFF „LICZENIOWY” ZBIĆ ===== */

function countPieces(board) {
  const cnt = Object.create(null);
  for (const sq in board || {}) {
    const code = board[sq];
    cnt[code] = (cnt[code] || 0) + 1;
  }
  return cnt;
}

function diffCapturedByCount(prevBoard, nextBoard) {
  const prev = countPieces(prevBoard);
  const next = countPieces(nextBoard);
  const removed = [];
  const CODES = [
    "wp",
    "wr",
    "wn",
    "wb",
    "wq",
    "wk",
    "bp",
    "br",
    "bn",
    "bb",
    "bq",
    "bk",
  ];
  for (const code of CODES) {
    const d = (prev[code] || 0) - (next[code] || 0);
    for (let i = 0; i < d; i++) removed.push(code);
  }
  return removed;
}

function initialMissingPieces(nextBoard) {
  const start = {
    a1: "wr",
    b1: "wn",
    c1: "wb",
    d1: "wq",
    e1: "wk",
    f1: "wn",
    g1: "wb",
    h1: "wr",
    a2: "wp",
    b2: "wp",
    c2: "wp",
    d2: "wp",
    e2: "wp",
    f2: "wp",
    g2: "wp",
    h2: "wp",
    a8: "br",
    b8: "bn",
    c8: "bb",
    d8: "bq",
    e8: "bk",
    f8: "bn",
    g8: "bb",
    h8: "br",
    a7: "bp",
    b7: "bp",
    c7: "bp",
    d7: "bp",
    e7: "bp",
    f7: "bp",
    g7: "bp",
    h7: "bp",
  };
  return diffCapturedByCount(start, nextBoard);
}

/* ========================================================================== */
/*  PODŚWIETLENIE KRÓLA W SZACHU – BRIDGE DO chessboard.js                    */
/* ========================================================================== */

/**
 * Spina backendowy `state` (z polami `in_check`, `check_player`) z helperem
 * `window.applyCheckHighlightFromState` z chessboard.js.
 * Akceptuje zarówno payloady w formie { state: {...} } jak i same { ... }.
 */
function updateCheckHighlight(payload) {
  const st = payload && payload.state ? payload.state : payload;
  window.applyCheckHighlightFromState?.(st);
}

/* ========================================================================== */
/*  BEZPIECZNIK „NIE RESETUJ DO STARTU”                                       */
/* ========================================================================== */

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
let START_BOARD = null;
let gameStarted = false;
let allowResetToStart = false;

/** Zastosuj stan z backendu + wykryj bicie (z move) lub fallback liczeniowy */
function applyIncomingState(state, reason = "update", move) {
  if (!state?.fen) {
    console.warn("[Backend] Brak FEN w stanie:", state);
    return;
  }

  const prev = { ...(window.boardState || {}) };
  const incoming = fenToBoardState(state.fen);

  if (!START_BOARD) START_BOARD = { ...(window.boardState || {}) };

  if (statesEqual(incoming, window.boardState)) {
    // nawet jeśli brak różnicy – zaktualizuj highlight szacha (np. sam in_check się zmienił)
    updateCheckHighlight(state);
    return;
  }

  const isStartBoard = statesEqual(incoming, START_BOARD);
  if (
    gameStarted &&
    isStartBoard &&
    !allowResetToStart &&
    reason !== "game_reset"
  ) {
    console.warn(
      "[STATE]",
      reason,
      "→ zignorowano FEN pozycji startowej (bez resetu)."
    );
    return;
  }

  let capturedCode = null;
  if (move && prev[move.to]) {
    const movingTeam = getTeam(prev[move.from]);
    const targetTeam = getTeam(prev[move.to]);
    if (movingTeam && targetTeam && movingTeam !== targetTeam) {
      capturedCode = prev[move.to];
    }
  }

  window.boardState = incoming;
  window.selectedSquare = null;
  if (typeof window.renderBoard === "function")
    window.renderBoard(window.boardState);

  // Podświetlenie szacha po renderze
  updateCheckHighlight(state);

  // Przy game_reset nie pokazujemy last move
  if (reason === "game_reset") {
    window.clearLastMoveHighlight?.();
  } else {
    (function applyLastMoveHighlight() {
      let m = move;
      if (!m) m = _detectSimpleMove(prev, incoming);
      if (m && m.from && m.to && window.highlightLastMove) {
        window.highlightLastMove(m.from, m.to);
      }
    })();
  }

  if (capturedCode) {
    try { window.capturePiece?.(capturedCode); } catch (_) {}
    try { window.captureSound?.play?.(); } catch (_) {}
  }

  {
    let removed = diffCapturedByCount(prev, incoming);
    if (capturedCode) {
      const i = removed.indexOf(capturedCode);
      if (i !== -1) removed.splice(i, 1);
    }
    if (removed.length) {
      removed.forEach(code => {
        try { window.capturePiece?.(code); } catch (_) {}
      });
      try { window.captureSound?.play?.(); } catch (_) {}
    }
  }

  if (!isStartBoard) gameStarted = true;
  if (allowResetToStart && isStartBoard) {
    gameStarted = false;
    allowResetToStart = false;
  }
}

/* ========================================================================== */
/*  START                                                                      */
/* ========================================================================== */

window.addEventListener("DOMContentLoaded", () => {
  // Snapshot startu
  START_BOARD = { ...(window.boardState || {}) };
  gameStarted = false;
  allowResetToStart = false;

  // DODAJ PODSTAWOWE CLICK HANDLERY NA START
  console.log("[INIT] Adding initial click handlers to chessboard");
  addBasicClickHandlers();

  // AUTOMATYCZNY RESET PO ODŚWIEŻENIU STRONY
  console.log("[INIT] Auto-reset after page refresh");
  setTimeout(async () => {
    try {
      const res = await fetch(api("/restart"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      console.log("[INIT] Auto-reset completed:", data);
    } catch (error) {
      console.error("[INIT] Auto-reset failed:", error);
    }
  }, 1000); // Poczekaj 1 sekundę na inicjalizację

  // Reset – przycisk w panelu
  const btnReset = document.getElementById("btn-reset");
  if (btnReset) {
    btnReset.addEventListener("click", async () => {
      btnReset.disabled = true;
      try {
        const res = await fetch(api("/restart"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        console.debug("[RESET] /restart (panel) status:", res.status);
        if (!res.ok) throw new Error("Restart failed");
      } catch (e) {
        console.error(e);
      } finally {
        btnReset.disabled = false;
      }
    });
  }

  // Pobierz stan początkowy
  fetch(api("/state"))
    .then((res) => res.json())
    .then((state) => {
      if (state && state.fen) {
        applyIncomingState(state, "/state");
        console.log("[API] Stan początkowy pobrany.");

        // --- PODŚWIETLENIE KRÓLA W SZACHU (start) ---
        updateCheckHighlight(state);

        // Jednorazowo uzupełnij „zbite” brakami względem startu (zimny start w środku partii)
        try {
          if (!window.__initialCapturesFilled) {
            const missing = initialMissingPieces(window.boardState);
            if (missing && missing.length) {
              window.resetCaptures?.();
              missing.forEach((code) => window.capturePiece?.(code));
            }
            window.__initialCapturesFilled = true;
          }
        } catch (_) {}
      } else {
        console.warn("[API] /state bez pola fen – pomijam render.", state);
      }
    })
    .catch((err) => {
      console.error("[API] Nie udało się pobrać stanu gry:", err);
    });

  // Mercure (SSE)
  const mercureUrl = new URL("http://localhost:3000/.well-known/mercure");
  mercureUrl.searchParams.append(
    "topic",
    "http://127.0.0.1:8000/chess/updates"
  );
  const eventSource = new EventSource(mercureUrl, { withCredentials: false });

  eventSource.onopen = () =>
    console.log("[Mercure] ===== CONNECTION OPENED =====");
  eventSource.onerror = (error) =>
    console.error("[Mercure] ===== CONNECTION ERROR =====", error);

  // Helper - dodaj podstawowy click handler do pojedynczego pola
  function addBasicClickHandler(square) {
    square.addEventListener("click", () => {
      const coord = square.dataset.coord;
      const piece = (window.boardState || {})[coord];

      console.log(
        `[CLICK] Square: ${coord}, Piece: ${piece}, Previously selected: ${window.selectedSquare}`
      );

      // Usuń klasę "clicked" ze wszystkich pól przed dodaniem do bieżącego
      document.querySelectorAll(".square.clicked").forEach((el) => {
        el.classList.remove("clicked");
      });

      // Dodaj efekt migania tylko do klikniętego pola
      square.classList.add("clicked");
      setTimeout(() => square.classList.remove("clicked"), 400);

      if (piece) {
        window.selectedSquare = coord;
        console.log(`[CLICK] New selection: ${coord}`);

        document
          .querySelectorAll(".square.active, .square.invalid")
          .forEach((el) => el.classList.remove("active", "invalid"));
        document
          .querySelector(`.square[data-coord="${coord}"]`)
          ?.classList.add("active");

        try {
          if (window.selectSound) {
            window.selectSound.currentTime = 0;
            window.selectSound.play();
          }
        } catch (e) {}

        if (typeof requestPossibleMoves === "function") {
          requestPossibleMoves(coord);
        }
      } else {
        window.selectedSquare = null;
        document
          .querySelectorAll(".square.active, .square.invalid")
          .forEach((el) => el.classList.remove("active", "invalid"));
      }
    });
  }

  // Helper - dodaj podstawowe click handlery do wszystkich pól
  function addBasicClickHandlers() {
    document.querySelectorAll(".square").forEach(addBasicClickHandler);
  }

  // Eksportuj funkcję globalnie
  window.addBasicClickHandler = addBasicClickHandler;

  // Helpery do resetu po stronie eventów
  function _applyResetState(state) {
    // Odblokuj guard – pozwól przyjąć FEN startowy
    allowResetToStart = true;

    // Wyczyść cache duplikatów ruchów i stanów
    if (window._processedMoves) {
      console.log("[RESET] Clearing processed moves cache");
      window._processedMoves.clear();
    }
    if (window._pendingMoves) {
      console.log("[RESET] Clearing pending moves cache");
      window._pendingMoves.clear();
    }

    // Wyczyść wszystkie handlery ruchów z planszy - KOMPLETNIE!
    console.log("[RESET] Clearing ALL move handlers and classes");
    console.log(
      "[RESET] Current _moveHandlers size:",
      window._moveHandlers ? window._moveHandlers.size : "undefined"
    );

    // Usuń wszystkie klasy i handlery z pól
    document.querySelectorAll(".square").forEach((square) => {
      square.classList.remove("active", "move-target", "clicked", "selected");

      const newSquare = square.cloneNode(true);
      square.parentNode.replaceChild(newSquare, square);
    });

    // Wyczyść mapę handlerów
    if (window._moveHandlers) {
      window._moveHandlers.clear();
    }

    // Wyczyść selectedSquare
    window.selectedSquare = null;

    // Ponownie dodaj podstawowe click handlery do pól (do wybierania figur)
    addBasicClickHandlers();
    window._lastProcessedState = null;
    window._lastUIMove = null;

    // Czyszczenie UI
    try {
      if (typeof window.clearHighlights === "function")
        window.clearHighlights();
    } catch (_) {}
    try {
      if (window.MovesLog?.reset) window.MovesLog.reset();
    } catch (_) {}
    try {
      if (typeof window.resetCaptures === "function") window.resetCaptures();
    } catch (_) {}
    try {
      if (typeof window.updateTurnIndicator === "function")
        window.updateTurnIndicator(state?.turn || "white");
    } catch (_) {}

    // Dodatkowo wyczyść ewentualny neon szacha
    window.clearKingInCheck?.();

    // Wczytaj stan/FEN (BEZPOŚREDNIO, bez guard)
    try {
      if (state?.fen) {
        const resetBoard = fenToBoardState(state.fen);
        window.boardState = resetBoard;
        window.selectedSquare = null;
        if (typeof window.renderBoard === "function") {
          window.renderBoard(window.boardState);
        }
        console.log("[RESET] FEN bezpośrednio zastosowany:", state.fen);

        // Reset flag
        gameStarted = false;
        allowResetToStart = false;

        // Po renderze – dla porządku przelicz highlight z aktualnego stanu (zwykle off)
        updateCheckHighlight(state);
      }
    } catch (e) {
      console.error("[RESET] Błąd przy ładowaniu FEN:", e);
    }

    // Zamknij modal końcowy
    try {
      if (window.GO?.hide) window.GO.hide();
    } catch (_) {}

    try {
      window.selectSound?.play?.();
    } catch (_) {}
    console.log("[RESET] Zastosowano stan resetu (guard przepuszczony).");
  }

  function _looksLikeResetState(payload) {
    const fen = payload?.fen || payload?.state?.fen;
    const moves = payload?.moves || payload?.state?.moves;
    const turn = payload?.turn || payload?.state?.turn;
    return (
      fen === START_FEN &&
      Array.isArray(moves) &&
      moves.length === 0 &&
      (turn === "white" || !turn)
    );
  }
// =============================================================================
// --- whitelist dozwolonych stanów RPi (README) ---
// dozwolone stany – wszystko inne => "unknown"
const RPI_ALLOWED = new Set(["ready", "moving", "error", "busy", "unknown"]);

function cleanStatusString(s) {
  if (typeof s !== "string") return null;
  let t = s.trim().toLowerCase();
  // zdejmij otaczające cudzysłowy, jeśli są
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  // na wszelki wypadek usuń znaki nieliterowe po bokach
  t = t.replace(/^[^a-z]+|[^a-z]+$/g, "");
  return RPI_ALLOWED.has(t) ? t : null;
}

function normalizeRpi(payload) {
  // 1) czysty string z Mercure
  const direct = cleanStatusString(payload);
  if (direct) return direct;

  // 2) obiekt – kolejność: status → status.status → RAW → state → severity → message
  if (payload && typeof payload === "object") {
    let s = null;

    if (!s && typeof payload.status === "string") s = cleanStatusString(payload.status);
    if (!s && payload.status && typeof payload.status === "object")
      s = cleanStatusString(payload.status.status);
    // <<< KLUCZOWE: PlainText z MQTTX backend pakuje jako RAW
    if (!s && typeof payload.raw === "string") s = cleanStatusString(payload.raw);
    if (!s && typeof payload.state === "string") s = cleanStatusString(payload.state);
    if (!s && typeof payload.severity === "string") s = cleanStatusString(payload.severity);
    if (!s && typeof payload.message === "string") {
      const m = payload.message.toLowerCase();
      if (m.includes("error")) s = "error";
      else if (m.includes("moving")) s = "moving";
      else if (m.includes("ready")) s = "ready";
      else if (m.includes("busy")) s = "busy";
    }
    return s || "unknown";
  }

  return "unknown";
}


// ===========================================================================
  // Odbiór zdarzeń Mercure
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "possible_moves": {
          console.log("[Mercure] possible_moves:", data.position, data.moves);

          // Przekaż dane do modułu promocji (jeśli istnieje)
          if (typeof window.Promotion?.onPossibleMoves === "function") {
            window.Promotion.onPossibleMoves(data.position, data.moves || []);
          }

          if (typeof window.highlightPossibleMoves === "function")
            window.highlightPossibleMoves(data.position, data.moves || []);
          break;
        }

        case "move_confirmed": {
          clearTimeout(window._previewTimeout);
          window._previewTimeout = null;

          // Zabezpieczenie przed duplikatami - sprawdź czy ten ruch już nie był przetworzony
          const moveKey = `${data.move.from}-${data.move.to}`;
          if (window._processedMoves && window._processedMoves.has(moveKey)) {
            console.log("[Mercure] Pomijam duplikat move_confirmed:", moveKey);
            break;
          }

          // Zapamiętaj przetworzony ruch
          if (!window._processedMoves) window._processedMoves = new Set();
          window._processedMoves.add(moveKey);

          // Usuń z pending moves - ruch został potwierdzony
          if (window._pendingMoves) {
            window._pendingMoves.delete(moveKey);
            console.log(`[CONFIRMED] Removed ${moveKey} from pending moves`);
          }

          // log + tura
          const nextTurn = data?.state?.turn; // tura PO ruchu
          const justMoved = nextTurn === "black" ? "white" : "black";
          if (window.MovesLog?.add)
            window.MovesLog.add(data.move, justMoved, data.san);
          if (nextTurn && typeof window.updateTurnIndicator === "function")
            window.updateTurnIndicator(nextTurn);

          // koniec gry
          const ended =
            data?.state?.game_ended === true ||
            ["checkmate", "stalemate", "draw"].includes(
              String(data?.state?.game_status || "").toLowerCase()
            );
          if (ended && window.GO?.show) {
            const winner = data?.state?.winner || data?.winner;
            const result = (
              data?.state?.game_status ||
              data?.result ||
              ""
            ).toLowerCase();
            window.GO.show({ winner, result });
          }

          applyIncomingState(data.state, "move_confirmed", data.move);

          // --- PODŚWIETLENIE KRÓLA W SZACHU ---
          updateCheckHighlight(data.state);

          // Zamknij modal promocji po potwierdzeniu ruchu
          if (typeof window.Promotion?.close === "function") {
            window.Promotion.close();
          }

          try {
            window.moveSound?.play?.();
          } catch (_) {}
          break;
        }

        case "move_rejected": {
          clearTimeout(window._previewTimeout);
          window._previewTimeout = null;
          console.log("[Mercure] move_rejected:", data.reason);
          if (typeof window.showMoveRejected === "function")
            window.showMoveRejected(data.reason);
          break;
        }

        case "state/update": {
          clearTimeout(window._previewTimeout);
          window._previewTimeout = null;

          // Sprawdź czy nie jest to duplikat stanu
          const stateKey = data?.fen;
          if (stateKey && window._lastProcessedState === stateKey) {
            console.log("[Mercure] Pomijam duplikat state/update:", stateKey);
            break;
          }
          window._lastProcessedState = stateKey;

          // jeśli to startowy FEN i pusta historia, traktuj jak reset
          if (_looksLikeResetState(data)) {
            console.log(
              "[Mercure] state/update wygląda jak reset → traktuję jak reset"
            );

            // Wyczyść cache przed aplikowaniem resetu
            if (window._processedMoves) window._processedMoves.clear();
            if (window._pendingMoves) window._pendingMoves.clear();
            window._lastProcessedState = null;
            window._lastUIMove = null;

            _applyResetState(data);
            break;
          }

          if (data?.turn && typeof window.updateTurnIndicator === "function")
            window.updateTurnIndicator(data.turn);
          applyIncomingState(data, "state/update");

          // --- PODŚWIETLENIE KRÓLA W SZACHU ---
          updateCheckHighlight(data);

          break;
        }

case "raspi_status": {
  const el = document.getElementById("status-raspi");
  const payload = data?.data; // string lub obiekt
  const state = normalizeRpi(payload);

  if (typeof window.setBadge === "function" && el) {
    window.setBadge(el, state, "RPi");
  }

  console.log("[STATUS][RPi]", {
    component: "raspberry_pi",
    state,
    typeof: typeof payload,
    raw: payload,
  });
  break;
}




        case "engine_status": {
          const el = document.getElementById("status-engine");
          if (typeof window.setBadge === "function")
            window.setBadge(
              el,
              data?.data?.status.status || "unknown",
              "Silnik"
            );
          console.log("[STATUS][ENGINE]", data?.data || {});
          break;
        }

        case "ai_move_executed": {
          clearTimeout(window._previewTimeout);
          window._previewTimeout = null;

          const nextTurn = data?.state?.turn;
          const justMoved = nextTurn === "black" ? "white" : "black";
          if (window.MovesLog?.add)
            window.MovesLog.add(data.move, justMoved, data.san);
          if (nextTurn && typeof window.updateTurnIndicator === "function")
            window.updateTurnIndicator(nextTurn);

          if (data?.state?.fen)
            applyIncomingState(data.state, "ai_move_executed", data.move);

          // --- PODŚWIETLENIE KRÓLA W SZACHU ---
          updateCheckHighlight(data.state);

          try {
            window.moveSound?.play?.();
          } catch (_) {}
          break;
        }

        case "move_pending": {
          const from = data?.move?.from;
          const to = data?.move?.to;
          const fen = data?.state?.fen || null;
          const physical = !!data?.physical;

          console.log("[Mercure] move_pending:", {
            from,
            to,
            physical,
            hasFen: !!fen,
          });

          if (fen) {
            const incoming = fenToBoardState(fen);
            if (!statesEqual(incoming, window.boardState)) {
              applyIncomingState({ fen }, "move_pending", data.move);
              break;
            }
            console.log(
              "[STATE] move_pending: FEN = aktualny → rozważę preview."
            );
          }

          if (!PREVIEW_ENABLED) {
            console.log("[UI] Preview OFF – czekam na confirmed/state.");
            break;
          }
          if (physical) {
            console.log("[UI] Ruch fizyczny – bez preview.");
            break;
          }

          const uiMove = window._lastUIMove;
          const sameAsUI = uiMove && uiMove.from === from && uiMove.to === to;

          if (from && to && sameAsUI) {
            if (typeof window.clearHighlights === "function")
              window.clearHighlights();
            const ok = previewMove(from, to);
            if (!ok) {
              console.warn("[UI] previewMove nie zadziałał.");
              break;
            }

            clearTimeout(window._previewTimeout);
            window._previewTimeout = setTimeout(() => {
              fetch(api("/state"))
                .then((r) => r.json())
                .then((s) => s?.fen && applyIncomingState(s, "preview_timeout"))
                .catch(() => {});
            }, 5000);
          } else {
            console.log("[UI] move_pending nie dotyczy ostatniego ruchu UI.");
          }
          break;
        }

        case "game_reset": {
          clearTimeout(window._previewTimeout);
          window._previewTimeout = null;

          // Wyczyść wszystkie cache przed resetem
          if (window._processedMoves) window._processedMoves.clear();
          if (window._pendingMoves) window._pendingMoves.clear();
          window._lastProcessedState = null;
          window._lastUIMove = null;

          console.log("[Mercure] game_reset:", data?.state);
          _applyResetState(data.state);

          // --- Wyczyść podświetlenie szacha ---
          window.clearKingInCheck?.();

          break;
        }

        case "log/update": {
          console.log("[LOG][UPDATE]", data);
          break;
        }

        case "game_over": {
          const winner = data?.winner;
          const result = (data?.result || "").toLowerCase();
          if (window.GO?.show) window.GO.show({ winner, result });
          break;
        }

        default:
          console.log(
            "[Mercure] ===== UNHANDLED MESSAGE TYPE =====",
            data.type,
            data
          );
      }
    } catch (e) {
      console.error("[Mercure] JSON parse error:", e, "RAW:", event.data);
    }
  };
});

/* ========================================================================== */
/*  API: możliwe ruchy / wysłanie ruchu                                        */
/* ========================================================================== */

function requestPossibleMoves(position) {
  fetch(api("/possible-moves"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.status === "request_sent") {
        console.log("[API] Żądanie możliwych ruchów wysłane...");
      } else {
        console.error("[API] Błąd logiczny:", data?.error);
        try {
          window.errorSound?.play?.();
        } catch (_) {}
      }
    })
    .catch((err) => {
      console.error("[API] Błąd sieci:", err);
      try {
        window.errorSound?.play?.();
      } catch (_) {}
    });
}

function sendMove(from, to) {
  window._lastUIMove = { from, to, ts: Date.now() };

  const moveKey = `${from}-${to}`;
  if (!window._pendingMoves) window._pendingMoves = new Set();

  console.log(
    `[SEND] Attempting move ${moveKey}, pending moves:`,
    Array.from(window._pendingMoves)
  );

  if (window._pendingMoves.has(moveKey)) {
    console.log(`[SEND] Move ${moveKey} already pending - SKIPPING`);
    return;
  }
  window._pendingMoves.add(moveKey);

  console.log(`[SEND] Sending move ${moveKey} to backend`);

  fetch(api("/move"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  })
    .then(async (res) => {
      let data = null;
      try {
        data = await res.json();
      } catch (_) {}
      if (res.ok) {
        console.log("[API] Ruch wysłany:", moveKey, data?.status || "");
      } else {
        console.error("[API] Błąd /move:", data?.error || res.status);
        window.errorSound?.play?.();
      }
    })
    .catch((err) => {
      console.error("[API] Błąd sieci /move:", err);
      window.errorSound?.play?.();
      // Usuń z pending przy błędzie
      if (window._pendingMoves) window._pendingMoves.delete(moveKey);
    });
}

/* ========================================================================== */
/*  RESET: oba przyciski (panel + modal)                                       */
/* ========================================================================== */

// Delegowany handler – działa dla każdego elementu z atrybutem data-action="reset-game"
(function attachGlobalResetHandler() {
  if (window.__resetHandlerAttached) return;
  window.__resetHandlerAttached = true;

  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest('[data-action="reset-game"]');
    if (!btn) return;

    ev.preventDefault();
    console.log("[RESET] Kliknięto przycisk resetu.");

    // Soft-clean UI, jeśli masz funkcję – nie jest obowiązkowe
    try {
      if (typeof window.clearHighlights === "function")
        window.clearHighlights();
    } catch (_) {}
    try {
      if (window.MovesLog?.reset) window.MovesLog.reset();
    } catch (_) {}
    try {
      if (typeof window.resetCaptures === "function") window.resetCaptures();
    } catch (_) {}
    try {
      if (typeof window.updateTurnIndicator === "function")
        window.updateTurnIndicator("white");
    } catch (_) {}

    // Dodatkowo: zdejmij ewentualny neon szacha
    window.clearKingInCheck?.();

    // Wyślij żądanie do backendu
    try {
      const res = await fetch(api("/restart"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const txt = await res.text();
      console.debug("[RESET] /restart status:", res.status, "body:", txt);
    } catch (e) {
      console.error("[RESET] Błąd /restart:", e);
      try {
        window.errorSound?.play?.();
      } catch (_) {}
    }
  });
})();
