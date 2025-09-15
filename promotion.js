/* ==========================================================================
   promotion.js — modal i logika promocji pionka (web → backend)
   Wymaga: window.boardState, assets/pieces/{w|b}{q|r|b|n}.png
   API: POST /move (special_move: "promotion" | "promotion_capture")
   ========================================================================== */

(function PromotionModule() {
  // ====== KONFIG URL API ======
  const API_BASE = (
    window.CHESS_BACKEND_URL || "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");
  const api = (p) => `${API_BASE}${p}`;

  // ====== STAN WEWNĘTRZNY ======
  // Mapuje origin (np. "a7") -> meta możliwych ruchów zwróconych przez backend
  // np. { "a7": [{to:"a8",type:"promotion",available_pieces:["queen","rook","bishop","knight"]}, ...] }
  const possibleByOrigin = Object.create(null);

  // Ruch, który czeka na wybór figury
  let pending = null; // { from, to, type, captured_piece, available_pieces, color }

  // ====== POMOCNICZE ======
  const PIECE_LETTER = { queen: "q", rook: "r", bishop: "b", knight: "n" };

  function pieceColorAt(square) {
    const code = (window.boardState || {})[square]; // np. 'wp'
    if (!code) return null;
    return code[0] === "w" ? "w" : code[0] === "b" ? "b" : null;
  }

  function isPromotionByGeometry(from, to) {
    // Gdy nie mamy metadanych z possible_moves — fallback po ranku
    const code = (window.boardState || {})[from];
    if (!code) return false;
    const isWhitePawn = code === "wp";
    const isBlackPawn = code === "bp";
    if (!isWhitePawn && !isBlackPawn) return false;
    const rank = parseInt(to[1], 10);
    return (isWhitePawn && rank === 8) || (isBlackPawn && rank === 1);
  }

  function lookupMoveMeta(from, to) {
    const list = possibleByOrigin[from];
    if (!Array.isArray(list)) return null;
    return list.find((m) => (m.to || "").toLowerCase() === to.toLowerCase());
  }

  function buildAvailablePieces(meta, playerColor) {
    // Najpierw sprawdź czy mamy dane z backendu (meta.available_pieces)
    if (Array.isArray(meta?.available_pieces) && meta.available_pieces.length) {
      return meta.available_pieces.slice().filter((p) => PIECE_LETTER[p]);
    }

    // Jeśli nie, oblicz na podstawie zbitych figur (fizyczne ograniczenia)
    if (
      typeof window.getAvailablePromotionPieces === "function" &&
      playerColor
    ) {
      return window.getAvailablePromotionPieces(playerColor);
    }

    // Ostatnia szansa - standardowe 4 figury
    return ["queen", "rook", "bishop", "knight"];
  }

  // ====== MODAL (HTML+CSS wstrzyknięte) ======
  const html = `
    <div id="promotionOverlay" class="promo-overlay" aria-hidden="true" role="dialog" aria-label="Wybór figury do promocji">
      <div class="promo-card">
        <h3>Promuj pionka</h3>
        <p class="promo-sub">Wybierz figurę (skrót: Q R B N)</p>
        <div class="promo-grid" id="promoGrid"></div>
      </div>
    </div>
  `;
  const css = `
    .promo-overlay{position:fixed;inset:0;background:rgba(0,4,36,.78);display:none;place-items:center;z-index:10000}
    .promo-overlay.active{display:grid}
    .promo-card{background:#fff2f0;color:#000424;border-radius:16px;padding:20px 22px;width:clamp(260px,32vw,420px);box-shadow:0 14px 40px rgba(0,0,0,.35);text-align:center}
    .promo-card h3{margin:0 0 6px;font-size:1.25rem}
    .promo-sub{margin:0 0 14px;opacity:.8}
    .promo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .promo-opt{aspect-ratio:1/1;border-radius:12px;background:#000424;border:2px solid #000424;cursor:pointer;display:grid;place-items:center;transition:transform .08s ease,box-shadow .08s ease,background .08s ease}
    .promo-opt:hover,.promo-opt:focus{outline:none;transform:translateY(-1px);box-shadow:0 8px 16px rgba(0,0,0,.28);background:#0e143a}
    .promo-opt img{width:70%;height:70%;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
  `;

  function ensureModal() {
    if (document.getElementById("promotionOverlay")) return;
    const style = document.createElement("style");
    style.textContent = css;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    document.head.appendChild(style);
    document.body.appendChild(wrap.firstElementChild);
  }

  function openModal(opts) {
    // opts: { color:'w'|'b', available:['queen','rook','bishop','knight'] }
    ensureModal();
    const overlay = document.getElementById("promotionOverlay");
    const grid = document.getElementById("promoGrid");
    grid.innerHTML = "";

    const color = opts.color || "w";
    opts.available.forEach((kind) => {
      const letter = PIECE_LETTER[kind];
      const btn = document.createElement("button");
      btn.className = "promo-opt";
      btn.setAttribute("data-piece", kind);
      btn.setAttribute("aria-label", kind);
      const img = document.createElement("img");
      img.src = `./assets/pieces/${color}${letter}.webp`;
      img.alt = kind;
      img.draggable = false;
      btn.appendChild(img);
      btn.addEventListener("click", () => choose(kind), { once: true });
      grid.appendChild(btn);
    });

    // klawiatura: Q R B N
    overlay.onkeydown = (e) => {
      const key = (e.key || "").toLowerCase();
      const map = { q: "queen", r: "rook", b: "bishop", n: "knight" };
      if (map[key] && opts.available.includes(map[key])) {
        e.preventDefault();
        choose(map[key]);
      }
    };

    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    overlay.focus({ preventScroll: true });
  }

  function closeModal() {
    const overlay = document.getElementById("promotionOverlay");
    if (!overlay) return;
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
  }

  async function choose(kind) {
    if (!pending) return;
    const { from, to, type, captured_piece, available_pieces } = pending;

    // payload zgodnie z dokumentacją
    const payload = {
      from,
      to,
      special_move: type || "promotion",
      promotion_piece: kind,
      available_pieces:
        available_pieces && available_pieces.length
          ? available_pieces
          : ["queen", "rook", "bishop", "knight"],
    };
    if (type === "promotion_capture" && captured_piece) {
      payload.captured_piece = captured_piece;
    }

    // wysyłamy ruch (zamiast domyślnego sendMove)
    try {
      const res = await fetch(api("/move"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let data = null;
      try {
        data = await res.json();
      } catch (_) {}
      console.debug("[PROMO] POST /move →", res.status, data || "");
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      // odpowiedź o skutku przyjdzie przez Mercure (move_confirmed / rejected)
    } catch (err) {
      console.error("[PROMO] Błąd wysyłki ruchu promocji:", err);
      try {
        window.errorSound?.play?.();
      } catch (_) {}
    } finally {
      pending = null;
      closeModal();
    }
  }

  // ====== PUBLIC API ======
  const Promotion = {
    /** Zawołaj z backend-integration.js w case 'possible_moves' */
    onPossibleMoves(origin, moves) {
      possibleByOrigin[origin] = Array.isArray(moves) ? moves.slice() : [];
    },

    /** Przechwytuje ruch UI i decyduje, czy wymaga promocji */
    considerMove(from, to) {
      // 1) spróbuj z metadanych possible_moves
      const meta = lookupMoveMeta(from, to);
      const looksLikePromotion =
        meta &&
        (meta.type === "promotion" ||
          meta.type === "promotion_capture" ||
          meta.promotion_required === true);

      // 2) fallback po geometrii
      const byGeom = isPromotionByGeometry(from, to);

      if (!looksLikePromotion && !byGeom) return false;

      // Ustal szczegóły
      const color = pieceColorAt(from) || "w";
      const available = buildAvailablePieces(meta, color);
      const type = meta?.type || "promotion";
      const captured_piece = meta?.captured_piece || null;

      // Edge case: brak dostępnych figur do promocji
      if (!available || available.length === 0) {
        console.warn(
          "[PROMO] Brak dostępnych figur do promocji! Automatycznie wybieramy damę."
        );

        // Wyślij ruch z damą automatycznie
        const payload = {
          from,
          to,
          special_move: type,
          promotion_piece: "queen",
          available_pieces: ["queen"],
        };
        if (type === "promotion_capture" && captured_piece) {
          payload.captured_piece = captured_piece;
        }

        // Wyślij bez modala
        fetch(api("/move"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            console.log("[PROMO] Automatyczna promocja do damy wysłana");
          })
          .catch((err) => {
            console.error("[PROMO] Błąd automatycznej promocji:", err);
            try {
              window.errorSound?.play?.();
            } catch (_) {}
          });

        return true; // przejęliśmy ruch
      }

      // Jeśli tylko jedna figura dostępna - automatycznie ją wybierz
      if (available.length === 1) {
        console.log(
          `[PROMO] Tylko jedna figura dostępna (${available[0]}) - automatyczny wybór`
        );

        const payload = {
          from,
          to,
          special_move: type,
          promotion_piece: available[0],
          available_pieces: available,
        };
        if (type === "promotion_capture" && captured_piece) {
          payload.captured_piece = captured_piece;
        }

        fetch(api("/move"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            console.log(
              `[PROMO] Automatyczna promocja do ${available[0]} wysłana`
            );
          })
          .catch((err) => {
            console.error("[PROMO] Błąd automatycznej promocji:", err);
            try {
              window.errorSound?.play?.();
            } catch (_) {}
          });

        return true; // przejęliśmy ruch
      }

      pending = {
        from,
        to,
        type,
        captured_piece,
        available_pieces: available,
        color,
      };
      openModal({ color, available });
      return true; // przejęliśmy ruch
    },

    /** Zamknij modal na potwierdzony ruch z Mercure */
    close() {
      closeModal();
    },
  };

  // Wystaw do globala
  window.Promotion = Promotion;

  // ====== Patch: przechwyć globalne sendMove ======
  if (typeof window.sendMove === "function") {
    const _orig = window.sendMove;
    window.sendMove = function patchedSendMove(from, to) {
      // Jeśli to promocja – pokaż modal i NIE wysyłaj zwykłego ruchu
      const intercepted = Promotion.considerMove(from, to);
      if (intercepted) return;
      // W przeciwnym razie idź jak zwykle
      return _orig.call(window, from, to);
    };
    console.log("[PROMO] sendMove() zostało opakowane (intercept).");
  } else {
    console.warn(
      "[PROMO] Brak sendMove() w momencie ładowania – spróbuję później."
    );
    // na wszelki wypadek spróbuj ponownie po DOMContentLoaded
    window.addEventListener("DOMContentLoaded", () => {
      if (typeof window.sendMove === "function" && !window.__promo_patched) {
        window.__promo_patched = true;
        const _orig = window.sendMove;
        window.sendMove = function patchedSendMove(from, to) {
          const intercepted = Promotion.considerMove(from, to);
          if (intercepted) return;
          return _orig.call(window, from, to);
        };
        console.log(
          "[PROMO] sendMove() zostało opakowane po DOMContentLoaded."
        );
      }
    });
  }
})();
