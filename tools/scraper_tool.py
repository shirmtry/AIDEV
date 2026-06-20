import requests
from bs4 import BeautifulSoup
import logging
import re

logger = logging.getLogger(__name__)

# ✅ NÂNG CẤP: Mở rộng bảng ánh xạ, thêm các biến thể thường gặp khi gõ không dấu
CROP_MAPPING = {
    # Lúa / Gạo
    "gao": "Gạo thô",
    "lua": "Gạo thô",
    "lúa": "Gạo thô",
    "gạo": "Gạo thô",
    # Cà phê
    "ca-phe": "Cà phê Robusta",
    "caphe": "Cà phê Robusta",
    "cà phê": "Cà phê Robusta",
    "ca phe": "Cà phê Robusta",
    "cafe": "Cà phê Robusta",
    "cà-phê": "Cà phê Robusta",
    # Hồ tiêu
    "tieu": "Hồ tiêu",
    "tiêu": "Hồ tiêu",
    "ho-tieu": "Hồ tiêu",
    "hotieu": "Hồ tiêu",
    "pepper": "Hồ tiêu",
    # Cacao
    "ca cao": "Cacao",
    "cacao": "Cacao",
    "ca-cao": "Cacao",
    "cocoa": "Cacao",
    # Ngô
    "ngo": "Ngô",
    "ngô": "Ngô",
    "bap": "Ngô",
    "bắp": "Ngô",
    "corn": "Ngô",
    # Đường / Mía
    "duong": "Đường",
    "đường": "Đường",
    "mia": "Đường",
    "mía": "Đường",
    "sugarcane": "Đường",
    # Điều
    "dieu": "Điều",
    "điều": "Điều",
    "dieu nhan": "Điều",
    "cashew": "Điều",
    # Đậu
    "dau": "Đậu",
    "đậu": "Đậu",
    "dau tuong": "Đậu",
    "đậu tương": "Đậu",
}

SOURCE_URL = "https://nhabeagri.com/gia-nong-san/"
REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}


def _resolve_product_name(crop_keyword: str) -> str | None:
    """
    Tra cứu tên sản phẩm từ từ khóa. Trả về None nếu không tìm thấy.
    Hỗ trợ cả khớp chính xác lẫn khớp mờ (fuzzy).
    """
    keyword_lower = crop_keyword.lower().strip()

    # Khớp chính xác
    if keyword_lower in CROP_MAPPING:
        return CROP_MAPPING[keyword_lower]

    # ✅ NÂNG CẤP: Khớp mờ - kiểm tra nếu từ khóa chứa key hoặc ngược lại
    for key, value in CROP_MAPPING.items():
        if key in keyword_lower or keyword_lower in key:
            logger.info(f"Khớp mờ: '{crop_keyword}' → '{value}' (qua key '{key}')")
            return value

    return None


def fetch_market_price(crop_keyword: str) -> str:
    """
    Tool 2: Lấy giá nông sản thực từ nhabeagri.com (cập nhật hàng ngày).

    Args:
        crop_keyword: Từ khóa cây trồng (có hoặc không dấu).

    Returns:
        str: Thông tin giá dạng văn bản để Agent sử dụng.
    """
    product_name = _resolve_product_name(crop_keyword)

    # ✅ NÂNG CẤP: Nếu không tìm thấy trong mapping, thông báo rõ ràng thay vì dùng fallback sai
    if not product_name:
        logger.warning(f"Không tìm thấy '{crop_keyword}' trong bảng ánh xạ sản phẩm.")
        return (
            f"⚠️ Chưa có dữ liệu giá thị trường cho '{crop_keyword}' trong hệ thống. "
            f"Các loại cây trồng hiện được hỗ trợ tra giá: Lúa/Gạo, Cà phê Robusta, "
            f"Hồ tiêu, Cacao, Ngô, Đường/Mía, Điều. "
            f"Agent sẽ tư vấn dựa trên thông tin thời tiết và tìm kiếm bổ sung."
        )

    try:
        logger.info(f"Đang cào dữ liệu giá cho '{product_name}' từ {SOURCE_URL}")
        response = requests.get(SOURCE_URL, headers=REQUEST_HEADERS, timeout=15)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # Tìm bảng giá
        table = soup.find("table")
        if not table:
            logger.warning(f"Không tìm thấy bảng giá trên {SOURCE_URL}")
            return f"⚠️ Không tìm thấy bảng giá trên trang nguồn. Vui lòng kiểm tra lại sau."

        # Lấy thời gian cập nhật (tìm trước khi duyệt bảng để tái sử dụng)
        time_tag = soup.find("p", string=re.compile(r"Cập nhật gần nhất", re.IGNORECASE))
        update_time = time_tag.get_text(strip=True) if time_tag else "hôm nay"

        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 6:
                continue

            name_cell = cells[0].get_text(strip=True)
            if product_name.lower() not in name_cell.lower():
                continue

            # Trích xuất dữ liệu giá
            unit = cells[1].get_text(strip=True)
            price_raw = cells[5].get_text(strip=True)
            # ✅ Làm sạch giá: chỉ giữ số, dấu chấm và dấu phẩy
            price_clean = re.sub(r"[^\d.,]", "", price_raw)
            change = cells[6].get_text(strip=True) if len(cells) > 6 else "N/A"

            return (
                f"📊 Giá {product_name} ({update_time}):\n"
                f"   • Giá đóng cửa: {price_clean} {unit}\n"
                f"   • Biến động: {change}\n"
                f"   • Nguồn: nhabeagri.com"
            )

        # Không tìm thấy hàng khớp trong bảng — trả về tóm tắt tổng quan thay vì raw text
        logger.warning(f"Không tìm thấy hàng giá cho '{product_name}' trong bảng.")
        return (
            f"⚠️ Không tìm thấy giá cụ thể cho '{product_name}' trên bảng giá hôm nay. "
            f"Tên sản phẩm trong bảng có thể đã thay đổi. "
            f"Vui lòng kiểm tra trực tiếp tại: {SOURCE_URL}"
        )

    except requests.exceptions.Timeout:
        logger.error("Timeout khi gọi nhabeagri.com")
        return "⚠️ Lỗi kết nối: Trang giá nông sản không phản hồi (timeout). Vui lòng thử lại sau."
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error: {e}")
        return f"⚠️ Trang giá nông sản trả về lỗi HTTP: {e}"
    except requests.exceptions.RequestException as e:
        logger.error(f"Lỗi kết nối: {e}")
        return f"⚠️ Không thể kết nối trang giá nông sản: {str(e)}"
    except Exception as e:
        logger.error(f"Lỗi không xác định khi xử lý dữ liệu giá: {e}", exc_info=True)
        return f"⚠️ Lỗi xử lý dữ liệu giá: {str(e)}"