import os
from google import genai
from tools.vision_tool import analyze_crop_image
from tools.scraper_tool import fetch_market_price
from tools.weather_tool import get_current_weather

class CropDecisionAgent:
    def __init__(self):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    def run_workflow(self, image_bytes, location="Gia Lai"):
        logs = []
        
        # --- BƯỚC 1: ACT (Nhận diện ảnh) ---
        logs.append("🤖 [Act] Đang phân tích hình ảnh cây trồng...")
        try:
            vision_result = analyze_crop_image(image_bytes)
            crop_name = vision_result["crop_name"]
            keyword = vision_result["search_keyword"]
            health = vision_result["health_status"]
            logs.append(f"🔍 [Observe] Phát hiện cây: **{crop_name}** | Trạng thái: **{health}**")
        except Exception as e:
            # Re-plan nếu lỗi phân tích ảnh
            logs.append(f"❌ [Lỗi Vision] Không thể nhận diện ảnh. Tiến hành Re-plan: Sử dụng cấu hình mặc định (Cây lúa).")
            vision_result = {"crop_name": "Cây lúa", "search_keyword": "gao", "health_status": "Chưa rõ", "symptoms": "Không có", "urgency": "Low"}
            crop_name, keyword, health = "Cây lúa", "gao", "Chưa rõ"

        # --- BƯỚC 2: ACT (Gọi các Tool bổ trợ dữ liệu thực tế) ---
        logs.append(f"🌐 [Act] Đang cào giá thị trường thực tế cho từ khóa '{keyword}'...")
        market_data = fetch_market_price(keyword)
        
        logs.append(f"🌤️ [Act] Đang kiểm tra thời tiết thực tế tại khu vực {location}...")
        weather_data = get_current_weather(location)

        # --- BƯỚC 3: RE-PLAN & DECISION (Tự chủ đưa ra giải pháp tổng hợp) ---
        logs.append("🧠 [Re-plan & Brainstorm] Agent đang tổng hợp dữ liệu thực tế để ra quyết định...")
        
        final_prompt = f"""
        Bạn là một Chuyên gia Nông nghiệp AI Agent tại khu vực Miền Trung - Tây Nguyên.
        Hãy dựa trên các thông tin THỰC TẾ thu thập được dưới đây để đưa ra khuyến nghị hành động tối ưu nhất cho người nông dân:
        
        1. Thông tin cây trồng nhận diện qua camera:
           - Loại cây: {crop_name}
           - Sức khỏe: {health}
           - Triệu chứng: {vision_result['symptoms']}
           - Mức độ khẩn cấp: {vision_result['urgency']}
           
        2. Dữ liệu thô từ thị trường vừa cào live: 
        {market_data}
        
        3. Tình hình thời tiết hiện tại:
        {weather_data}
        
        Yêu cầu cấu trúc phản hồi rõ ràng:
        - Chẩn đoán tình trạng hiện tại.
        - Phân tích biến động giá thị trường thật và dự báo thời tiết ảnh hưởng thế nào đến việc thu hoạch/bán nông sản này.
        - Khuyến nghị hành động cụ thể (Cần phun thuốc gì/Có nên bán ngay không hay tích trữ/Biện pháp ứng phó thời tiết).
        """

        response = self.client.models.generate_content(
            model='gemini-2.5-flash',
            contents=final_prompt
        )
        
        return response.text, logs