import os
import logging
from tools.vision_tool import analyze_crop_image
from tools.scraper_tool import fetch_market_price
from tools.weather_tool import get_current_weather
from tools.telegram_tool import send_telegram_message
from tools.groq_text_tool import call_groq_text
from tools.search_tool import google_search

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ✅ Bảng ánh xạ tên cây trồng → từ khóa tra giá (đồng bộ với scraper_tool.py)
CROP_KEYWORD_MAP = {
    "lúa": "gao",
    "gạo": "gao",
    "cà phê": "ca-phe",
    "cafe": "ca-phe",
    "tiêu": "tieu",
    "hồ tiêu": "tieu",
    "ngô": "ngo",
    "bắp": "ngo",
    "đậu": "dau",
    "mía": "mia",
    "đường": "duong",
    "ca cao": "cacao",
    "cacao": "cacao",
    "điều": "dieu",
}


class CropDecisionAgent:
    """
    AI Agent tư vấn nông nghiệp theo luồng Act → Observe → Re-plan.
    Phối hợp 4 tool: Vision, Scraper, Weather, Search → tổng hợp qua Groq LLM.
    """

    def __init__(self):
        pass

    def _generate_keyword(self, crop_name: str) -> str:
        """
        Chuyển đổi tên cây trồng sang từ khóa tra giá không dấu.
        Ưu tiên tra cứu trong CROP_KEYWORD_MAP trước khi tự sinh từ khóa.
        """
        crop_lower = crop_name.lower().strip()

        # Khớp chính xác trong bảng
        for key, val in CROP_KEYWORD_MAP.items():
            if key in crop_lower:
                return val

        # ✅ Tự sinh từ khóa: viết thường, thay khoảng trắng bằng dấu gạch ngang
        return crop_lower.replace(" ", "-")

    def run_workflow(
        self,
        image_bytes: bytes = None,
        location: str = "Gia Lai",
        manual_crop: str = None,
        user_telegram_id: str = None,
    ) -> tuple[str, list[str]]:
        """
        Thực thi toàn bộ luồng AI Agent.

        Args:
            image_bytes: Dữ liệu ảnh cây trồng (tùy chọn).
            location: Địa phương của người dùng.
            manual_crop: Tên cây do người dùng nhập (tùy chọn).
            user_telegram_id: Chat ID Telegram để gửi báo cáo (tùy chọn).

        Returns:
            tuple: (quyết định cuối cùng dạng str, danh sách log dạng list[str])
        """
        logs = []
        context = {
            "location": location,
            "crop_name": None,
            "health": None,
            "symptoms": None,
            "urgency": "Low",
            "market_price": None,
            "weather": None,
            "search_keyword": "nong-san",
            "search_results": None,
        }

        # ═══════════════════════════════════════════════════════════
        # ACT 1: Xác định cây trồng (ưu tiên nhập tay → ảnh)
        # ═══════════════════════════════════════════════════════════
        if manual_crop and manual_crop.strip():
            crop_name = manual_crop.strip()
            logs.append(f"📝 [Manual] Người dùng nhập tên cây: **{crop_name}**")
            context["crop_name"] = crop_name
            context["search_keyword"] = self._generate_keyword(crop_name)
            context["health"] = "Không rõ (nhập thủ công)"
            context["symptoms"] = "Không có"
            context["urgency"] = "Low"

        elif image_bytes:
            logs.append("🤖 [Act] Đang phân tích hình ảnh cây trồng qua AI Vision...")
            vision_result = analyze_crop_image(image_bytes)

            if vision_result.get("error"):
                err_msg = vision_result.get("message", "Lỗi không xác định")
                logs.append(f"⚠️ [Vision] {err_msg} → Chuyển sang chế độ không xác định.")
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
                logs.append(
                    f"🔍 [Observe] Phát hiện: **{context['crop_name']}** | "
                    f"Sức khỏe: **{context['health']}** | Mức độ khẩn: **{context['urgency']}**"
                )
                if context["symptoms"] and context["symptoms"] != "Không có":
                    logs.append(f"🩺 [Observe] Triệu chứng: {context['symptoms']}")

        else:
            logs.append("⚠️ [Cảnh báo] Không có thông tin cây trồng. Vui lòng nhập tên hoặc tải ảnh.")
            context["crop_name"] = "Không xác định"
            context["search_keyword"] = "nong-san"
            context["health"] = "Không rõ"
            context["symptoms"] = "Không có"
            context["urgency"] = "Low"

        # ═══════════════════════════════════════════════════════════
        # ACT 2: Scraper - Lấy giá thị trường
        # ═══════════════════════════════════════════════════════════
        keyword = context["search_keyword"]
        logs.append(f"🌐 [Act] Đang lấy giá thị trường cho từ khóa '{keyword}'...")
        try:
            context["market_price"] = fetch_market_price(keyword)
            # ✅ Log kết quả ngắn gọn (không log toàn bộ để tránh spam)
            price_preview = context["market_price"][:80].replace("\n", " ")
            logs.append(f"💰 [Observe] Giá: {price_preview}...")
        except Exception as e:
            logger.error(f"Lỗi không mong đợi trong scraper: {e}", exc_info=True)
            logs.append(f"⚠️ [Lỗi Scraper] {str(e)}")
            context["market_price"] = f"Không lấy được giá thị trường: {str(e)}"

        # ═══════════════════════════════════════════════════════════
        # ACT 3: Weather - Lấy thời tiết
        # ═══════════════════════════════════════════════════════════
        logs.append(f"🌤️ [Act] Đang kiểm tra thời tiết tại {location}...")
        try:
            context["weather"] = get_current_weather(location)
            weather_preview = context["weather"][:80].replace("\n", " ")
            logs.append(f"☁️ [Observe] Thời tiết: {weather_preview}...")
        except Exception as e:
            logger.error(f"Lỗi không mong đợi trong weather: {e}", exc_info=True)
            logs.append(f"⚠️ [Lỗi Weather] {str(e)}")
            context["weather"] = f"Không lấy được dữ liệu thời tiết: {str(e)}"

        # ═══════════════════════════════════════════════════════════
        # ACT 4: Google Search - Tìm kiếm thông tin kỹ thuật
        # ═══════════════════════════════════════════════════════════
        crop_for_search = context["crop_name"] if context["crop_name"] != "Không xác định" else "nông nghiệp"
        search_query = f"{crop_for_search} cách trồng chăm sóc kỹ thuật khu vực Tây Nguyên Bình Định"
        logs.append(f"🔎 [Act] Đang tìm kiếm thông tin bổ sung về '{crop_for_search}'...")
        try:
            search_results = google_search(search_query, num_results=3)
            context["search_results"] = search_results
            if search_results.startswith("⚠️"):
                logs.append(f"⚠️ [Search] {search_results[:100]}")
            else:
                logs.append("📄 [Observe] Đã nhận được kết quả tìm kiếm bổ sung.")
        except Exception as e:
            logger.error(f"Lỗi không mong đợi trong search: {e}", exc_info=True)
            logs.append(f"⚠️ [Lỗi Search] {str(e)}")
            context["search_results"] = "Không có thông tin tìm kiếm bổ sung."

        # ═══════════════════════════════════════════════════════════
        # OBSERVE: Tổng kết dữ liệu đã thu thập
        # ═══════════════════════════════════════════════════════════
        logs.append("📊 [Observe] Đã thu thập đầy đủ dữ liệu từ 4 tool. Bắt đầu tổng hợp...")

        # ═══════════════════════════════════════════════════════════
        # RE-PLAN: Tổng hợp khuyến nghị qua Groq LLM
        # ═══════════════════════════════════════════════════════════
        logs.append("🧠 [Re-plan] Agent đang phân tích toàn diện để đưa ra khuyến nghị...")

        # ✅ NÂNG CẤP: Prompt được cấu trúc rõ ràng, thêm hướng dẫn định dạng output
        final_prompt = f"""Bạn là chuyên gia nông nghiệp kỳ cựu tại Miền Trung - Tây Nguyên Việt Nam với hơn 20 năm kinh nghiệm. 
Hãy phân tích dữ liệu dưới đây và đưa ra khuyến nghị thực tế, chi tiết bằng tiếng Việt.

═══════════════════════════════════════
📋 DỮ LIỆU THU THẬP ĐƯỢC
═══════════════════════════════════════

1️⃣ THÔNG TIN CÂY TRỒNG:
   • Tên cây: {context['crop_name']}
   • Tình trạng sức khỏe: {context['health']}
   • Triệu chứng: {context['symptoms']}
   • Mức độ khẩn cấp: {context['urgency']}
   • Địa phương: {context['location']}

2️⃣ GIÁ THỊ TRƯỜNG:
{context['market_price']}

3️⃣ THỜI TIẾT HIỆN TẠI:
{context['weather']}

4️⃣ THÔNG TIN KỸ THUẬT BỔ SUNG:
{context['search_results']}

═══════════════════════════════════════
📝 YÊU CẦU PHÂN TÍCH
═══════════════════════════════════════

Hãy đưa ra khuyến nghị theo cấu trúc sau:

**🔍 1. Chẩn đoán tình trạng cây:**
(Đánh giá sức khỏe cây, phân tích triệu chứng nếu có)

**📈 2. Phân tích thị trường:**
(Nhận xét về giá hiện tại, xu hướng, nên bán ngay hay tích trữ)

**🌤️ 3. Ảnh hưởng của thời tiết:**
(Tác động đến cây trồng, lịch tưới nước, thu hoạch)

**✅ 4. Khuyến nghị cụ thể:**
(Hành động ưu tiên theo mức độ khẩn cấp: NGAY LẬP TỨC / TRONG TUẦN NÀY / KẾ HOẠCH DÀI HẠN)

**💡 5. Mẹo kỹ thuật:**
(Dựa trên thông tin tìm kiếm, đưa ra 2-3 mẹo canh tác phù hợp địa phương)

Viết thực tế, ngắn gọn, dễ hiểu cho nông dân. Tránh dùng thuật ngữ khoa học quá phức tạp."""

        final_decision = call_groq_text(final_prompt)

        if final_decision.startswith("⚠️") or final_decision.startswith("❌"):
            logs.append(f"❌ [Lỗi Groq Text] {final_decision}")
            final_decision = (
                "⚠️ Không thể tổng hợp khuyến nghị từ AI lúc này. "
                "Vui lòng kiểm tra kết nối và GROQ_API_KEY, sau đó thử lại."
            )
        else:
            logs.append("✅ [Re-plan] Đã tổng hợp khuyến nghị thành công.")

        # ═══════════════════════════════════════════════════════════
        # OPTIONAL: Gửi báo cáo qua Telegram
        # ═══════════════════════════════════════════════════════════
        if user_telegram_id and str(user_telegram_id).strip():
            logs.append(f"📨 [Act] Đang gửi báo cáo đến Telegram chat {user_telegram_id}...")
            # ✅ Dùng Markdown: *bold* thay vì <b>bold</b> để khớp parse_mode của telegram_tool
            report_header = (
                f"🌾 *Báo cáo Nông Nghiệp AI*\n"
                f"📍 Địa phương: {location}\n"
                f"🌱 Cây trồng: {context['crop_name']}\n\n"
            )
            full_report = report_header + final_decision
            send_result = send_telegram_message(user_telegram_id, full_report)
            logs.append(f"📨 [Observe] {send_result}")

        return final_decision, logs