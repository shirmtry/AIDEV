import os
import json
import re
import requests
import logging
import base64

logger = logging.getLogger(__name__)

# ✅ NÂNG CẤP: Danh sách model vision đã được cập nhật với tên đầy đủ và đúng chuẩn
# Các model cũ (llama-3.2-*-vision-preview) đã bị Groq decommission từ tháng 5/2025
VISION_MODELS = [
    "meta-llama/llama-4-scout-17b-16e-instruct",    # Khuyến nghị - thay thế chính thức
    "meta-llama/llama-4-maverick-17b-128e-instruct", # Lựa chọn thay thế
    "qwen/qwen3-vl-32b-instruct",                    # Model Qwen3-VL dự phòng
]

VISION_PROMPT = """Bạn là chuyên gia nông nghiệp tại Miền Trung - Tây Nguyên Việt Nam. Hãy phân tích ảnh cây trồng được cung cấp và trả về một JSON object hợp lệ duy nhất (không có markdown, không có backtick, không có giải thích thêm) với cấu trúc sau:

{
  "crop_name": "tên cây trồng bằng tiếng Việt",
  "search_keyword": "từ khóa tra giá viết thường không dấu (ví dụ: ca-phe, tieu, gao)",
  "health_status": "mô tả tình trạng sức khỏe cây",
  "symptoms": "liệt kê triệu chứng bất thường nếu có, hoặc 'Không có' nếu cây khỏe",
  "urgency": "High hoặc Medium hoặc Low"
}

Nếu ảnh không rõ hoặc không phải cây trồng, hãy ước lượng hợp lý nhất có thể."""


def call_groq_vision(image_bytes: bytes, model: str = None) -> dict:
    """
    Gọi Groq Vision API, tự động thử nhiều model nếu model trước thất bại.

    Args:
        image_bytes: Bytes dữ liệu ảnh.
        model: (Tùy chọn) Tên model ưu tiên. Mặc định dùng biến môi trường hoặc model đầu tiên trong VISION_MODELS.

    Returns:
        dict: Kết quả phân tích hoặc dict chứa {"error": True, "message": "..."}
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        logger.error("GROQ_API_KEY chưa được cấu hình trong file .env")
        return {"error": True, "message": "Thiếu GROQ_API_KEY trong cấu hình hệ thống."}

    if not image_bytes:
        return {"error": True, "message": "Không có dữ liệu ảnh để phân tích."}

    # ✅ NÂNG CẤP: Xác định model ưu tiên từ env hoặc tham số, sau đó xây danh sách thử
    primary_model = model or os.getenv("GROQ_VISION_MODEL") or VISION_MODELS[0]

    # Chuẩn hóa: thêm prefix "meta-llama/" nếu thiếu cho các model llama-4
    if primary_model.startswith("llama-4-") and not primary_model.startswith("meta-llama/"):
        primary_model = f"meta-llama/{primary_model}"
        logger.info(f"Tự động thêm prefix: model được chuẩn hóa thành '{primary_model}'")

    models_to_try = [primary_model] + [m for m in VISION_MODELS if m != primary_model]

    # Mã hóa ảnh sang base64
    try:
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    except Exception as e:
        return {"error": True, "message": f"Lỗi mã hóa ảnh: {str(e)}"}

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    for attempt_model in models_to_try:
        logger.info(f"Đang thử model vision: {attempt_model}")
        payload = {
            "model": attempt_model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": VISION_PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                        },
                    ],
                }
            ],
            "temperature": 0.2,
            "max_tokens": 1024,
            "response_format": {"type": "json_object"},
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)

            if response.status_code == 200:
                data = response.json()
                content = data["choices"][0]["message"]["content"]

                # Parse JSON từ response
                try:
                    result = json.loads(content)
                    logger.info(f"Model '{attempt_model}' phân tích thành công.")
                    return result
                except json.JSONDecodeError:
                    # ✅ Thử trích xuất JSON nếu model trả về thêm text thừa
                    match = re.search(r"\{.*\}", content, re.DOTALL)
                    if match:
                        try:
                            result = json.loads(match.group())
                            logger.info(f"Model '{attempt_model}' thành công (sau khi trích xuất JSON).")
                            return result
                        except json.JSONDecodeError:
                            logger.warning(f"Model '{attempt_model}' trả về JSON không hợp lệ, thử model tiếp theo.")
                            continue
                    else:
                        logger.warning(f"Model '{attempt_model}' không trả về JSON, thử model tiếp theo.")
                        continue

            else:
                # ✅ NÂNG CẤP: Phân tích lỗi chi tiết hơn
                try:
                    error_body = response.json()
                    error_msg = error_body.get("error", {}).get("message", response.text)
                except Exception:
                    error_msg = response.text

                # Các lỗi liên quan đến model không khả dụng → thử model khác
                skip_keywords = ["decommissioned", "not supported", "not found", "does not exist"]
                if any(kw in error_msg.lower() for kw in skip_keywords):
                    logger.warning(f"Model '{attempt_model}' không khả dụng ({response.status_code}): {error_msg[:200]}. Thử model tiếp theo...")
                    continue
                else:
                    # Lỗi khác (auth, rate limit, v.v.) → không tiếp tục thử
                    logger.error(f"Groq Vision lỗi không thể retry: {response.status_code} - {error_msg[:200]}")
                    return {"error": True, "message": f"Groq API lỗi {response.status_code}: {error_msg[:200]}"}

        except requests.exceptions.Timeout:
            logger.warning(f"Timeout với model '{attempt_model}', thử model tiếp theo...")
            continue
        except requests.exceptions.RequestException as e:
            logger.error(f"Lỗi kết nối khi gọi model '{attempt_model}': {e}")
            continue

    # Tất cả model đều thất bại
    logger.error("Tất cả model Vision đều thất bại.")
    return {
        "error": True,
        "message": "Không thể nhận diện cây trồng từ ảnh (tất cả model Vision đều thất bại). Vui lòng nhập tên cây thủ công.",
    }


def analyze_crop_image(image_bytes: bytes, max_retries: int = 2) -> dict:
    """
    Wrapper gọi Groq Vision với cơ chế retry.

    Args:
        image_bytes: Bytes dữ liệu ảnh.
        max_retries: Số lần thử lại tối đa.

    Returns:
        dict: Kết quả phân tích hoặc dict lỗi.
    """
    for attempt in range(max_retries):
        result = call_groq_vision(image_bytes)
        if not result.get("error"):
            return result
        logger.warning(f"Lần thử {attempt + 1}/{max_retries} thất bại.")

    return {
        "error": True,
        "message": "Không thể nhận diện cây trồng từ ảnh sau nhiều lần thử. Vui lòng nhập tên cây thủ công.",
    }