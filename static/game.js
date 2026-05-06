// ===== 設定 =====
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';
const GAME_DURATION = 30;          // 秒
const EMOTION_INTERVAL = 3000;     // 3秒ごとに絵文字切替
const DETECTION_INTERVAL = 200;    // 0.2秒ごとに検出
const MATCH_FRAMES = 2;            // 何フレーム連続で合致したらコイン加算
const COINS_PER_MATCH = 10;        // 合致1回あたりのコイン

const EMOTIONS = [
  { id: 'happy',     label: '喜',  emoji: '😄', threshold: 0.5 },
  { id: 'angry',     label: '怒',  emoji: '😠', threshold: 0.4 },
  { id: 'sad',       label: '哀',  emoji: '😢', threshold: 0.3 },
  { id: 'surprised', label: '楽',  emoji: '😲', threshold: 0.4 },
  { id: 'fearful',   label: '驚',  emoji: '😱', threshold: 0.3 },
  { id: 'disgusted', label: '嫌',  emoji: '🤢', threshold: 0.3 },
  { id: 'neutral',   label: '無',  emoji: '😐', threshold: 0.6 },
];

// ===== 状態 =====
let gameState = {
  phase: 'init',       // init | loading | ready | playing | result
  coins: 0,
  matchCount: 0,
  detectCount: 0,
  consecutiveMatch: 0,
  targetEmotion: null,
  timeLeft: GAME_DURATION,
  stream: null,
  timerInterval: null,
  emotionInterval: null,
  detectionInterval: null,
};

// ===== DOM参照 =====
const $ = id => document.getElementById(id);
const els = {
  coinCount:        $('coinCount'),
  targetEmotion:    $('targetEmotion'),
  targetEmoji:      $('targetEmoji'),
  timer:            $('timer'),
  cameraArea:       $('gameCameraArea'),
  video:            $('gameCameraPreview'),
  overlayCanvas:    $('overlayCanvas'),
  detectedEmotion:  $('detectedEmotion'),
  detectedEmoji:    $('detectedEmoji'),
  matchStatus:      $('matchStatus'),
  matchCount:       $('matchCount'),
  detectCount:      $('detectCount'),
  matchRate:        $('matchRate'),
  resultOverlay:    $('gameResultOverlay'),
  scoreNumber:      $('scoreNumber'),
  scoreRank:        $('scoreRank'),
  scoreComment:     $('scoreComment'),
  highlights:       $('highlights'),
};

// ===== モデルロード =====
async function loadModels() {
  setPhase('loading');
  showStatus('モデルを読み込み中…');

  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
    setPhase('ready');
    startCamera();
  } catch (err) {
    console.error('モデルロードエラー:', err);
    showStatus('モデルの読み込みに失敗しました。ページを再読み込みしてください。');
  }
}

// ===== カメラ起動 =====
async function startCamera() {
  try {
    gameState.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    els.video.srcObject = gameState.stream;
    els.video.onloadedmetadata = () => {
      els.cameraArea.classList.add('show');
      resizeOverlay();
      startGame();
    };
  } catch (err) {
    console.error('カメラエラー:', err);
    showStatus('カメラへのアクセスを許可してください。');
  }
}

function resizeOverlay() {
  const canvas = els.overlayCanvas;
  canvas.width  = els.video.videoWidth;
  canvas.height = els.video.videoHeight;
  canvas.style.width  = els.video.offsetWidth  + 'px';
  canvas.style.height = els.video.offsetHeight + 'px';
}

// ===== ゲーム開始 =====
function startGame() {
  setPhase('playing');
  pickNextEmotion();

  // タイマー
  gameState.timerInterval = setInterval(() => {
    gameState.timeLeft--;
    els.timer.textContent = gameState.timeLeft;

    if (gameState.timeLeft <= 5) {
      els.timer.style.color = '#e74c3c';
      els.timer.style.animation = 'pulse 0.5s ease infinite';
    }
    if (gameState.timeLeft <= 0) {
      endGame();
    }
  }, 1000);

  // 絵文字切替
  gameState.emotionInterval = setInterval(pickNextEmotion, EMOTION_INTERVAL);

  // 表情検出
  gameState.detectionInterval = setInterval(detectExpression, DETECTION_INTERVAL);
}

// ===== ターゲット絵文字選択 =====
function pickNextEmotion() {
  const current = gameState.targetEmotion;
  let next;
  do {
    next = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
  } while (next === current);

  gameState.targetEmotion = next;
  gameState.consecutiveMatch = 0;

  els.targetEmotion.textContent = next.label;
  els.targetEmoji.textContent   = next.emoji;
  els.targetEmoji.style.animation = 'none';
  requestAnimationFrame(() => {
    els.targetEmoji.style.animation = 'bounce 0.4s ease';
  });
}

// ===== 表情検出 =====
async function detectExpression() {
  if (gameState.phase !== 'playing') return;
  if (els.video.readyState < 2) return;

  try {
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 });
    const result  = await faceapi
      .detectSingleFace(els.video, options)
      .withFaceExpressions();

    const ctx = els.overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);

    if (!result) {
      els.detectedEmotion.textContent = '顔なし';
      els.detectedEmoji.textContent   = '🔍';
      els.matchStatus.textContent     = '顔を映してください';
      els.matchStatus.className       = 'match-status';
      return;
    }

    // 顔枠描画
    drawFaceBox(ctx, result.detection.box);

    // 最優勢表情
    const expressions   = result.expressions;
    const dominant      = getDominantEmotion(expressions);
    const target        = gameState.targetEmotion;

    gameState.detectCount++;
    els.detectCount.textContent = gameState.detectCount;

    // 表示更新
    const emotionInfo = EMOTIONS.find(e => e.id === dominant.id) || { emoji: '😐', label: dominant.id };
    els.detectedEmotion.textContent = emotionInfo.label;
    els.detectedEmoji.textContent   = emotionInfo.emoji;

    // 合致判定
    const isMatch = dominant.id === target.id && dominant.score >= target.threshold;

    if (isMatch) {
      gameState.consecutiveMatch++;
      if (gameState.consecutiveMatch >= MATCH_FRAMES) {
        gameState.consecutiveMatch = 0;
        addCoins(COINS_PER_MATCH);
        gameState.matchCount++;
        els.matchCount.textContent = gameState.matchCount;
        triggerMatchEffect();
      }
      els.matchStatus.textContent = '✓ マッチ！';
      els.matchStatus.className   = 'match-status match';
    } else {
      gameState.consecutiveMatch = 0;
      els.matchStatus.textContent = '✗ 違う…';
      els.matchStatus.className   = 'match-status no-match';
    }

    // 合致率更新
    const rate = gameState.detectCount > 0
      ? Math.round((gameState.matchCount / gameState.detectCount) * 100)
      : 0;
    els.matchRate.textContent = rate + '%';

  } catch (err) {
    console.warn('検出エラー:', err);
  }
}

function getDominantEmotion(expressions) {
  let best = { id: 'neutral', score: 0 };
  for (const [id, score] of Object.entries(expressions)) {
    if (score > best.score) best = { id, score };
  }
  return best;
}

function drawFaceBox(ctx, box) {
  const scaleX = els.overlayCanvas.width  / els.video.videoWidth;
  const scaleY = els.overlayCanvas.height / els.video.videoHeight;
  const x = box.x * scaleX;
  const y = box.y * scaleY;
  const w = box.width  * scaleX;
  const h = box.height * scaleY;

  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth   = 3;
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur  = 8;
  ctx.strokeRect(x, y, w, h);

  // 四隅アクセント
  const c = 20;
  ctx.lineWidth = 4;
  [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([px, py], i) => {
    ctx.beginPath();
    ctx.moveTo(px + (i % 2 === 0 ? c : -c), py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py + (i < 2 ? c : -c));
    ctx.stroke();
  });
  ctx.shadowBlur = 0;
}

// ===== コイン加算 =====
function addCoins(amount) {
  gameState.coins += amount;
  els.coinCount.textContent = gameState.coins;
  els.coinCount.style.animation = 'none';
  requestAnimationFrame(() => {
    els.coinCount.style.animation = 'coinPop 0.3s ease';
  });
}

function triggerMatchEffect() {
  els.detectedEmoji.style.animation = 'none';
  requestAnimationFrame(() => {
    els.detectedEmoji.style.animation = 'matchPop 0.4s ease';
  });
}

// ===== ゲーム終了 =====
function endGame() {
  setPhase('result');

  clearInterval(gameState.timerInterval);
  clearInterval(gameState.emotionInterval);
  clearInterval(gameState.detectionInterval);

  if (gameState.stream) {
    gameState.stream.getTracks().forEach(t => t.stop());
  }

  const rate   = gameState.detectCount > 0
    ? Math.round((gameState.matchCount / gameState.detectCount) * 100) : 0;
  const score  = gameState.coins;
  const rank   = getScoreRank(score);

  els.scoreNumber.textContent = score + ' コイン';
  els.scoreRank.textContent   = rank.label;
  els.scoreComment.textContent = rank.comment;
  els.highlights.innerHTML    = buildHighlights(rate);

  setTimeout(() => {
    els.resultOverlay.classList.add('show');
  }, 400);
}

function getScoreRank(score) {
  if (score >= 200) return { label: '🏆 SS', comment: '完璧な演技力！表情の達人です！' };
  if (score >= 150) return { label: '🥇 S',  comment: '素晴らしい！感情表現が豊かです！' };
  if (score >= 100) return { label: '🥈 A',  comment: 'なかなかの演技力！練習すればもっと上達できます！' };
  if (score >= 60)  return { label: '🥉 B',  comment: '平均的な演技力。表情を大げさにしてみよう！' };
  if (score >= 30)  return { label: '😅 C',  comment: 'まだまだ練習が必要です。カメラをしっかり見て！' };
  return              { label: '😶 D',  comment: '表情を作るのが難しかったですか？もう一度挑戦！' };
}

function buildHighlights(rate) {
  return `
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:16px">
      ${[
        ['合致回数', gameState.matchCount + '回'],
        ['検出回数', gameState.detectCount + '回'],
        ['合致率',   rate + '%'],
      ].map(([k, v]) => `
        <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 18px;min-width:90px;text-align:center">
          <div style="font-size:12px;opacity:0.75">${k}</div>
          <div style="font-size:22px;font-weight:700">${v}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ===== ユーティリティ =====
function setPhase(phase) {
  gameState.phase = phase;
}

function showStatus(msg) {
  const existing = document.getElementById('statusMsg');
  if (existing) existing.remove();
  const el = document.createElement('p');
  el.id = 'statusMsg';
  el.style.cssText = 'text-align:center;padding:20px;color:#b8860b;font-size:14px;';
  el.textContent = msg;
  document.querySelector('.container').appendChild(el);
}

// ===== CSS アニメーション追加 =====
const style = document.createElement('style');
style.textContent = `
@keyframes bounce {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.4); }
  100% { transform: scale(1); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.15); }
}
@keyframes coinPop {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.2); color: #e67e00; }
  100% { transform: scale(1); }
}
@keyframes matchPop {
  0%   { transform: scale(1) rotate(0deg); }
  30%  { transform: scale(1.5) rotate(-10deg); }
  60%  { transform: scale(1.3) rotate(10deg); }
  100% { transform: scale(1) rotate(0deg); }
}
`;
document.head.appendChild(style);

// ===== エントリーポイント =====
window.addEventListener('DOMContentLoaded', () => {
  if (typeof faceapi === 'undefined') {
    showStatus('face-api.js が読み込まれていません。');
    return;
  }
  loadModels();
});
