import os
import json
import re
import time
import logging
from google import genai
from google.genai import types
from google.genai.errors import ClientError

logger = logging.getLogger(__name__)

def parse_gemini_response(response_text):
    """Trích xuất JSON từ response của Gemini một cách an toàn."""
    try:
        clean_text = re.sub(r'```json\s*|```\s*', '', response_text).strip()
        match = re.search(r'\{.*\}', clean_text, re.DOTALL)
        if match:
            json_str = match.group().replace("'", '"')
            return json.loads(json_str)
    except Exception as e:
        logger.error(f"Parse JSON lỗi: {e}")
    return None

def analyze_crop_image(image_bytes, max_retries=3):
    """
    Tool 1: Phân tích ảnh với Gemini, có retry khi lỗi 503.
    """
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    prompt = """
    Phân tích hình ảnh nông nghiệp này và trả về một JSON object duy nhất (không có markdown hay text thừa) với cấu trúc sau:
    {
        "crop_name": "Tên loại cây trồng nhận diện được (Tiếng Việt, có dấu)",
        "search_keyword": "Từ khóa ngắn gọn để tìm giá thị trường (ví dụ: gao, ca-phe, tieu)",
        "health_status": "Tình trạng sức khỏe: 'Khỏe mạnh' hoặc tên bệnh cụ thể",
        "symptoms": "Mô tả ngắn gọn triệu chứng nhìn thấy trên lá/thân/quả",
        "urgency": "'High', 'Medium', hoặc 'Low'"
    }
    """
    
    models_to_try = ['gemini-2.5-flash', 'gemini-1.5-flash']
    
    for attempt in range(max_retries):
        for model in models_to_try:
            try:
                logger.info(f"Gọi Gemini với model {model}, lần thử {attempt+1}")
                response = client.models.generate_content(
                    model=model,
                    contents=[
                        types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'),
                        prompt
                    ]
                )
                result = parse_gemini_response(response.text)
                if result:
                    logger.info(f"Phân tích thành công với model {model}")
                    return result
                else:
                    logger.warning(f"Response từ {model} không parse được, thử model khác")
                    
            except ClientError as e:
                if e.status_code == 503:
                    logger.warning(f"Model {model} bị quá tải (503), chờ {2 ** attempt} giây...")
                    time.sleep(2 ** attempt)
                    continue  # thử model tiếp theo
                else:
                    logger.error(f"Lỗi Gemini: {e}")
                    # Nếu lỗi khác, không retry mà chuyển sang fallback
                    break
            except Exception as e:
                logger.error(f"Lỗi không xác định: {e}")
                continue
        
        # Nếu đã thử hết model mà vẫn fail, nghỉ rồi retry lần sau
        if attempt < max_retries - 1:
            time.sleep(2 ** attempt)
    
    # --- FALLBACK CUỐI CÙNG: KHÔNG TỰ ĐỘNG GÁN LÚA ---
    # Trả về một dict với cờ lỗi để agent_manager biết xử lý
    logger.error("Không thể nhận diện ảnh sau nhiều lần thử.")
    return {
        "error": True,
        "message": "Không thể nhận diện cây trồng từ ảnh. Vui lòng thử lại hoặc nhập tên cây thủ công."
    }