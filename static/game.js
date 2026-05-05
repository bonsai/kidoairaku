document.addEventListener('DOMContentLoaded', function() {
    let stream = null;
    let facingMode = 'user';
    let gameActive = false;
    let timeLeft = 60;
    let timerInterval = null;
    let detectInterval = null;
    let targetEmotion = null;
    let gameData = {
        startTime: null,
        endTime: null,
        targetEmotion: null,
        detections: [],
        matchCount: 0,
        detectCount: 0
    };

    const EMOJI_MAP = {
        "喜": "😊",
        "怒": "😠",
        "哀": "😢",
        "楽": "楽"
    };

    window.startGame = async function() {
        document.getElementById('startGameBtn').style.display = 'none';
        document.getElementById('gameCameraArea').classList.add('show');

        // カメラ起動
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            const video = document.getElementById('gameCameraPreview');
            video.srcObject = stream;
            if (facingMode === 'user') {
                video.style.transform = 'scaleX(-1)';
            }
        } catch (err) {
            alert('カメラが起動できません: ' + err.message);
            return;
        }

        // 目標表情をランダム選択
        const emotions = Object.keys(EMOJI_MAP);
        targetEmotion = emotions[Math.floor(Math.random() * emotions.length)];
        document.getElementById('targetEmotion').textContent = targetEmotion;
        document.getElementById('targetEmoji').textContent = EMOJI_MAP[targetEmotion];

        gameData.targetEmotion = targetEmotion;
        gameData.startTime = Date.now();
        gameActive = true;
        timeLeft = 60;

        // タイマー開始
        timerInterval = setInterval(() => {
            timeLeft--;
            document.getElementById('timer').textContent = timeLeft;
            if (timeLeft <= 0) {
                endGame();
            }
        }, 1000);

        // 表情検出開始（2秒ごと）
        detectInterval = setInterval(detectExpression, 2000);
        // 最初の検出
        setTimeout(detectExpression, 500);
    }

    async function detectExpression() {
        if (!gameActive || !stream) return;

        const video = document.getElementById('gameCameraPreview');
        const canvas = document.getElementById('gameCaptureCanvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(async function(blob) {
            const formData = new FormData();
            formData.append('image', blob, 'capture.jpg');

            try {
                const response = await fetch('/detect', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.emotion) {
                    const detected = data.emotion;
                    document.getElementById('detectedEmotion').textContent = detected;
                    document.getElementById('detectedEmoji').textContent = data.emoji || '😐';

                    const isMatch = detected === targetEmotion;
                    document.getElementById('matchStatus').textContent = isMatch ? '合致！' : '違う...';
                    document.getElementById('matchStatus').className = 'match-status ' + (isMatch ? 'match' : 'no-match');

                    // データ記録
                    const detection = {
                        time: Date.now() - gameData.startTime,
                        target: targetEmotion,
                        detected: detected,
                        match: isMatch
                    };
                    gameData.detections.push(detection);
                    gameData.detectCount++;
                    if (isMatch) gameData.matchCount++;

                    // 統計更新
                    document.getElementById('detectCount').textContent = gameData.detectCount;
                    document.getElementById('matchCount').textContent = gameData.matchCount;
                    const rate = gameData.detectCount > 0 ? Math.round((gameData.matchCount / gameData.detectCount) * 100) : 0;
                    document.getElementById('matchRate').textContent = rate + '%';
                }
            } catch (err) {
                console.error('検出エラー:', err);
            }
        }, 'image/jpeg', 0.9);
    }

    async function endGame() {
        gameActive = false;
        clearInterval(timerInterval);
        clearInterval(detectInterval);

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        document.getElementById('gameCameraArea').classList.remove('show');
        document.getElementById('gameStats').style.display = 'none';

        // ゲームデータをサーバーに送信して採点
        gameData.endTime = Date.now();

        try {
            const response = await fetch('/game/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameData: gameData })
            });
            const result = await response.json();

            // 結果表示
            document.getElementById('scoreNumber').textContent = result.score || '-';
            document.getElementById('scoreRank').textContent = result.rank || '-';
            document.getElementById('scoreComment').textContent = result.comment || '';

            const highlightsEl = document.getElementById('highlights');
            highlightsEl.innerHTML = '';
            if (result.highlights) {
                result.highlights.forEach(h => {
                    const li = document.createElement('li');
                    li.textContent = h;
                    highlightsEl.appendChild(li);
                });
            }

            document.getElementById('gameResultOverlay').classList.add('show');
        } catch (err) {
            alert('採点エラー: ' + err.message);
        }
    }
});
