import os
import logging
from google import genai
from tools.vision_tool import analyze_crop_image
from tools.scraper_tool import fetch_market_price
from tools.weather_tool import get_current_weather

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CropDecisionAgent:
    def __init__(self):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    def _generate_keyword(self, crop_name):
        """Tạo từ khóa tìm kiếm từ tên cây trồng (dùng khi nhập thủ công)"""
        mapping = {
            "lúa": "gao",
            "cà phê": "ca-phe",
            "tiêu": "tieu",
            "ngô": "ngo",
            "đậu": "dau",
            "mía": "mia",
            "ca cao": "cacao",
            "điều": "dieu"
        }
        crop_lower = crop_name.lower().strip()
        for key, val in mapping.items():
            if key in crop_lower:
                return val
        # Nếu không khớp, trả về tên gốc (thay khoảng trắng bằng dấu gạch ngang)
        return crop_lower.replace(" ", "-")

    def run_workflow(self, image_bytes, location="Gia Lai", manual_crop=None):
        logs = []

        # --- BƯỚC 1: Xác định thông tin cây trồng ---
        # Nếu có tên thủ công, dùng luôn, bỏ qua Vision
        if manual_crop:
            logs.append(f"📝 [Manual] Người dùng nhập tên cây: **{manual_crop}**")
            crop_name = manual_crop
            keyword = self._generate_keyword(manual_crop)
            health = "Không rõ (do nhập thủ công)"
            symptoms = "Không có"
            urgency = "Low"
        else:
            # Gọi Vision (có retry bên trong vision_tool)
            logs.append("🤖 [Act] Đang phân tích hình ảnh cây trồng...")
            try:
                vision_result = analyze_crop_image(image_bytes)
                # Kiểm tra xem có lỗi không
                if vision_result.get("error"):
                    error_msg = f"❌ [Lỗi Vision] {vision_result.get('message', 'Không thể nhận diện')}. Vui lòng nhập tên cây thủ công ở bên dưới."
                    logs.append(error_msg)
                    # Không có dữ liệu từ Vision, ta trả về lỗi và dừng? 
                    # Nhưng để luồng vẫn chạy, ta đặt giá trị mặc định nhưng đánh dấu là không rõ
                    crop_name = "Không xác định"
                    keyword = "nong-san"
                    health = "Không rõ"
                    symptoms = "Không có"
                    urgency = "Low"
                    # Ta vẫn tiếp tục để lấy các tool khác
                else:
                    crop_name = vision_result.get("crop_name", "Không xác định")
                    keyword = vision_result.get("search_keyword", "nong-san")
                    health = vision_result.get("health_status", "Không rõ")
                    symptoms = vision_result.get("symptoms", "Không có")
                    urgency = vision_result.get("urgency", "Low")
                    logs.append(f"🔍 [Observe] Phát hiện cây: **{crop_name}** | Trạng thái: **{health}**")
            except Exception as e:
                error_msg = f"❌ [Lỗi Vision] {str(e)}. Vui lòng nhập tên cây thủ công."
                logs.append(error_msg)
                logger.error(error_msg)
                crop_name = "Không xác định"
                keyword = "nong-san"
                health = "Không rõ"
                symptoms = "Không có"
                urgency = "Low"

        # --- BƯỚC 2: ACT (Gọi các Tool bổ trợ) ---
        # Tool 1: Lấy giá thị trường (dữ liệu thật từ scraper)
        logs.append(f"🌐 [Act] Đang cào giá thị trường thực tế cho từ khóa '{keyword}'...")
        try:
            market_data = fetch_market_price(keyword)
        except Exception as e:
            error_msg = f"⚠️ [Lỗi Scraper] {str(e)}. Agent tự quyết định sử dụng dữ liệu giá mặc định."
            logs.append(error_msg)
            logger.error(error_msg)
            market_data = "Giá thị trường hiện tại: 12,000 VND/kg (dữ liệu tham khảo)"

        # Tool 2: Lấy thời tiết (dữ liệu thật từ OpenWeather)
        logs.append(f"🌤️ [Act] Đang kiểm tra thời tiết thực tế tại khu vực {location}...")
        try:
            weather_data = get_current_weather(location)
        except Exception as e:
            error_msg = f"⚠️ [Lỗi Weather API] {str(e)}. Agent tự quyết định sử dụng dữ liệu thời tiết mặc định."
            logs.append(error_msg)
            logger.error(error_msg)
            weather_data = f"Thời tiết tại {location}: Nắng, Nhiệt độ: 32°C (dữ liệu tham khảo)"

        # --- BƯỚC 3: RE-PLAN & DECISION (Tổng hợp dữ liệu) ---
        logs.append("🧠 [Re-plan & Brainstorm] Agent đang tổng hợp dữ liệu thực tế để ra quyết định...")
        
        final_prompt = f"""
        Bạn là một Chuyên gia Nông nghiệp AI Agent tại khu vực Miền Trung - Tây Nguyên.
        Hãy dựa trên các thông tin THỰC TẾ thu thập được dưới đây để đưa ra khuyến nghị hành động tối ưu nhất cho người nông dân:
        
        1. Thông tin cây trồng:
           - Loại cây: {crop_name}
           - Sức khỏe: {health}
           - Triệu chứng: {symptoms}
           - Mức độ khẩn cấp: {urgency}
           
        2. Dữ liệu thô từ thị trường vừa cào live: 
        {market_data}
        
        3. Tình hình thời tiết hiện tại:
        {weather_data}
        
        Yêu cầu cấu trúc phản hồi rõ ràng, bao gồm:
        - **Chẩn đoán tình trạng hiện tại**.
        - **Phân tích biến động giá** và **dự báo thời tiết** ảnh hưởng thế nào đến việc thu hoạch/bán nông sản này.
        - **Khuyến nghị hành động cụ thể** (Cần phun thuốc gì? Có nên bán ngay hay tích trữ? Biện pháp ứng phó thời tiết).
        """

        try:
            response = self.client.models.generate_content(
                model='gemini-2.5-flash',
                contents=final_prompt
            )
            final_decision = response.text
        except Exception as e:
            error_msg = f"❌ [Lỗi Gemini] Không thể tổng hợp khuyến nghị: {str(e)}"
            logs.append(error_msg)
            logger.error(error_msg)
            final_decision = "⚠️ Agent không thể đưa ra khuyến nghị do lỗi hệ thống. Vui lòng thử lại sau."
        
        return final_decision, logs