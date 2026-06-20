import os
import requests
import logging

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


def send_telegram_message(chat_id: str, text: str) -> str:
    """
    Gửi tin nhắn qua Telegram Bot.

    Args:
        chat_id: Telegram chat ID của người dùng.
        text: Nội dung tin nhắn (hỗ trợ Markdown V2).

    Returns:
        str: Thông báo kết quả gửi tin.

    Yêu cầu biến môi trường: TELEGRAM_BOT_TOKEN
    """
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN chưa được cấu hình trong .env")
        return "⚠️ Không thể gửi tin nhắn Telegram: thiếu TELEGRAM_BOT_TOKEN trong cấu hình."

    if not chat_id or not str(chat_id).strip():
        return "⚠️ Telegram Chat ID không hợp lệ."

    url = f"{TELEGRAM_API_BASE}/bot{token}/sendMessage"

    # ✅ SỬA LỖI: Đổi parse_mode từ "HTML" sang "Markdown" để khớp với
    # định dạng *bold* được dùng trong report (agent_manager.py dùng *Báo cáo*)
    # Đồng thời giới hạn độ dài message theo giới hạn Telegram (4096 ký tự)
    MAX_TELEGRAM_LENGTH = 4096
    truncated_text = text[:MAX_TELEGRAM_LENGTH]
    if len(text) > MAX_TELEGRAM_LENGTH:
        truncated_text += "\n\n_(Báo cáo đã được rút gọn do giới hạn Telegram)_"
        logger.warning(f"Nội dung tin nhắn Telegram bị cắt ngắn từ {len(text)} xuống {MAX_TELEGRAM_LENGTH} ký tự.")

    payload = {
        "chat_id": str(chat_id).strip(),
        "text": truncated_text,
        "parse_mode": "Markdown",  # ✅ Khớp với *bold* trong nội dung báo cáo
    }

    try:
        response = requests.post(url, json=payload, timeout=10)

        if response.status_code == 200:
            logger.info(f"Đã gửi báo cáo Telegram thành công đến chat {chat_id}")
            return f"✅ Đã gửi báo cáo đến Telegram chat {chat_id}"
        else:
            # ✅ NÂNG CẤP: Parse lỗi Telegram API rõ ràng hơn
            try:
                error_detail = response.json()
                error_description = error_detail.get("description", "Không có mô tả lỗi")
            except Exception:
                error_description = response.text or "Không có chi tiết"

            logger.error(f"Telegram API lỗi {response.status_code}: {error_description}")
            return f"❌ Lỗi gửi Telegram ({response.status_code}): {error_description}"

    except requests.exceptions.Timeout:
        logger.error("Timeout khi gọi Telegram API")
        return "❌ Lỗi kết nối Telegram: API không phản hồi (timeout)."
    except requests.exceptions.RequestException as e:
        logger.error(f"Lỗi kết nối Telegram: {e}")
        return f"❌ Lỗi kết nối Telegram: {str(e)}"