import os
import requests
import logging
import time

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_TEXT_MODEL = "llama-3.3-70b-versatile"

def call_groq_text(
    prompt: str,
    model: str = None,
    max_tokens: int = 2048,
    temperature: float = 0.3,
    max_retries: int = 2,
    retry_delay: int = 2
) -> str:
    """
    Gọi Groq LLM với cơ chế retry và exponential backoff.
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
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    for attempt in range(max_retries + 1):
        try:
            logger.info(f"Gọi Groq Text (lần {attempt+1}) model '{active_model}'")
            response = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=45)
            if response.status_code == 200:
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                logger.info("Groq Text phản hồi thành công.")
                return content.strip()
            elif response.status_code in (429, 500, 502, 503, 504):
                logger.warning(f"Lỗi tạm thời {response.status_code}, retry sau {retry_delay}s")
                time.sleep(retry_delay)
                retry_delay *= 2  # exponential backoff
                continue
            else:
                # lỗi không thể retry
                try:
                    error_body = response.json()
                    error_msg = error_body.get("error", {}).get("message", response.text[:200])
                except:
                    error_msg = response.text[:200]
                logger.error(f"Groq Text lỗi {response.status_code}: {error_msg}")
                return f"⚠️ Lỗi Groq API ({response.status_code}): {error_msg}"
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout lần {attempt+1}, retry sau {retry_delay}s")
            time.sleep(retry_delay)
            retry_delay *= 2
        except requests.exceptions.RequestException as e:
            logger.warning(f"Lỗi kết nối lần {attempt+1}: {e}, retry sau {retry_delay}s")
            time.sleep(retry_delay)
            retry_delay *= 2

    return "⚠️ Groq Text API không phản hồi sau nhiều lần thử. Vui lòng thử lại sau."