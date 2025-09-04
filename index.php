<?php
// index.php – główny kontener aplikacji (nowy layout + tło)
?><!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Algo – Inteligentna Szachownica</title>

  <!-- Style globalny i styl planszy -->
  <link rel="stylesheet" href="./style.css" />
  <link rel="stylesheet" href="./chessboard/chessboard.css" />

  <script>
  // Adres Twojego backendu Symfony (Docker/localhost)
  window.CHESS_BACKEND_URL = 'http://127.0.0.1:8000';
</script>

</head>
<body>
  <!-- TŁO: particles (pełny ekran, pod całym layoutem) -->
  <canvas id="bgParticles" aria-hidden="true"></canvas>

  <div id="app">
    <main class="layout">
      <!-- LEWA KOLUMNA: SZACHOWNICA -->
      <section id="board-col">
        <?php include __DIR__ . '/chessboard/chessboard.php'; ?>
      </section>

      <!-- PRAWA KOLUMNA: PANEL GRY -->
      <aside id="panel-col">
        <!-- RUCH TERAZ -->
        <div class="panel-card" id="turn-card">
          <h3>Ruch teraz</h3>
          <div id="turn-indicator" class="turn-indicator white">
            <span class="dot"></span><span class="label">Białe</span>
          </div>
        </div>

        <!-- ZBITE FIGURY -->
        <div class="panel-card">
          <h3>Zbite figury przeciwnika</h3>
          <div id="captured-opponent" class="captured-grid"></div>
        </div>

        <div class="panel-card">
          <h3>Twoje zbite figury</h3>
          <div id="captured-player" class="captured-grid"></div>
        </div>

        <!-- LOGI RUCHÓW -->
        <div class="panel-card" id="logs-card">
          <h3>Logi ruchów</h3>
          <div class="logs-wrap">
            <table class="moves-table">
              <thead><tr><th>#</th><th>Białe</th><th>Czarne</th></tr></thead>
              <tbody id="moves-tbody"></tbody>
            </table>
          </div>
        </div>

        <!-- STATUS + AKCJE -->
        <div class="panel-row">
          <div class="panel-card status-card">
            <h3>Status</h3>
            <div class="status-badges">
              <span id="status-raspi"  class="badge badge-muted">RPi: —</span>
              <span id="status-engine" class="badge badge-muted">Silnik: —</span>
            </div>
          </div>
          <div class="panel-card actions-card">
            <h3>Akcje</h3>
            <button class="btn-reset" data-action="reset-game">Resetuj grę</button>
          </div>
        </div>
      </aside>
    </main>
  </div>

  <!-- MODAL: KONIEC GRY -->
  <div id="gameOverOverlay" class="go-overlay" aria-hidden="true">
    <div class="go-modal" role="dialog" aria-modal="true">
      <h3 id="goTitle">Koniec gry</h3>
      <p id="goSubtitle">Biali wygrali (szach mat)</p>
      <div class="go-actions">
        <button id="goResume" class="go-btn go-btn-ghost">Wróć do partii</button>
        <button class="go-btn go-btn-primary" data-action="reset-game">Zacznij od nowa</button>
      </div>
    </div>
    <canvas id="goConfetti"></canvas>
  </div>

  <!-- Skrypty -->
  <script src="./chessboard/chessboard.js"></script>
  <script src="./validation/backend-integration.js"></script>
</body>
</html>
