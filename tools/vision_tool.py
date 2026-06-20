import os
import json
import re
import requests
import logging
import base64

logger = logging.getLogger(__name__)

def call_groq_vision(image_bytes, model=None):
    """Gọi Groq Vision API, tự động thử nhiều model nếu cần."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {"error": True, "message": "Thiếu GROQ_API_KEY"}

    # Danh sách model vision khả dụng (cập nhật theo thông báo mới nhất)
    vision_models = [
        "llama-4-scout-17b-16e-instruct",   # Hỗ trợ vision
        "qwen/qwen3-vl-32b-instruct",       # Model của Qwen
        "llama-3.2-90b-vision-preview",     # Có thể vẫn dùng được
        "llama-3.2-11b-vision-preview"      # Đã bị ngừng nhưng thử nếu cần
    ]

    # Nếu model được truyền vào, ưu tiên dùng
    if model is None:
        model = os.getenv("GROQ_VISION_MODEL")
        if not model:
            model = vision_models[0]

    # Tạo danh sách các model để thử (ưu tiên model được chỉ định, sau đó đến các model khác)
    models_to_try = [model] + [m for m in vision_models if m != model]

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Mã hóa ảnh sang base64
    image_b64 = base64.b64encode(image_bytes).decode('utf-8')

    prompt = """Bạn là chuyên gia nông nghiệp. Hãy phân tích ảnh cây trồng và trả về JSON duy nhất (không markdown) với các trường:
crop_name (tên cây, tiếng Việt), search_keyword (từ khóa tra giá, viết thường không dấu), health_status (tình trạng sức khỏe), symptoms (triệu chứng), urgency ('High'/'Medium'/'Low').
Nếu không rõ, hãy ước lượng hợp lý."""

    for attempt_model in models_to_try:
        try:
            payload = {
                "model": attempt_model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}}
                        ]
                    }
                ],
                "temperature": 0.2,
                "max_tokens": 1024,
                "response_format": {"type": "json_object"}
            }
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            if response.status_code == 200:
                data = response.json()
                content = data['choices'][0]['message']['content']
                try:
                    result = json.loads(content)
                    return result
                except json.JSONDecodeError:
                    # Thử trích xuất JSON từ text
                    match = re.search(r'\{.*\}', content, re.DOTALL)
                    if match:
                        return json.loads(match.group())
                    else:
                        logger.warning(f"Không parse được JSON từ model {attempt_model}")
                        continue
            else:
                error_msg = response.json().get('error', {}).get('message', '')
                if 'decommissioned' in error_msg or 'not supported' in error_msg or 'model' in error_msg.lower():
                    logger.warning(f"Model {attempt_model} không khả dụng, thử model khác...")
                    continue
                else:
                    logger.error(f"Groq Vision lỗi: {response.status_code} - {response.text}")
                    return {"error": True, "message": f"Groq API lỗi: {response.status_code}"}
        except Exception as e:
            logger.error(f"Lỗi gọi Groq Vision với model {attempt_model}: {e}")
            continue

    return {"error": True, "message": "Tất cả model Vision đều thất bại. Vui lòng nhập tên cây thủ công."}

def analyze_crop_image(image_bytes, max_retries=2):
    """Wrapper để gọi Groq Vision với retry."""
    for attempt in range(max_retries):
        result = call_groq_vision(image_bytes)
        if not result.get("error"):
            return result
        logger.warning(f"Lần thử {attempt+1} thất bại, retry...")
    return {
        "error": True,
        "message": "Không thể nhận diện cây trồng từ ảnh. Vui lòng nhập tên cây thủ công."
    }