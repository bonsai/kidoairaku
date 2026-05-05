document.addEventListener('DOMContentLoaded', function() {
    const imageInput = document.getElementById('imageInput');
    const uploadArea = document.getElementById('uploadArea');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const resultOverlay = document.getElementById('resultOverlay');
    const resultEmoji = document.getElementById('resultEmoji');
    const resultEmotion = document.getElementById('resultEmotion');

    // フローティング絵文字作成
    createFloatingEmoji();

    // カメラ関連
    let stream = null;
    let facingMode = 'user';

    window.startCamera = async function() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            const video = document.getElementById('cameraPreview');
            video.srcObject = stream;
            if (facingMode === 'user') {
                video.style.transform = 'scaleX(-1)';
            } else {
                video.style.transform = 'none';
            }
            document.getElementById('cameraArea').classList.add('show');
            document.getElementById('startBtn').style.display = 'none';
        } catch (err) {
            alert('カメラが起動できません: ' + err.message);
        }
    }

    // ページロード時にカメラ自動起動
    window.addEventListener('load', function() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            window.startCamera();
        }
    });

    window.switchCamera = async function() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        facingMode = facingMode === 'user' ? 'environment' : 'user';
        window.startCamera();
    }

    window.capture = function() {
        const video = document.getElementById('cameraPreview');
        const canvas = document.getElementById('captureCanvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(function(blob) {
            sendImage(blob);
        }, 'image/jpeg', 0.9);
    }

    async function sendImage(blob) {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        document.getElementById('cameraArea').classList.remove('show');
        document.getElementById('loadingOverlay').classList.add('show');
        startLoadingText();

        const formData = new FormData();
        formData.append('image', blob, 'capture.jpg');

        try {
            const response = await fetch('/detect', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            setTimeout(() => {
                document.getElementById('loadingOverlay').classList.remove('show');
                if (data.error) {
                    alert('エラー: ' + data.error);
                    document.getElementById('startBtn').style.display = 'block';
                } else {
                    showResult(data);
                }
            }, 3000);

        } catch (err) {
            setTimeout(() => {
                document.getElementById('loadingOverlay').classList.remove('show');
                alert('通信エラー: ' + err.message);
                document.getElementById('startBtn').style.display = 'block';
            }, 3000);
        }
    }

    function startLoadingText() {
        const texts = ['診断中…', '分析中…', '判断中…', '結果は…？'];
        let i = 0;
        const textEl = document.getElementById('loadingText');
        const emojiEl = document.getElementById('loadingEmoji');
        const emojis = ['😐', '😊', '😠', '😢', '🎊'];
        let j = 0;
        const interval = setInterval(() => {
            if (i < texts.length) {
                textEl.textContent = texts[i];
                emojiEl.textContent = emojis[j % emojis.length];
                i++;
                j++;
            } else {
                clearInterval(interval);
            }
        }, 750);
    }

    function showResult(data) {
        const overlay = document.getElementById('resultOverlay');
        resultEmoji.textContent = data.emoji || '😐';
        resultEmotion.textContent = data.emotion || '-';
        overlay.classList.add('show');
    }

    window.retry = function() {
        resultOverlay.classList.remove('show');
        document.getElementById('startBtn').style.display = 'block';
        resultEmoji.textContent = '😐';
        resultEmotion.textContent = '-';
        window.startCamera();
    }

    window.shareTwitter = function() {
        const emotion = resultEmotion.textContent;
        const emoji = resultEmoji.textContent;
        const baseText = `喜怒哀楽：私は今「${emotion}」${emoji}です`;
        const hashtags = `#喜怒哀楽 #AI表情判定 #${emotion}`;

        let shareUrl = window.location.href;
        if (window.latestScreenshotUrl) {
            shareUrl = window.location.origin + window.latestScreenshotUrl;
        }

        const fullText = `${baseText}\n${hashtags}`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(fullText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
    }

    window.copyResult = function() {
        const emotion = resultEmotion.textContent;
        const emoji = resultEmoji.textContent;
        const text = `喜怒哀楽：私は今「${emotion}」${emoji}です\n#喜怒哀楽 #AI表情判定`;
        navigator.clipboard.writeText(text).then(() => {
            alert('結果をコピーしました！');
        }).catch(err => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('結果をコピーしました！');
        });
    }

    // フローティング絵文字作成
    function createFloatingEmoji(count) {
        const container = document.body;
        const emojis = ['😊', '😠', '😢', '🎊'];
        for (let i = 0; i < 20; i++) {
            const el = document.createElement('div');
            el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            el.style.position = 'fixed';
            el.style.fontSize = (Math.random() * 25 + 10) + 'px';
            el.style.opacity = Math.random() * 0.3 + 0.1;
            el.style.left = Math.random() * 100 + 'vw';
            el.style.top = '-30px';
            el.style.zIndex = '0';
            el.style.pointerEvents = 'none';
            const duration = Math.random() * 15 + 10;
            const delay = Math.random() * 15;
            el.style.animation = `sakuraFall ${duration}s linear ${delay}s infinite`;
            el.style.setProperty('--sway', (Math.random() * 100 + 50) + 'px');
            container.appendChild(el);
        }

        const style = document.createElement('style');
        style.textContent = `
            @keyframes sakuraFall {
                0% {
                    transform: translateY(-30px) rotate(0deg) translateX(0);
                    opacity: 0;
                }
                10% {
                    opacity: 0.4;
                }
                25% {
                    transform: translateY(25vh) rotate(180deg) translateX(calc(var(--sway, 50px) * 0.5));
                }
                50% {
                    transform: translateY(50vh) rotate(360deg) translateX(calc(var(--sway, 50px) * -0.5));
                }
                75% {
                    transform: translateY(75vh) rotate(540deg) translateX(var(--sway, 50px));
                }
                90% {
                    opacity: 0.4;
                }
                100% {
                    transform: translateY(100vh) rotate(720deg) translateX(0);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
});
