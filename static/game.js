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

    // UX 向上：トースト表示、振動フィードバック、コインアニメーション
    function showToast(message, duration = 3000) {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }

    function vibrate(pattern = [50]) {
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }

    function addCoin() {
        const coins = parseInt(localStorage.getItem('kidoairaku_coins') || '0');
        const newCoins = coins + 1;
        localStorage.setItem('kidoairaku_coins', newCoins.toString());
        
        // コイン表示のアニメーション
        const coinEl = document.querySelector('.coin-display');
        if (coinEl) {
            coinEl.classList.remove('coin-pop');
            void coinEl.offsetWidth; // リフロー強制でアニメーション再トリガー
            coinEl.classList.add('coin-pop');
        }
        
        updateCoinDisplay();
        playCoinSound();
        vibrate([30]); // 軽い振動
        showToast('+1 💰', 1500);
    }

    function updateCoinDisplay() {
        const coins = parseInt(localStorage.getItem('kidoairaku_coins') || '0');
        const el = document.getElementById('coinCount');
        if (el) {
            // カウントアップアニメーション
            const current = parseInt(el.textContent) || 0;
            if (current !== coins) {
                el.textContent = coins;
            }
        }
    }

    // ローディング表示の制御
    function showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    async function initCamera() {
        try {
            // カメラ起動前にローディング表示
            showLoading(true);
            
            stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: facingMode, 
                    width: { ideal: 1280 }, 
                    height: { ideal: 720 }
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
                
                // カメラ準備完了後、ローディングを解除
                showLoading(false);
            });

            startGame();
        } catch (err) {
            showLoading(false);
            showToast('カメラが起動できません：' + err.message, 5000);
            vibrate([100, 50, 100]); // エラー時は長めの振動
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

            // ローディング解除後に結果表示
            showLoading(false);
            document.getElementById('gameResultOverlay').classList.add('show');
            
            // 結果表示時に祝賀の振動
            vibrate([200, 100, 200]);
            showToast('🎉 採点完了！', 2000);
        } catch (err) {
            showLoading(false);
            showToast('採点エラー：' + err.message, 5000);
            vibrate([100, 50, 100]);
        }
    }

    updateCoinDisplay();
});
