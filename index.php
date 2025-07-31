<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Magiczne szachy</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-LN+7fdVzj6u52u30Kp6M/trliBMCMKTyK833zpbD+pXdCLuTusPj697FH4R/5mcr" crossorigin="anonymous">
</head>
<body>
    <div id="szachownica">
        <?php

            include 'chessboard/chessboard.php';



        ?>
    </div>
    <div id="interfejs">
        <div id="interfejsDziecko" class="bg-black bg-gradient">
            <div id="sterowanie">
                <div id="obaPrzyciskiKontener">
                    <button id="mikrofon" class="btn btn-outline-primary border-3">
                        <img src="./img/mikrofon.png" alt="mikrofon">
                    </button>
                    <button id="cofnijRuch" class="btn btn-outline-danger border-3">
                        <img src="./img/cofnij.png" alt="confij">
                    </button>
                </div>
                    <form id="wprowadzRecznie">
                        <h2>Wprowadź ruch ręcznie</h2>

                        <!-- tutaj jest formularz do wprowadzania ręcznie ruchu -->

                        <input type="text" class="form-control" id="recznyRuch">
                        <div id="przyciskiKontener">
                            <input type="submit" value="Wprowadź" class="btn btn-outline-success przyciski">
                            <input type="reset" value="Anuluj" class="btn btn-outline-danger przyciski">
                        </div>
                    </form>

            </div>
            <div id="logi">
                <h2>Logi ruchów</h2>
                <div>
                    <?php

                        //tutaj wyświetlanie logów 


                    ?>
                </div>
            </div>
        </div>
    </div>
</body>
</html>