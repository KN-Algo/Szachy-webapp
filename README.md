# Szachy WebApp — komponent szachownicy

Responsywna aplikacja webowa wizualizująca **fizyczną** grę w szachy. Frontend (HTML/JS/PHP) nasłuchuje zdarzeń z backendu (Symfony + MQTT + Mercure) i **odwzorowuje ruchy** z Raspberry Pi.  
Moduł frontu jest osadzany na istniejącej stronie jako **niezależny komponent** (`chessboard.php`).

---

## Spis treści
- [Architektura i przepływ danych](#architektura-i-przepływ-danych)
- [Wymagania, uruchomienie, konfiguracja](#wymagania-uruchomienie-konfiguracja)
- [Struktura repo i plików](#struktura-repo-i-plików)
- [Komunikacja: endpointy i zdarzenia Mercure](#komunikacja-endpointy-i-zdarzenia-mercure)
- [Zasady renderu i bezpiecznik resetu](#zasady-renderu-i-bezpiecznik-resetu)
- [UI/UX: podświetlenia, dźwięki, placeholdery](#uiux-podświetlenia-dźwięki-placeholdery)
- [Testy ręczne (bez backendu) — do konsoli](#testy-ręczne-bez-backendu--do-konsoli)
- [Checklisty testowe](#checklisty-testowe)
- [Konwencja logów](#konwencja-logów)

---

## Architektura i przepływ danych

1. **Frontend** (`chessboard.php`, `chessboard.js`, `backend-integration.js`)
   - render planszy i figur,
   - obsługa klików, wysyłanie `POST /possible-moves`,
   - subskrypcja **Mercure (SSE)** i reakcja na zdarzenia.

2. **Backend (Symfony)**  
   - `GET /state` (zwraca FEN), `POST /possible-moves`,
   - publikuje zdarzenia na topic:  
     `http://127.0.0.1:8000/chess/updates`.

3. **Raspberry Pi / MQTT**  
   - wykrywa ruchy na fizycznej planszy → backend → Mercure → frontend.

**Paleta Algo:** `#000424` (tło/kontrast), `#fff2f0` (akcenty).

---

## Wymagania, uruchomienie, konfiguracja

### Wymagania
- Docker (zalecany (od Adriana) **lub** lokalny serwer (np. XAMPP/Apache) dla frontu.
-

### .env backendu (używany w projekcie)
```env
APP_ENV=dev
APP_SECRET=abc123

MQTT_BROKER=127.0.0.1
MQTT_PORT=1883
MQTT_CLIENT_ID=szachmat_backend

MERCURE_URL=http://127.0.0.1:3000/.well-known/mercure
MERCURE_PUBLIC_URL=http://127.0.0.1:3000/.well-known/mercure
MERCURE_JWT_SECRET=SzachMat123

DATABASE_URL="sqlite:///%kernel.project_dir%/var/data.db"


```
Uruchomienie (skrót)
Start usług Docker (backend :8000, Mercure :3000, broker MQTT :1883).

Wystaw front (np. index.php + chessboard.php) lokalnie.

Wejdź na stronę z modułem szachownicy.

## Struktura repo i plików
```struct
assets/
  pieces/       # ikony figur: wr, wn, wb, wq, wk, wp, br, bn, bb, bq, bk, bp
  sounds/       # move.wav, capture.wav, error.wav, select.wav
chessboard/
  chessboard.css
  chessboard.js
  chessboard.php
img/
validation/
index.php
backend-integration.js
README.md
```
** Chessboard.php jest modułem zawartym w index.php poprzez include.php ;) **

Placeholdery na zbite figury (HTML):

#captured-white – zbite białe,
#captured-black – zbite czarne,
wewnątrz: .captured-slot (puste sloty na obrazki).

## Komunikacja: endpointy i zdarzenia Mercure
### REST
```rest
GET  http://localhost:8000/state           # → { fen: "<FEN>" }
POST http://localhost:8000/possible-moves  # body: { position: "e2" }
                                           # ← { status: "request_sent" }
# (opcjonalnie)
GET  http://localhost:8000/log
```

### Mercure (SSE)
Subskrypcja:
```
http://localhost:3000/.well-known/mercure?topic=http://127.0.0.1:8000/chess/updates
```
Obsługiwane typy:
```
possible_moves   // { type, position, moves: string[] }
move_confirmed   // { type, move:{from,to}, state:{fen} }
move_rejected    // { type, reason }
state/update     // { type, fen, ... }
ai_move_executed // { type, move:{from,to}, state:{fen} }
raspi_status     // { type, data:{ status:'moving'|'ready'|'error', ... } }
engine_status    // { type, data:{ status:'thinking'|'ready'|'error', ... } }
move_pending     // opcjonalne
game_reset       // start nowej partii
log/update       // opcjonalne
```
**Ważne: do poprawnego bicia do placeholderów wymagamy move.{from,to} (w move_confirmed/ai_move_executed).**

## Zasady renderu i bezpiecznik resetu
Brak podwójnego renderu na starcie: po GET /state render tylko, gdy FEN różni się od obecnego boardState.

Bezpiecznik: po pierwszym ruchu ignorujemy FEN pozycji startowej, chyba że przyjdzie game_reset.

Klik w figurę zawsze:

czyści stare highlighty,

podświetla wybrane pole,

wysyła nowe POST /possible-moves (można klikać wielokrotnie, backend policzy).

## UI/UX: podświetlenia, dźwięki, placeholdery

**Podświetlenia**
Neonowa obwódka (.square.active::after) – wariant multi‑cell friendly (ostry kontur, mały glow).

Na jasnych polach dodatkowy override .square.light.active::after (wyłączony mix-blend, ciemny kontrapierścień), dzięki czemu obrys nie znika.

**Dźwięki (assets/sounds/)**
select.wav – kliknięcie figury (podgląd ruchów),

move.wav – move_confirmed / ai_move_executed,

capture.wav – wykryte bicie,

error.wav – move_rejected.

**Uwaga: przeglądarka może blokować audio do pierwszej interakcji—klik w planszę odblokowuje dźwięki.**


**Placeholdery zbitych figur**
capturePiece(code) wstawia grafikę do pierwszego wolnego .captured-slot w #captured-white / #captured-black.

Bicie wykrywane w backend-integration.js przy move_confirmed/ai_move_executed (porównanie prev[to] z drużyną figury z move.from).

Dla samego state/update nie zgadujemy bicia (brak 100% pewności).

---
## Testy ręczne (bez backendu) — do konsoli
### 0) Highlight możliwych ruchów
```
highlightPossibleMoves('e2', ['e3','e4']);
```
### 1) Bicie (pewne, z placeholderem)
```
(function(){
  function toFEN(state){
    const files=['a','b','c','d','e','f','g','h'], map={p:'p',r:'r',n:'n',b:'b',q:'q',k:'k'}, rows=[];
    for(let r=8;r>=1;r--){ let row='',e=0;
      for(let f=0; f<8; f++){ const sq=files[f]+r, code=state[sq];
        if(!code){ e++; continue; } if(e){ row+=e; e=0; }
        const k=map[code[1]]; row += (code[0]==='w') ? k.toUpperCase() : k;
      } if(e) row+=e; rows.push(row);
    } return rows.join('/')+' w - - 0 1';
  }

  const restore = {...window.boardState};
  const prev = {...restore, d3:'bp'}; prev.e2='wp';      // ofiara + napastnik
  window.boardState = prev; renderBoard(window.boardState);

  const next = {...prev}; delete next.e2; next.d3='wp';  // e2 -> d3
  const fenNext = toFEN(next);

  applyIncomingState({ fen: fenNext }, 'console_test_capture', { from:'e2', to:'d3' });
```
### 2) Ruch AI (bez bicia) + dźwięk
```
(function(){
  function toFEN(state){
    const files=['a','b','c','d','e','f','g','h'], map={p:'p',r:'r',n:'n',b:'b',q:'q',k:'k'}, rows=[];
    for(let r=8;r>=1;r--){ let row='',e=0;
      for(let f=0; f<8; f++){ const sq=files[f]+r, code=state[sq];
        if(!code){ e++; continue; } if(e){ row+=e; e=0; }
        const k=map[code[1]]; row += (code[0]==='w') ? k.toUpperCase() : k;
      } if(e) row+=e; rows.push(row);
    } return rows.join('/')+' w - - 0 1';
  }
  const prev={...window.boardState}, next={...prev}; next.f6=prev.g8; delete next.g8;
  const fenNext = toFEN(next);

  // symulacja zdarzenia Mercure
  (function onAiMoveExecuted(data){
    if (data.state?.fen) applyIncomingState(data.state, 'ai_move_executed', data.move);
    try { window.moveSound?.play?.(); } catch(_) {}
  })({ type:'ai_move_executed', move:{from:'g8',to:'f6'}, state:{ fen: fenNext } });
})();
```
### 3) Odrzucenie ruchu
```
showMoveRejected('Illegal move (console test)');
```
### 4) Podświetlenia wielu pól
```
highlightPossibleMoves('c7', ['c6','c5']);
highlightPossibleMoves('e2', ['e3','e4']);
```
### 5) Wyczyść podświetlenia
```
document.querySelectorAll('.square.active,.square.invalid')
  .forEach(el => el.classList.remove('active','invalid'));
```
---

## Checklisty testowe
### A. Integracja
 - Na starcie 1 render pozycji startowej (brak duplikatu).
 - Klik w różne figury wielokrotnie → zawsze idzie POST /possible-moves + highlight nowej figury.
 - possible_moves → highlight pól docelowych.
 - move_confirmed / ai_move_executed → render z FEN + move.wav.
 - Bicie (z move.{from,to}) → placeholder + capture.wav.
 - move_rejected → error.wav, wyczyszczenie zaznaczeń.
 - state/update bez zmiany FEN → brak renderu.
 - game_reset → pozwala na powrót do FEN startowego.

### B. UI/UX
 - Neon na jasnych i ciemnych polach dobrze widoczny.
 - Jednoczesne highlighty nie „zlewają się”.
 - Klik figury → select.wav.
 - 
### C. Placeholdery
 - Istnieją #captured-white i #captured-black z .captured-slot.
 - Sloty wypełniają się poprawnie przy serii bić.


## Konwencja logów
```
[INIT], [BOOT] — start modułów

[API] — żądania HTTP (/state, /possible-moves)

[Mercure] — status połączenia i zdarzenia SSE

[STATUS][RPi], [STATUS][ENGINE] — statusy sprzętu / silnika

[RENDER] a2 → wp — log kontrolny rysowania figur

[Ruch odrzucony] ... — decyzja o odrzuceniu ruchu
```
---
** UWAGA **
Strona wciąż posiada błędy czysto kosmetyczne. Dodatkowo brak jej responsywności - zajmiemy się tym
W razie pytań służę pomocą








