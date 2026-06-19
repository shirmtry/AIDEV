import requests
from bs4 import BeautifulSoup

def fetch_market_price(crop_keyword):
    """
    Tool 2: Cào giá nông sản thật theo thời gian thực.
    """
    try:
        # Ví dụ cào trang tin tức nông nghiệp/giá cả tổng hợp
        url = f"https://giacaphe.com/gia-{crop_keyword}/" 
        # Nếu là cây khác, hệ thống tự động linh hoạt chuyển link hoặc dùng trang tổng hợp:
        if "cà phê" not in crop_keyword.lower() and "tiêu" not in crop_keyword.lower():
            url = "https://tintucnongnghiep.com/gia-nong-san/"

        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        response = requests.get(url, headers=headers, timeout=5)
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            # Logic trích xuất text cụ thể theo cấu trúc trang (đội làm Tool cần inspect HTML trang đích)
            # Ở đây trả về chuỗi text thô chứa bảng giá để Agent tự đọc và trích xuất
            return soup.get_text()[:2000] 
        return "Không thể kết nối đến trang giá thị trường."
    except Exception as e:
        return f"Lỗi cào dữ liệu giá: {str(e)}"