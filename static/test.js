document.addEventListener('DOMContentLoaded', function() {
    let stream = null;
    let facingMode = 'user';
    let overlayCtx = null;
    let detectInterval = null;

    const EMOJI_MAP = {
        "喜": "😊",
        "怒": "😠",
        "哀": "😢",
        "楽": "楽"
    };

    async function initCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            const video = document.getElementById('testCameraPreview');
            const canvas = document.getElementById('faceOverlayCanvas');
            video.srcObject = stream;
            if (facingMode === 'user') {
                video.style.transform = 'scaleX(-1)';
                canvas.style.transform = 'scaleX(-1)';
            }
            document.getElementById('testCameraArea').classList.add('show');

            video.addEventListener('loadedmetadata', () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.style.width = video.offsetWidth + 'px';
                canvas.style.height = video.offsetHeight + 'px';
                overlayCtx = canvas.getContext('2d');
            });

            detectInterval = setInterval(detectAndOverlay, 1500);
        } catch (err) {
            alert('カメラが起動できません: ' + err.message);
        }
    }

    async function detectAndOverlay() {
        if (!stream) return;

        const video = document.getElementById('testCameraPreview');
        const canvas = document.createElement('canvas');
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
                    document.getElementById('detectedEmotion').textContent = data.emotion;
                    document.getElementById('detectedEmoji').textContent = data.emoji || '😐';
                    drawEmojiOnFace(data.emotion);
                }
            } catch (err) {
                console.error('検出エラー:', err);
            }
        }, 'image/jpeg', 0.9);
    }

    function drawEmojiOnFace(emotion) {
        if (!overlayCtx) return;
        const canvas = document.getElementById('faceOverlayCanvas');
        overlayCtx.clearRect(0, 0, canvas.width, canvas.height);
        const emoji = EMOJI_MAP[emotion] || '😐';
        overlayCtx.font = '120px serif';
        overlayCtx.textAlign = 'center';
        overlayCtx.textBaseline = 'middle';
        overlayCtx.fillText(emoji, canvas.width / 2, canvas.height / 2);
    }

    initCamera();
});
