import os
import requests
import logging

logger = logging.getLogger(__name__)

def call_groq_text(prompt, model=None):
    """Gọi Groq LLM (text-only) để tổng hợp khuyến nghị."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return "⚠️ Thiếu GROQ_API_KEY"

    if model is None:
        model = os.getenv("GROQ_TEXT_MODEL", "llama-3.3-70b-versatile")

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": 2048
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        if response.status_code == 200:
            data = response.json()
            return data['choices'][0]['message']['content']
        else:
            logger.error(f"Groq Text lỗi: {response.status_code} - {response.text}")
            return f"⚠️ Lỗi Groq: {response.status_code}"
    except Exception as e:
        logger.error(f"Lỗi gọi Groq Text: {e}")
        return f"⚠️ Lỗi kết nối: {str(e)}"