import os
import logging
from tools.vision_tool import analyze_crop_image
from tools.scraper_tool import fetch_market_price
from tools.weather_tool import get_current_weather
from tools.telegram_tool import send_telegram_message
from tools.groq_text_tool import call_groq_text
from tools.search_tool import google_search   # import tool mới

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CropDecisionAgent:
    def __init__(self):
        pass

    def _generate_keyword(self, crop_name):
        mapping = {
            "lúa": "gao", "cà phê": "ca-phe", "tiêu": "tieu",
            "ngô": "ngo", "đậu": "dau", "mía": "mia",
            "ca cao": "cacao", "điều": "dieu"
        }
        crop_lower = crop_name.lower().strip()
        for key, val in mapping.items():
            if key in crop_lower:
                return val
        return crop_lower.replace(" ", "-")

    def run_workflow(self, image_bytes=None, location="Gia Lai", manual_crop=None, user_telegram_id=None):
        logs = []
        context = {
            "location": location,
            "user_telegram_id": user_telegram_id,
            "crop_name": None,
            "health": None,
            "symptoms": None,
            "urgency": "Low",
            "market_price": None,
            "weather": None,
            "search_keyword": "nong-san",
            "search_results": None   # thêm kết quả search
        }

        # ----- ACT 1: Xác định cây trồng -----
        if manual_crop:
            logs.append(f"📝 [Manual] Người dùng nhập tên cây: **{manual_crop}**")
            context["crop_name"] = manual_crop
            context["search_keyword"] = self._generate_keyword(manual_crop)
            context["health"] = "Không rõ (do nhập thủ công)"
            context["symptoms"] = "Không có"
            context["urgency"] = "Low"
        elif image_bytes:
            logs.append("🤖 [Act] Đang phân tích hình ảnh cây trồng...")
            vision_result = analyze_crop_image(image_bytes)
            if vision_result.get("error"):
                logs.append(f"⚠️ Vision lỗi: {vision_result.get('message')}. Chuyển sang nhập tay.")
                context["crop_name"] = "Không xác định"
                context["search_keyword"] = "nong-san"
                context["health"] = "Không rõ"
                context["symptoms"] = "Không có"
                context["urgency"] = "Low"
            else:
                context["crop_name"] = vision_result.get("crop_name", "Không xác định")
                context["search_keyword"] = vision_result.get("search_keyword", "nong-san")
                context["health"] = vision_result.get("health_status", "Không rõ")
                context["symptoms"] = vision_result.get("symptoms", "Không có")
                context["urgency"] = vision_result.get("urgency", "Low")
                logs.append(f"🔍 [Observe] Phát hiện cây: **{context['crop_name']}** | Trạng thái: **{context['health']}**")
        else:
            logs.append("⚠️ Chưa có thông tin cây trồng. Vui lòng nhập tên hoặc tải ảnh.")
            context["crop_name"] = "Không xác định"
            context["search_keyword"] = "nong-san"
            context["health"] = "Không rõ"
            context["symptoms"] = "Không có"
            context["urgency"] = "Low"

        # ----- ACT 2: Scraper -----
        keyword = context["search_keyword"]
        logs.append(f"🌐 [Act] Đang cào giá thị trường cho từ khóa '{keyword}'...")
        try:
            context["market_price"] = fetch_market_price(keyword)
        except Exception as e:
            logs.append(f"⚠️ [Lỗi Scraper] {str(e)}. Dùng dữ liệu mặc định.")
            context["market_price"] = "Giá tham khảo: 12,000 VND/kg"

        # ----- ACT 3: Weather -----
        logs.append(f"🌤️ [Act] Đang kiểm tra thời tiết tại {location}...")
        try:
            context["weather"] = get_current_weather(location)
        except Exception as e:
            logs.append(f"⚠️ [Lỗi Weather] {str(e)}. Dùng dữ liệu mặc định.")
            context["weather"] = f"Thời tiết tại {location}: Nắng, 32°C"

        # ----- ACT 4: Google Search (tìm thêm thông tin kỹ thuật) -----
        search_query = f"{context['crop_name']} cách trồng và chăm sóc khu vực Tây Nguyên"
        logs.append(f"🔎 [Act] Đang tìm kiếm thông tin bổ sung về '{context['crop_name']}'...")
        try:
            search_results = google_search(search_query, num_results=2)
            context["search_results"] = search_results
            logs.append("📄 [Observe] Đã nhận được kết quả tìm kiếm.")
        except Exception as e:
            logs.append(f"⚠️ [Lỗi Search] {str(e)}. Bỏ qua tìm kiếm.")
            context["search_results"] = "Không có thông tin tìm kiếm."

        # ----- OBSERVE (đã có trong logs) -----
        logs.append("📊 [Observe] Đã thu thập đầy đủ dữ liệu.")

        # ----- RE-PLAN: Tổng hợp khuyến nghị -----
        logs.append("🧠 [Re-plan] Agent đang tổng hợp dữ liệu để đưa ra khuyến nghị...")

        final_prompt = f"""
Bạn là chuyên gia nông nghiệp tại Miền Trung - Tây Nguyên. Dựa trên thông tin sau, đưa ra khuyến nghị chi tiết bằng tiếng Việt.

1. Cây trồng: {context['crop_name']}
   Sức khỏe: {context['health']}
   Triệu chứng: {context['symptoms']}
   Mức độ khẩn cấp: {context['urgency']}

2. Giá thị trường:
{context['market_price']}

3. Thời tiết:
{context['weather']}

4. Thông tin tìm kiếm bổ sung:
{context['search_results']}

Hãy đưa ra:
- Chẩn đoán tình trạng cây.
- Phân tích ảnh hưởng của giá và thời tiết.
- Khuyến nghị cụ thể: nên bán hay giữ? biện pháp xử lý bệnh? ứng phó thời tiết?
- Tận dụng thông tin tìm kiếm để làm phong phú lời khuyên.
"""
        final_decision = call_groq_text(final_prompt)
        if final_decision.startswith("⚠️") or final_decision.startswith("❌"):
            logs.append(f"❌ [Lỗi Groq] {final_decision}")
            final_decision = "⚠️ Không thể tổng hợp khuyến nghị. Vui lòng thử lại."

        # ----- Nếu có Telegram, gửi báo cáo -----
        if user_telegram_id:
            report = f"🌾 *Báo cáo nông nghiệp*\n\n{final_decision[:2000]}"
            send_result = send_telegram_message(user_telegram_id, report)
            logs.append(f"📨 {send_result}")

        return final_decision, logs