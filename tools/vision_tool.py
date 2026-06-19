import os
import json
from google import genai
from google.genai import types

def analyze_crop_image(image_bytes):
    """
    Tool 1: Đọc ảnh chụp thực tế từ camera.
    Trả về: JSON chứa loại cây, tình trạng bệnh và từ khóa tra cứu giá.
    """
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    # Sử dụng dấu nháy đơn nội bộ để tránh xung đột với dấu nháy kép bọc chuỗi JSON
    prompt = """
    Phân tích hình ảnh nông nghiệp này và trả về ĐÚNG định dạng JSON sau (không kèm cấu trúc markdown):
    {
        'crop_name': 'Tên loại cây trồng nhận diện được (Tiếng Việt)',
        'search_keyword': 'Từ khóa ngắn gọn để tìm giá thị trường (ví dụ: gao, ca-phe, tieu)',
        'health_status': 'Khỏe mạnh hoặc tên bệnh cụ thể',
        'symptoms': 'Mô tả ngắn gọn triệu chứng nhìn thấy trên lá/thân/quả',
        'urgency': 'High hoặc Medium hoặc Low'
    }
    """
    
    # Sửa lại phần đóng ngoặc hàm và cấu trúc Part chuẩn xác
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'),
            prompt
        ]
    )
    
    # Làm sạch chuỗi trả về để parse JSON an toàn
    clean_text = response.text.replace("```json", "").replace("```", "").replace("'", '"').strip()
    return json.loads(clean_text)