import warnings
warnings.filterwarnings("ignore")

import os
import sys
import base64
import mimetypes
import traceback
import requests
from flask import Flask, request, render_template, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

TOKEN = os.getenv("SAKURA_API_TOKEN", "")
if not TOKEN:
    print("Warning: SAKURA_API_TOKEN not set", file=sys.stderr)

API_BASE = "https://api.ai.sakura.ad.jp/v1"

# 喜怒哀楽 → 絵文字マップ
EMOJI_MAP = {
    "喜": "😊",
    "怒": "😠", 
    "哀": "😢",
    "楽": "楽"
}

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/detect", methods=["POST"])
def detect_emotion():
    if "image" not in request.files:
        return jsonify({"error": "画像がありません"}), 400

    file = request.files["image"]
    if not file.filename:
        return jsonify({"error": "ファイルがありません"}), 400

    mime_type = file.content_type or mimetypes.guess_type(file.filename)[0] or "image/jpeg"
    img_data = file.read()
    b64_img = base64.b64encode(img_data).decode("utf-8")

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "この画像の人物の表情を分析し、以下のいずれかで答えてください：喜、怒、哀、楽（絵文字は不要、漢字のみ）"},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64_img}"}},
            ],
        }
    ]

    try:
        resp = requests.post(
            f"{API_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
            json={
                "model": "preview/Qwen3-VL-30B-A3B-Instruct",
                "messages": messages,
                "max_tokens": 10,
                "stream": False,
            },
            timeout=60,
        )
        resp.raise_for_status()
        result = resp.json()["choices"][0]["message"]["content"].strip()
        
        # 喜怒哀楽のどれかを判定
        emotion = None
        for key in EMOJI_MAP:
            if key in result:
                emotion = key
                break
        
        emoji = EMOJI_MAP.get(emotion, "😐")
        return jsonify({"emotion": emotion, "emoji": emoji, "raw": result})
    except Exception as e:
        error_detail = traceback.format_exc()
        print(f"[DEBUG] Error: {e}\n{error_detail}", flush=True)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)
