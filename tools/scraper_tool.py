import requests
from bs4 import BeautifulSoup
import logging
import re

logger = logging.getLogger(__name__)

# Map từ khóa tiếng Việt sang tên sản phẩm trên nhabeagri.com
CROP_MAPPING = {
    "gao": "Gạo thô",
    "lua": "Gạo thô",
    "ca-phe": "Cà phê Robusta",
    "cà phê": "Cà phê Robusta",
    "ca phe": "Cà phê Robusta",
    "tieu": "Hồ tiêu",
    "tiêu": "Hồ tiêu",
    "ca cao": "Cacao",
    "cacao": "Cacao",
    "ngo": "Ngô",
    "ngô": "Ngô",
    "đường": "Đường",
    "duong": "Đường",
}

def fetch_market_price(crop_keyword):
    """
    Tool 2: Lấy giá nông sản thật từ nhabeagri.com (cập nhật hàng ngày)
    """
    # Tìm tên sản phẩm trong mapping
    crop_keyword_lower = crop_keyword.lower().strip()
    product_name = CROP_MAPPING.get(crop_keyword_lower)
    
    if not product_name:
        # Nếu không có trong mapping, thử tìm kiếm mờ
        for key, value in CROP_MAPPING.items():
            if key in crop_keyword_lower or crop_keyword_lower in key:
                product_name = value
                break
    
    if not product_name:
        logger.warning(f"Không tìm thấy sản phẩm '{crop_keyword}' trong danh sách, sử dụng mặc định")
        product_name = "Gạo thô"  # fallback
    
    try:
        url = "https://nhabeagri.com/gia-nong-san/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        logger.info(f"Đang cào dữ liệu giá cho '{product_name}' từ {url}")
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Tìm bảng giá - dữ liệu nằm trong thẻ <tbody>
        table = soup.find('table')
        if not table:
            return f"Không tìm thấy bảng giá trên trang {url}"
        
        # Duyệt qua các hàng trong bảng để tìm sản phẩm
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 6:
                # Cột 0: Tên sản phẩm
                name_cell = cells[0].get_text(strip=True)
                if product_name.lower() in name_cell.lower():
                    # Cột 5: Giá đóng cửa (hoặc giá hiện tại)
                    price_text = cells[5].get_text(strip=True)  # Đóng cửa
                    # Cột 1: Đơn vị
                    unit = cells[1].get_text(strip=True)
                    
                    # Làm sạch giá
                    price = re.sub(r'[^\d.,]', '', price_text)
                    
                    # Lấy thời gian cập nhật
                    time_tag = soup.find('p', string=re.compile(r'Cập nhật gần nhất'))
                    update_time = time_tag.get_text(strip=True) if time_tag else "hôm nay"
                    
                    return f"📊 Giá {product_name} {update_time}:\n" \
                           f"   • Giá: {price} {unit}\n" \
                           f"   • Biến động: {cells[6].get_text(strip=True) if len(cells) > 6 else 'N/A'}\n" \
                           f"   • Nguồn: nhabeagri.com"
        
        # Nếu không tìm thấy sản phẩm cụ thể, trả về toàn bộ bảng giá dạng tóm tắt
        return f"Không tìm thấy giá cho '{product_name}'. Dữ liệu thị trường hôm nay:\n" + \
               f"{soup.get_text()[:1500]}"
               
    except requests.exceptions.Timeout:
        logger.error("Timeout khi gọi nhabeagri.com")
        return "⚠️ Lỗi kết nối: Trang giá nông sản không phản hồi (timeout). Vui lòng thử lại."
    except requests.exceptions.RequestException as e:
        logger.error(f"Lỗi kết nối: {e}")
        return f"⚠️ Không thể lấy dữ liệu giá: {str(e)}"
    except Exception as e:
        logger.error(f"Lỗi parse dữ liệu: {e}")
        return f"⚠️ Lỗi xử lý dữ liệu giá: {str(e)}"