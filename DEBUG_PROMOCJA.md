# Debug Test - Promocja Pionka

## Krok po kroku testowanie przypadku z FEN

### Aktualny FEN:

```
6nr/QP4pp/8/4k3/6B1/8/R1PPK1PP/1NB4R w - - 1 22
```

### Analiza pozycji:

- **Biała dama na a7** (wq na pozycji a7)
- **Biały pionek na b7** (wp na pozycji b7) - gotowy do promocji na b8
- **Czarny skoczek na g8** (bn na pozycji g8)
- **Czarna wieża na h8** (br na pozycji h8)

### Problem:

Frontend oferuje promocję do damy (queen) mimo że już jest biała dama na planszy.

### Debugowanie w konsoli przeglądarki:

```javascript
// 1. Sprawdź stan planszy
console.log("Stan planszy:", window.boardState);

// 2. Sprawdź dostępne figury dla białych
window.getAvailablePromotionPieces("w");

// 3. Sprawdź zbite figury
document.querySelectorAll("[data-piece-type]");

// 4. Sprawdź kontenery zbitych figur
console.log(
  "Zbite przeciwnika:",
  document.getElementById("captured-opponent").innerHTML
);
console.log(
  "Zbite gracza:",
  document.getElementById("captured-player").innerHTML
);

// 5. Sprawdź ile białych dam jest na planszy
Object.values(window.boardState).filter((p) => p === "wq").length;
```

### Spodziewany wynik:

- **Białych dam na planszy: 1** (już jest wq na a7)
- **Dostępne figury do promocji: knight** (tylko skoczek, bo dama już jest)

### Możliwe przyczyny problemu:

1. Błędny stan `window.boardState` - nie odzwierciedla rzeczywistego FEN
2. Błędna logika w `getAvailablePromotionPieces()`
3. Nie są prawidłowo śledzone zbite figury

### Po naprawie:

Modal promocji powinien pokazywać tylko **1 opcję: knight** (skoczek), nie queen (damę).
