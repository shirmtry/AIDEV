import os
import requests
import logging

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# ✅ Model text mặc định - llama-3.3-70b-versatile vẫn được Groq hỗ trợ tốt
DEFAULT_TEXT_MODEL = "llama-3.3-70b-versatile"


def call_groq_text(prompt: str, model: str = None, max_tokens: int = 2048) -> str:
    """
    Gọi Groq LLM (text-only) để tổng hợp khuyến nghị nông nghiệp.

    Args:
        prompt: Nội dung prompt gửi đến model.
        model: (Tùy chọn) Tên model. Mặc định dùng biến môi trường GROQ_TEXT_MODEL.
        max_tokens: Số token tối đa trong response.

    Returns:
        str: Nội dung phản hồi từ model, hoặc thông báo lỗi bắt đầu bằng "⚠️"/"❌".
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        logger.error("GROQ_API_KEY chưa được cấu hình trong .env")
        return "⚠️ Thiếu GROQ_API_KEY trong cấu hình hệ thống."

    if not prompt or not prompt.strip():
        return "⚠️ Prompt trống, không thể gọi Groq."

    active_model = model or os.getenv("GROQ_TEXT_MODEL", DEFAULT_TEXT_MODEL)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": active_model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }

    try:
        logger.info(f"Gọi Groq Text model '{active_model}' với prompt dài {len(prompt)} ký tự.")
        response = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=45)  # ✅ Tăng timeout

        if response.status_code == 200:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            logger.info("Groq Text phản hồi thành công.")
            return content.strip()

        elif response.status_code == 429:
            logger.warning("Groq Text API rate limit. Vui lòng thử lại sau.")
            return "⚠️ Groq API đang bận (rate limit). Vui lòng thử lại sau ít giây."

        elif response.status_code == 401:
            logger.error("GROQ_API_KEY không hợp lệ hoặc đã hết hạn.")
            return "❌ Groq API key không hợp lệ. Vui lòng kiểm tra cấu hình .env."

        else:
            try:
                error_body = response.json()
                error_msg = error_body.get("error", {}).get("message", response.text[:200])
            except Exception:
                error_msg = response.text[:200]
            logger.error(f"Groq Text lỗi {response.status_code}: {error_msg}")
            return f"⚠️ Lỗi Groq API ({response.status_code}): {error_msg}"

    except requests.exceptions.Timeout:
        logger.error("Timeout khi gọi Groq Text API (>45s).")
        return "⚠️ Groq Text API không phản hồi (timeout). Vui lòng thử lại."
    except requests.exceptions.RequestException as e:
        logger.error(f"Lỗi kết nối Groq Text: {e}")
        return f"⚠️ Lỗi kết nối Groq: {str(e)}"