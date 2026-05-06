document.addEventListener('DOMContentLoaded', function() {
    let stream = null;
    let facingMode = 'user';
    let gameActive = false;
    let timeLeft = 30;
    let timerInterval = null;
    let detectInterval = null;
    let targetEmotion = null;
    let gameData = {
        startTime: null,
        endTime: null,
        targetEmotion: null,
        detections: [],
        matchCount: 0,
        detectCount: 0,
        totalMatchTime: 0
    };
    let overlayCtx = null;
    let coinSound = null;

    const EMOJI_MAP = {
        "喜": "😊",
        "怒": "😠",
        "哀": "😢",
        "楽": "楽"
    };

    // コイン音初期化
    function initCoinSound() {
        coinSound = new Audio('/static/coin.mp3');
        coinSound.volume = 0.5;
    }

    function playCoinSound() {
        try {
            if (!coinSound) initCoinSound();
            coinSound.currentTime = 0;
            coinSound.play();
        } catch (e) {
            // Web Audio APIフォールバック
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.frequency.value = 1200;
                gainNode.gain.value = 0.3;
                oscillator.start();
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                oscillator.stop(audioContext.currentTime + 0.3);
            } catch (e2) {
                console.error('Sound error:', e2);
            }
        }
    }

    function addCoin() {
        const coins = parseInt(localStorage.getItem('kidoairaku_coins') || '0');
        const newCoins = coins + 1;
        localStorage.setItem('kidoairaku_coins', newCoins.toString());
        updateCoinDisplay();
        playCoinSound();
    }

    function updateCoinDisplay() {
        const coins = parseInt(localStorage.getItem('kidoairaku_coins') || '0');
        const el = document.getElementById('coinCount');
        if (el) el.textContent = coins;
    }

    async function initCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: facingMode, 
                    width: { ideal: 1280, max: 1280 }, 
                    height: { ideal: 720, max: 720 }
                }
            });
            const video = document.getElementById('gameCameraPreview');
            const canvas = document.getElementById('overlayCanvas');
            video.srcObject = stream;
            if (facingMode === 'user') {
                video.style.transform = 'scaleX(-1)';
                canvas.style.transform = 'scaleX(-1)';
            }
            document.getElementById('gameCameraArea').classList.add('show');

            video.addEventListener('loadedmetadata', () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.style.width = video.offsetWidth + 'px';
                canvas.style.height = video.offsetHeight + 'px';
                overlayCtx = canvas.getContext('2d');
            });

            startGame();
        } catch (err) {
            alert('カメラが起動できません: ' + err.message);
        }
    }

    initCamera();

    async function startGame() {
        const emotions = Object.keys(EMOJI_MAP);
        targetEmotion = emotions[Math.floor(Math.random() * emotions.length)];
        document.getElementById('targetEmotion').textContent = targetEmotion;
        document.getElementById('targetEmoji').textContent = EMOJI_MAP[targetEmotion];

        gameData.targetEmotion = targetEmotion;
        gameData.startTime = Date.now();
        gameActive = true;
        timeLeft = 30;

        timerInterval = setInterval(() => {
            timeLeft--;
            document.getElementById('timer').textContent = timeLeft;
            if (timeLeft <= 0) {
                endGame();
            }
        }, 1000);

        detectInterval = setInterval(detectExpression, 1000);
        setTimeout(detectExpression, 500);
    }

    async function detectExpression() {
        if (!gameActive || !stream) return;

        const video = document.getElementById('gameCameraPreview');
        const canvas = document.getElementById('gameCaptureCanvas');
        
        // リサイズ：最大 640x480 に抑える
        const maxWidth = 640;
        const maxHeight = 480;
        let width = video.videoWidth;
        let height = video.videoHeight;
        
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, width, height);

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
                    document.getElementById('matchStatus').textContent = isMatch ? '合致！+1💰' : '違う...';
                    document.getElementById('matchStatus').className = 'match-status ' + (isMatch ? 'match' : 'no-match');

                    const detection = {
                        time: Date.now() - gameData.startTime,
                        target: targetEmotion,
                        detected: detected,
                        match: isMatch
                    };
                    gameData.detections.push(detection);
                    gameData.detectCount++;
                    if (isMatch) {
                        gameData.matchCount++;
                        gameData.totalMatchTime += 1;
                        addCoin();
                    }

                    document.getElementById('detectCount').textContent = gameData.detectCount;
                    document.getElementById('matchCount').textContent = gameData.matchCount;
                    const rate = gameData.detectCount > 0 ? Math.round((gameData.matchCount / gameData.detectCount) * 100) : 0;
                    document.getElementById('matchRate').textContent = rate + '%';

                    drawEmojiOnFace(detected);
                }
            } catch (err) {
                console.error('検出エラー:', err);
                // エラー時も続行
            }
        }, 'image/jpeg', 0.7); // 圧縮品質を 0.7 に低下（サイズ削減）
    }

    function drawEmojiOnFace(emotion) {
        if (!overlayCtx) return;
        const canvas = document.getElementById('overlayCanvas');
        overlayCtx.clearRect(0, 0, canvas.width, canvas.height);
        const emoji = EMOJI_MAP[emotion] || '😐';
        overlayCtx.font = '120px serif';
        overlayCtx.textAlign = 'center';
        overlayCtx.textBaseline = 'middle';
        overlayCtx.fillText(emoji, canvas.width / 2, canvas.height / 2);
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

        gameData.endTime = Date.now();

        try {
            const response = await fetch('/game/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameData: gameData })
            });
            const result = await response.json();

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

    updateCoinDisplay();
});
