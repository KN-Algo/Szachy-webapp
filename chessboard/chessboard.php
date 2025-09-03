<?php
$files = ['a','b','c','d','e','f','g','h'];
$ranks = [8,7,6,5,4,3,2,1];

// Styl + wrapper główny
echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Raleway:wght@500&display=swap">';


echo '<div class="chessboard-wrapper-row">';



// Prawy panel – Szachownica
echo '<div class="chessboard-wrapper">';

// Chessboard grid (z opisami A–H i 1–8)
echo '<div class="chessboard-container">';

// Górny rząd: pusta + litery + pusta
echo "<div></div>";
foreach ($files as $file) echo "<div class='legend-letter'>$file</div>";
echo "<div></div>";

// Rzędy szachownicy z numerami i polami
foreach ($ranks as $rIdx => $rank) {
  echo "<div class='legend-number'>$rank</div>";
  foreach ($files as $fIdx => $file) {
    $isLight = ($fIdx + $rIdx) % 2 === 0;
    $colorClass = $isLight ? 'light' : 'dark';
    $coord = $file . $rank;
    echo "<div class='square $colorClass' data-coord='$coord'></div>";
  }
  echo "<div class='legend-number'>$rank</div>";
}

// Dolny rząd: pusta + litery + pusta
echo "<div></div>";
foreach ($files as $file) echo "<div class='legend-letter'>$file</div>";
echo "<div></div>";

echo '</div>'; // chessboard-container
echo '</div>'; // chessboard-wrapper
echo '</div>'; // chessboard-wrapper-row
?>


