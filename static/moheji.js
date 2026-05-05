document.addEventListener('DOMContentLoaded', function() {
    let stream = null;
    let facingMode = 'user';
    let overlayCtx = null;
    let detectInterval = null;

    // モヘジのパターン（ヘノヘノモヘジ）
    const MOHEJI_FACE = 'ヘノヘノモヘジ';

    async function initCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            const video = document.getElementById('mohejiCameraPreview');
            const canvas = document.getElementById('mohejiOverlayCanvas');
            video.srcObject = stream;
            if (facingMode === 'user') {
                video.style.transform = 'scaleX(-1)';
                canvas.style.transform = 'scaleX(-1)';
            }
            document.getElementById('mohejiCameraArea').classList.add('show');

            video.addEventListener('loadedmetadata', () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.style.width = video.offsetWidth + 'px';
                canvas.style.height = video.offsetHeight + 'px';
                overlayCtx = canvas.getContext('2d');
            });

            // リアルタイム検出開始
            detectInterval = setInterval(detectAndOverlay, 1500);
        } catch (err) {
            alert('カメラが起動できません: ' + err.message);
        }
    }

    async function detectAndOverlay() {
        if (!stream) return;

        const video = document.getElementById('mohejiCameraPreview');
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
                    document.getElementById('mohejiStatus').textContent = `検出: ${data.emotion} ${data.emoji}`;
                    drawMoheji(data.emotion);
                }
            } catch (err) {
                console.error('検出エラー:', err);
            }
        }, 'image/jpeg', 0.9);
    }

    function drawMoheji(emotion) {
        if (!overlayCtx) return;
        const canvas = document.getElementById('mohejiOverlayCanvas');
        overlayCtx.clearRect(0, 0, canvas.width, canvas.height);

        // 薄い白黒のモヘジを描画
        overlayCtx.globalAlpha = 0.4;
        overlayCtx.fillStyle = '#000000';
        overlayCtx.strokeStyle = '#000000';
        overlayCtx.lineWidth = 3;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const faceRadius = Math.min(canvas.width, canvas.height) * 0.3;

        // 顔の輪郭（円）
        overlayCtx.beginPath();
        overlayCtx.arc(centerX, centerY, faceRadius, 0, Math.PI * 2);
        overlayCtx.stroke();

        // 目（ヘ）
        const eyeY = centerY - faceRadius * 0.2;
        const eyeSpacing = faceRadius * 0.35;
        overlayCtx.font = `${faceRadius * 0.4}px serif`;
        overlayCtx.textAlign = 'center';
        overlayCtx.textBaseline = 'middle';
        overlayCtx.fillText('ヘ', centerX - eyeSpacing, eyeY);
        overlayCtx.fillText('ヘ', centerX + eyeSpacing, eyeY);

        // 口（ノヘノモヘジ）
        overlayCtx.font = `${faceRadius * 0.5}px serif`;
        overlayCtx.fillText('ノヘノモヘジ', centerX, centerY + faceRadius * 0.3);

        // 腕（へノへ）
        overlayCtx.lineWidth = 5;
        // 左腕
        overlayCtx.beginPath();
        overlayCtx.moveTo(centerX - faceRadius, centerY);
        overlayCtx.lineTo(centerX - faceRadius * 1.5, centerY - faceRadius * 0.5);
        overlayCtx.stroke();
        // 右腕
        overlayCtx.beginPath();
        overlayCtx.moveTo(centerX + faceRadius, centerY);
        overlayCtx.lineTo(centerX + faceRadius * 1.5, centerY - faceRadius * 0.5);
        overlayCtx.stroke();

        overlayCtx.globalAlpha = 1.0;
    }

    // カメラ自動起動
    initCamera();
});
