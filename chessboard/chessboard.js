console.log("[Chessboard] Plansza załadowana.");

// ===============================
//  DŹWIĘKI INTERFEJSU
// ===============================
const moveSound = new Audio("./assets/sounds/move.wav");
const captureSound = new Audio("./assets/sounds/capture.wav");
const errorSound = new Audio("./assets/sounds/error.wav");
const selectSound = new Audio("./assets/sounds/select.wav");

// zamiast "const moveSound = new Audio(...)" itd.:
window.moveSound = window.moveSound || moveSound;
window.captureSound = window.captureSound || captureSound;
window.errorSound = window.errorSound || errorSound;
window.selectSound = window.selectSound || selectSound;

// ===============================
//  STAN POCZĄTKOWY PLANSZY (globalnie na window)
// ===============================
window.boardState = {
  a1: "wr",
  b1: "wn",
  c1: "wb",
  d1: "wq",
  e1: "wk",
  f1: "wb",
  g1: "wn",
  h1: "wr",
  a2: "wp",
  b2: "wp",
  c2: "wp",
  d2: "wp",
  e2: "wp",
  f2: "wp",
  g2: "wp",
  h2: "wp",
  a7: "bp",
  b7: "bp",
  c7: "bp",
  d7: "bp",
  e7: "bp",
  f7: "bp",
  g7: "bp",
  h7: "bp",
  a8: "br",
  b8: "bn",
  c8: "bb",
  d8: "bq",
  e8: "bk",
  f8: "bb",
  g8: "bn",
  h8: "br",
};

window.selectedSquare = null;

// ===============================
// FUNKCJE POMOCNICZE
// ===============================
function getPieceTeam(code) {
  return code?.[0] === "w" ? "w" : code?.[0] === "b" ? "b" : null;
}

function capturePiece(code) {
  const team = getPieceTeam(code);
  const container = document.getElementById(
    team === "w" ? "captured-white" : "captured-black"
  );
  if (!container) return;

  const slots = container.querySelectorAll(".captured-slot");
  for (const slot of slots) {
    if (slot.childElementCount === 0) {
      const img = document.createElement("img");
      img.src = `./assets/pieces/${code}.png`;
      img.alt = code;
      img.classList.add("chess-piece");
      slot.appendChild(img);
      return;
    }
  }
}

// ===============================
//  [KING IN CHECK] – helpery
// ===============================
let __kingCheckSquareId = null;

/** Znajdź pole króla danego koloru (white|black) na podstawie window.boardState. */
window.findKingSquare = function (color) {
  const kingCode = color === "white" ? "wk" : "bk";
  for (const coord in window.boardState) {
    if (window.boardState[coord] === kingCode) return coord;
  }
  return null;
};

/** Wyczyść neonowe podświetlenie króla (jeśli jest). */
window.clearKingInCheck = function () {
  if (__kingCheckSquareId) {
    const prev = document.querySelector(
      `.square[data-coord="${__kingCheckSquareId}"]`
    );
    if (prev) prev.classList.remove("king-in-check");
    __kingCheckSquareId = null;
  } else {
    document
      .querySelectorAll(".square.king-in-check")
      .forEach((el) => el.classList.remove("king-in-check"));
  }
};

/** Podświetl neonowo podane pole jako króla w szachu. */
window.highlightKingInCheck = function (square) {
  window.clearKingInCheck(); // Wyczyść poprzednie podświetlenia
  if (!square) return;
  const kingSquare = document.querySelector(`.square[data-coord="${square}"]`);
  if (kingSquare) {
    kingSquare.classList.add("king-in-check");
    __kingCheckSquareId = square;
  }
};

/**
 * Zastosuj/wyczyść highlight na podstawie state.in_check & state.check_player
 * Wywołuj po applyIncomingState(...) w backend-integration.js:
 *   window.applyCheckHighlightFromState?.(data.state);
 */
window.applyCheckHighlightFromState = function (state) {
  if (!state || !state.in_check) {
    window.clearKingInCheck();
    return;
  }
  const player =
    state.check_player === "white" || state.check_player === "black"
      ? state.check_player
      : null;
  if (!player) {
    window.clearKingInCheck();
    return;
  }
  const sq = window.findKingSquare(player);
  if (sq) window.highlightKingInCheck(sq);
  else window.clearKingInCheck();
};

// ===============================
//  RENDEROWANIE PLANSZY (z obiektu `window.boardState`)
// ===============================
function renderBoard(state) {
  // Na starcie renderu czyścimy neon – backend-integration po renderze
  // natychmiast przywróci właściwy highlight przez applyCheckHighlightFromState(state).
  window.clearKingInCheck();

  document.querySelectorAll(".square").forEach((square) => {
    const coord = square.dataset.coord;
    square.innerHTML = "";
    square.classList.remove("active", "invalid");

    const pieceCode = state[coord];
    if (pieceCode) {
      const img = document.createElement("img");
      img.src = `./assets/pieces/${pieceCode}.webp`; // zmiana z .png na .webp
      img.alt = pieceCode;
      img.classList.add("chess-piece");
      square.appendChild(img);
      // console.log(`[RENDER] ${coord} → ${pieceCode}`);
    }
  });

  if (window.selectedSquare) {
    const selectedEl = document.querySelector(
      `.square[data-coord="${window.selectedSquare}"]`
    );
    if (selectedEl) selectedEl.classList.add("active");
  }
}

// ===============================
//  OBSŁUGA KLIKNIĘĆ NA POLA - teraz dodawane dynamicznie w reset
// ===============================
// Click handlery są teraz dodawane w backend-integration.js przy resecie
// żeby mieć pełną kontrolę nad czyszczeniem

//  Inicjalne renderowanie planszy (pozycja startowa – natychmiast)
renderBoard(window.boardState);

// =================================================================================================================
// Flaga pomocnicza – chroni przed „dubletem” (klik + event)
window.__isResetInProgress = false;

// 1) Lokalny soft-reset UI (bez FEN) – na czas oczekiwania na event z backendu
window.UI_ResetLocal = function (optimistic = true) {
  window.__isResetInProgress = true;
  window.clearLastMoveHighlight?.();
  window.clearHighlights?.();

  try {
    // zamknij modale game-over / komunikaty
    const go = document.querySelector(".go-overlay");
    if (go) go.classList.remove("active");

    // wyczyść highlighty / podpowiedzi / stany ładowania
    if (typeof window.clearAllHighlights === "function")
      window.clearAllHighlights();
    if (typeof window.clearMoveLoading === "function")
      window.clearMoveLoading("*", "*");

    // wyczyść logi ruchów (lokalnie)
    if (window.MovesLog?.reset) window.MovesLog.reset();

    // wyczyść zbijane
    if (typeof window.resetCaptures === "function") window.resetCaptures();

    // indikator tury – ustaw domyślnie na białych (wizualnie), backend to potwierdzi w eventcie
    if (typeof window.setTurnIndicator === "function")
      window.setTurnIndicator("white");

    // opcjonalnie pokaż jakiś lekki loader w panelu
    if (typeof window.UI_ShowInfo === "function" && optimistic) {
      window.UI_ShowInfo("Resetowanie gry…");
    }
  } catch (e) {
    console.warn("[UI_ResetLocal]", e);
  }
};

// 2) Twarde zastosowanie resetu z backendu (z FEN)
window.UI_ApplyGameReset = function (state) {
  window.__isResetInProgress = false;
  window.clearLastMoveHighlight?.();
  window.clearHighlights?.();

  try {
    // Wczytaj pozycję ze stanu backendu (źródło prawdy)
    if (typeof window.__setBoardFromFEN === "function") {
      window.__setBoardFromFEN(state?.fen);
    } else if (typeof window.setBoardFromFEN === "function") {
      window.setBoardFromFEN(state?.fen);
    }

    // Wyczyść i zainicjalizuj logi
    if (window.MovesLog?.reset) window.MovesLog.reset();

    // Zbicia puste
    if (typeof window.resetCaptures === "function") window.resetCaptures();

    // Indikator tury z eventu
    if (typeof window.setTurnIndicator === "function") {
      const t = state?.turn || "white";
      window.setTurnIndicator(t);
    }

    // odśwież rendering planszy jeśli masz renderer
    if (typeof window.__renderBoard === "function") window.__renderBoard();

    // dźwięk potwierdzenia / resetu (opcjonalnie)
    if (window.sounds?.select) {
      try {
        window.sounds.select.play();
      } catch (_) {}
    }

    // komunikat
    if (typeof window.UI_ShowSuccess === "function")
      window.UI_ShowSuccess("Gra zresetowana.");
  } finally {
    window.__isResetInProgress = false;
  }
};

// ===============================
//  UI/FRONTEND: WIZUALNE FUNKCJE Z BACKEND-INTEGRATION.JS
// ===============================

// --- Podświetlenia ---
window.clearHighlights = function () {
  // istniejące czyszczenia ...
  document
    .querySelectorAll(".square.last-move, .square.last-move-from, .square.last-move-to")
    .forEach(el => el.classList.remove("last-move","last-move-from","last-move-to"));
  window.clearKingInCheck?.();
};

// --- Log ruchów ---
window.MovesLog = (function () {
  const tbody = () => document.getElementById("moves-tbody");
  const data = [];
  let lastNo = 0;

  function toCellText(move, san) {
    if (san && typeof san === "string") return san;
    if (!move) return "";
    return `${(move.from || "").toLowerCase()}–${(
      move.to || ""
    ).toLowerCase()}`;
  }

  function add(move, color /* 'white'|'black' */, san) {
    if (!move || !move.from || !move.to) return;
    if (color === "white") {
      lastNo += 1;
      data.push({ no: lastNo, white: toCellText(move, san), black: "" });
    } else {
      if (!data.length) {
        lastNo = 1;
        data.push({ no: lastNo, white: "", black: toCellText(move, san) });
      } else {
        data[data.length - 1].black = toCellText(move, san);
      }
    }
    render();
  }

  function reset() {
    data.length = 0;
    lastNo = 0;
    render();
  }

  function render() {
    const tb = tbody();
    if (!tb) return;
    const wrap = tb.parentElement;
    const stick = wrap
      ? wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 4
      : false;

    tb.innerHTML = data
      .map(
        (r) =>
          `<tr><td>${r.no}</td><td>${r.white || ""}</td><td>${
            r.black || ""
          }</td></tr>`
      )
      .join("");

    if (wrap && stick) wrap.scrollTop = wrap.scrollHeight;
  }

  return { add, reset };
})();

// --- Modal końca gry + konfetti + dźwięk zwycięstwa ---
window.GO = (function () {
  const overlay = document.getElementById("gameOverOverlay");
  const title = document.getElementById("goTitle");
  const sub = document.getElementById("goSubtitle");
  const btnResume = document.getElementById("goResume");
  const btnReset = document.getElementById("goReset");
  const canvas = document.getElementById("goConfetti");
  let ctx,
    W,
    H,
    particles = [];
  let gameEnded = false;
  let resumeArmed = false;
  let rafId = null;

  let victorySound = null;
  try {
    victorySound = new Audio("./assets/sounds/victory.wav");
  } catch (_) {}
  function playVictory() {
    try {
      if (victorySound) {
        victorySound.currentTime = 0;
        victorySound.play();
      } else {
        window.moveSound?.play?.();
      }
    } catch (_) {}
  }

  function spawnConfetti(n = 160) {
    if (!canvas || !overlay) return;
    cancelAnimationFrame(rafId);
    W = canvas.width = overlay.clientWidth;
    H = canvas.height = overlay.clientHeight;
    ctx = canvas.getContext("2d");

    const g = 0.045;
    const wind = () => Math.sin(performance.now() / 900) * 0.05;
    particles = Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: -20 - Math.random() * 120,
      vx: -0.7 + Math.random() * 1.4,
      vy: 1.5 + Math.random() * 2.2,
      rot: Math.random() * Math.PI * 2,
      vr: -0.12 + Math.random() * 0.24,
      s: 6 + Math.random() * 10,
      a: 1,
      c: Math.random() < 0.5 ? "#fff2f0" : "#0d6efd",
    }));

    const step = () => {
      const overlayActive = overlay.classList.contains("active");
      ctx.clearRect(0, 0, W, H);
      const w = wind();

      particles.forEach((p) => {
        p.vx += w * 0.01;
        p.vy += g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (!overlayActive || p.y > H * 0.6) p.a -= 0.008;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.a);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
        ctx.restore();
      });

      particles = particles.filter(
        (p) => p.a > 0 && p.y < H + 40 && p.x > -40 && p.x < W + 40
      );

      if (overlayActive || particles.length)
        rafId = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, W, H);
    };

    rafId = requestAnimationFrame(step);
  }

  function show({ winner, result }) {
    if (!overlay) return;

    gameEnded = true;
    resumeArmed = true;

    const kolor =
      winner === "white" ? "Biali" : winner === "black" ? "Czarni" : "Nikt";
    const wynik =
      result === "checkmate"
        ? "szach mat"
        : result === "stalemate"
        ? "pat"
        : result === "draw"
        ? "remis"
        : result || "";
    if (title) title.textContent = "Koniec gry";
    if (sub)
      sub.textContent = winner
        ? `${kolor} wygrali (${wynik})`
        : `Gra zakończona${wynik ? ` (${wynik})` : ""}`;

    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    spawnConfetti();
    playVictory();

    if (btnResume) {
      btnResume.onclick = () => {
        overlay.classList.remove("active");
        overlay.setAttribute("aria-hidden", "true");
      };
    }

    if (btnReset) {
      btnReset.onclick = async () => {
        try {
          const res = await fetch(window.CHESS_BACKEND_URL + "/restart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          console.debug("[RESET] /restart (modal) status:", res.status);
          if (!res.ok) throw new Error("Restart failed");
        } catch (e) {
          console.error(e);
        } finally {
          overlay.classList.remove("active");
          overlay.setAttribute("aria-hidden", "true");
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
      overlay.classList.remove("active");
      overlay.setAttribute("aria-hidden", "true");
    },
  };
})();

// --- Tło: Particles ---
window.startParticles = function () {
  const cvs = document.getElementById("bgParticles");
  if (!cvs) return;
  const ctx = cvs.getContext("2d");
  let W = 0,
    H = 0,
    rafId = null,
    running = true;

  const dots = [];
  function resize() {
    W = cvs.width = window.innerWidth;
    H = cvs.height = window.innerHeight;
    const target = Math.round(W * H * 0.00015); // więcej punktów
    while (dots.length < target) dots.push(spawn());
    while (dots.length > target) dots.pop();
  }
  function spawn() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: -0.25 + Math.random() * 0.5,
      vy: -0.25 + Math.random() * 0.5,
      r: 1.2 + Math.random() * 2.2, // większy rozmiar
      c:
        Math.random() < 0.5 ? "rgba(0,246,255,0.55)" : "rgba(255,242,240,0.45)", // mocniejsze kolory
    };
  }
  function step() {
    ctx.clearRect(0, 0, W, H);
    for (const p of dots) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -10) p.x = W + 10;
      else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10;
      else if (p.y > H + 10) p.y = -10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.shadowColor = p.c;
      ctx.shadowBlur = 8;
      ctx.fillStyle = p.c;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const a = dots[i],
          b = dots[j];
        const dx = a.x - b.x,
          dy = a.y - b.y,
          d = Math.hypot(dx, dy);
        if (d < 120) {
          ctx.globalAlpha = 1 - d / 120;
          ctx.strokeStyle = "rgba(0,246,255,0.32)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    if (running) rafId = requestAnimationFrame(step);
  }

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) step();
  });
  resize();
  step();
};

// Wywołanie po załadowaniu strony:
window.addEventListener("DOMContentLoaded", () => {
  if (typeof window.startParticles === "function") window.startParticles();
});

// --- Panel zbitych figur ---
window.resetCaptures = function resetCaptures() {
  const opp = document.getElementById("captured-opponent");
  const me = document.getElementById("captured-player");
  if (opp) opp.innerHTML = "";
  if (me) me.innerHTML = "";
};

window.capturePiece = function capturePiece(code) {
  const opp = document.getElementById("captured-opponent");
  const me = document.getElementById("captured-player");
  if (!opp || !me || !code) return;

  const wrap = document.createElement("div");
  wrap.className = "cap-wrap";

  const img = document.createElement("img");
  img.src = `./assets/pieces/${code}.webp`; // zmiana z .png na .webp
  img.alt = code;
  img.className =
    "captured-piece " + (code[0] === "b" ? "is-black" : "is-white");
  img.draggable = false;

  // Dodaj data-piece-type dla łatwego liczenia
  wrap.setAttribute("data-piece-type", code);

  wrap.appendChild(img);

  const target = code[0] === "w" ? opp : me;
  target.appendChild(wrap);
};

// Funkcja do obliczania dostępnych figur do promocji na podstawie zbitych
window.getAvailablePromotionPieces = function (playerColor) {
  const capturedContainer = document.getElementById(
    playerColor === "w" ? "captured-opponent" : "captured-player"
  );
  if (!capturedContainer) return ["queen", "rook", "bishop", "knight"]; // fallback

  // Zbierz wszystkie zbite figury tego koloru
  const capturedPieces = Array.from(
    capturedContainer.querySelectorAll("[data-piece-type]")
  )
    .map((el) => el.getAttribute("data-piece-type"))
    .filter((code) => code && code[0] === playerColor);

  // Policz ile mamy każdego typu (z uwzględnieniem figur startowych)
  const startingCounts = {
    [`${playerColor}q`]: 1, // 1 dama na start
    [`${playerColor}r`]: 2, // 2 wieże na start
    [`${playerColor}b`]: 2, // 2 gońce na start
    [`${playerColor}n`]: 2, // 2 skoczki na start
  };

  // Policz ile mamy na planszy (z boardState)
  const onBoard = Object.values(window.boardState || {});
  const currentCounts = {
    [`${playerColor}q`]: onBoard.filter((p) => p === `${playerColor}q`).length,
    [`${playerColor}r`]: onBoard.filter((p) => p === `${playerColor}r`).length,
    [`${playerColor}b`]: onBoard.filter((p) => p === `${playerColor}b`).length,
    [`${playerColor}n`]: onBoard.filter((p) => p === `${playerColor}n`).length,
  };

  // Debug log
  console.log(`[PROMO] Debug dla koloru ${playerColor}:`);
  console.log(`[PROMO] Zbite figury:`, capturedPieces);
  console.log(`[PROMO] Na planszy:`, currentCounts);
  console.log(`[PROMO] Stan planszy:`, window.boardState);

  // Oblicz dostępne figury (startowe - na plansze + zbite)
  const available = [];

  Object.entries(startingCounts).forEach(([pieceCode, startCount]) => {
    const currentCount = currentCounts[pieceCode] || 0;
    const capturedCount = capturedPieces.filter((p) => p === pieceCode).length;
    const availableCount = startCount - currentCount + capturedCount;

    console.log(
      `[PROMO] ${pieceCode}: start=${startCount}, current=${currentCount}, captured=${capturedCount}, available=${availableCount}`
    );

    if (availableCount > 0) {
      const pieceType = pieceCode.substring(1); // usuń prefix koloru
      const pieceNameMap = { q: "queen", r: "rook", b: "bishop", n: "knight" };
      available.push(pieceNameMap[pieceType]);
    }
  });

  console.log(`[PROMO] Dostępne figury do promocji:`, available);

  // Jeśli brak dostępnych figur, zwróć damę jako fallback (ostatnia szansa)
  return available.length > 0 ? available : ["queen"];
};

// --- Statusy/badge ---
window.setBadge = function (el, status, label) {
  if (!el) return;
  el.className = "badge";
  const s = String(status || "").toLowerCase();
  if (s === "ready" || s === "healthy" || s === "ok")
    el.classList.add("badge-ok");
  else if (s === "thinking" || s === "warning") el.classList.add("badge-warn");
  else if (s === "error" || s === "down") el.classList.add("badge-err");
  else el.classList.add("badge-muted");
  el.textContent = `${label}: ${status || "—"}`;
};

// Globalny storage dla handlerów ruchów
window._moveHandlers = window._moveHandlers || new Map();

// --- Podświetlanie możliwych ruchów ---
window.highlightPossibleMoves = function (origin, moves) {
  renderBoard(window.boardState);

  console.log(
    `[HIGHLIGHT] Clearing ALL move handlers before highlighting ${origin}`
  );
  console.log(
    `[HIGHLIGHT] Current _moveHandlers size:`,
    window._moveHandlers ? window._moveHandlers.size : "undefined"
  );

  // Usuń wszystkie poprzednie handlery ruchów ze WSZYSTKICH pól
  if (window._moveHandlers) {
    window._moveHandlers.forEach((handler, element) => {
      console.log(`[HIGHLIGHT] Removing handler from:`, element.dataset?.coord);
      element.removeEventListener("click", handler);
    });
    window._moveHandlers.clear();
    console.log(
      `[HIGHLIGHT] Handlers cleared, new size:`,
      window._moveHandlers.size
    );
  }

  // Wyczyść klasy ze wszystkich pól (nie tylko .active/.move-target)
  document.querySelectorAll(".square").forEach((el) => {
    el.classList.remove("active", "move-target");
    el.onclick = null;
  });

  // BRUTALNE CZYSZCZENIE: Sklonuj wszystkie pola żeby usunąć WSZYSTKIE event listenery
  // (ale zachowaj podstawowe handlery wyboru figur)
  console.log(
    `[HIGHLIGHT] BRUTAL CLEANUP - cloning squares to remove all move handlers`
  );
  document.querySelectorAll(".square").forEach((square) => {
    // Zachowaj podstawowe dane
    const coord = square.dataset.coord;
    const classes = Array.from(square.classList);
    const innerHTML = square.innerHTML;

    // Sklonuj element (usuwa wszystkie event listenery)
    const newSquare = square.cloneNode(true);

    // Przywróć podstawowy click handler (wybór figur) - użyj globalnej funkcji
    if (typeof window.addBasicClickHandler === "function") {
      window.addBasicClickHandler(newSquare);
    } else {
      // Fallback jeśli funkcja nie istnieje
      newSquare.addEventListener("click", () => {
        const coord = newSquare.dataset.coord;
        const piece = (window.boardState || {})[coord];
        console.log(
          `[CLICK] Square: ${coord}, Piece: ${piece}, Previously selected: ${window.selectedSquare}`
        );

        // Usuń klasę "clicked" ze wszystkich pól przed dodaniem do bieżącego
        document.querySelectorAll(".square.clicked").forEach((el) => {
          el.classList.remove("clicked");
        });

        // Dodaj efekt migania tylko do klikniętego pola
        newSquare.classList.add("clicked");
        setTimeout(() => newSquare.classList.remove("clicked"), 400);

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

    // Zastąp stary element
    square.parentNode.replaceChild(newSquare, square);
  });

  const originEl = document.querySelector(`.square[data-coord="${origin}"]`);
  if (originEl) originEl.classList.add("active");

  (moves || []).forEach((to) => {
    const el = document.querySelector(`.square[data-coord="${to}"]`);
    if (!el) return;
    el.classList.add("move-target", "active");
    const handler = () => {
      console.log(`[MOVE CLICK] Executing move: ${origin} → ${to}`);
      try {
        selectSound?.play?.();
      } catch (_) {}
      if (typeof sendMove === "function") sendMove(origin, to);
      // Usuń handler po użyciu - zarówno z mapy jak i z elementu
      console.log(`[MOVE CLICK] Removing handler from ${to} after use`);
      el.removeEventListener("click", handler);
      window._moveHandlers.delete(el);
    };
    console.log(
      `[HIGHLIGHT] Adding move handler: ${origin} → ${to} to square ${to}`
    );
    el.addEventListener("click", handler);
    window._moveHandlers.set(el, handler);
  });

  console.log(`[UI] Podświetlono ${moves?.length || 0} ruchów z ${origin}`);
};

window.showMoveRejected = function (reason) {
  console.warn("[Ruch odrzucony]", reason);
  try {
    errorSound?.play?.();
  } catch (_) {}
  window.selectedSquare = null;
  renderBoard(window.boardState);
};

// ===============================
//  EXPORT DO GLOBALNEGO ZASIĘGU (dla backend-integration.js)
// ===============================
window.renderBoard = renderBoard;
window.moveSound = moveSound;
window.captureSound = captureSound;
window.errorSound = errorSound;
window.selectSound = selectSound;
window.capturePiece = capturePiece;
window.getPieceTeam = getPieceTeam;

// --- Indykator tury ---
window.updateTurnIndicator = function (turn) {
  const indicator = document.getElementById("turn-indicator");
  if (!indicator) return;

  indicator.className = `turn-indicator ${turn}`;
  const label = indicator.querySelector(".label");
  if (label) {
    label.textContent = turn === "white" ? "Białe" : "Czarne";
  }
};

// === LAST MOVE HIGHLIGHT ===
window.clearLastMoveHighlight = function () {
  document
    .querySelectorAll(".square.last-move, .square.last-move-from, .square.last-move-to")
    .forEach(el => el.classList.remove("last-move", "last-move-from", "last-move-to"));
};

window.highlightLastMove = function (from, to) {
  window.clearLastMoveHighlight();
  if (!from || !to) return;
  const fromEl = document.querySelector(`.square[data-coord="${from}"]`);
  const toEl = document.querySelector(`.square[data-coord="${to}"]`);
  if (fromEl) {
    fromEl.classList.add("last-move", "last-move-from");
  }
  if (toEl) {
    toEl.classList.add("last-move", "last-move-to");
  }
};

// Upewnij się że przy każdym pełnym renderze (np. reset) nie gubimy stanu ostatniego ruchu.
// Możesz trzymać go globalnie, jeśli chcesz:
// window.__lastMoveRef = {from:'e2',to:'e4'} i po renderBoard odtwarzać highlight.
