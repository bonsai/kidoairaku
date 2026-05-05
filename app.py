import warnings
warnings.filterwarnings("ignore")

import os
import sys
import base64
import mimetypes
import traceback
import requests
import json
from flask import Flask, request, render_template, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

TOKEN = os.getenv("SAKURA_API_TOKEN", "")
if not TOKEN:
    print("Warning: SAKURA_API_TOKEN not set", file=sys.stderr)

API_BASE = "https://api.ai.sakura.ad.jp/v1"

# ランキングデータファイル
RANKING_FILE = "ranking.json"

def load_ranking():
    if os.path.exists(RANKING_FILE):
        try:
            with open(RANKING_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return []
    return []

def save_ranking(data):
    with open(RANKING_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

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


@app.route("/game")
def game():
    return render_template("game.html")

@app.route("/test")
def test():
    return render_template("test.html")

@app.route("/moheji")
def moheji():
    return render_template("moheji.html")


@app.route("/game/score", methods=["POST"])
def game_score():
    try:
        data = request.get_json()
        game_data = data.get("gameData", {})

        # ゲームデータをJSON文字列化
        import json
        game_json = json.dumps(game_data, ensure_ascii=False, indent=2)

        # Sakura LLMで演技力採点
        messages = [
            {
                "role": "user",
                "content": f"""以下は1分間の表情演技ゲームの記録データです。このプレイヤーの演技力を採点し、コメントをください。

【ゲームデータ】
{game_json}

【採点基準】
- 目標表情への合致率
- 反応速度（検出までの時間）
- 安定性（継続して表情を維持できたか）
- 達成度（目標時間内にどれだけ表現できたか）

【出力形式】
以下のJSON形式で返してください：
{{
  "score": 採点（0-100の整数）,
  "rank": "S/A/B/C/D",
  "comment": "演技力へのコメント（日本語、100文字程度）",
  "highlights": ["良かった点1", "良かった点2"]
}}

JSONのみを出力してください。"""
            }
        ]

        resp = requests.post(
            f"{API_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
            json={
                "model": "preview/Qwen3-VL-30B-A3B-Instruct",
                "messages": messages,
                "max_tokens": 500,
                "stream": False,
                "temperature": 0.7,
            },
            timeout=60,
        )
        resp.raise_for_status()
        result = resp.json()["choices"][0]["message"]["content"].strip()

        # JSONを抽出
        import re
        json_match = re.search(r'\{[\s\S]*\}', result)
        if json_match:
            score_data = json.loads(json_match.group())
            return jsonify(score_data)
        else:
            return jsonify({"score": 50, "rank": "B", "comment": result[:100], "highlights": []})

    except Exception as e:
        error_detail = traceback.format_exc()
        print(f"[DEBUG] Error: {e}\n{error_detail}", flush=True)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)
