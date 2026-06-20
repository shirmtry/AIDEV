import requests
import os
import logging

logger = logging.getLogger(__name__)

def get_current_weather(location="Gia Lai"):
    """
    Tool 3: Lấy dữ liệu thời tiết thực tế qua OpenWeatherMap API.
    """
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key:
        logger.error("OPENWEATHER_API_KEY chưa được cấu hình trong file .env")
        return "Không có dữ liệu thời tiết (thiếu API key). Vui lòng kiểm tra cấu hình."

    # Chuẩn hóa tên thành phố cho API
    city_map = {
        "Gia Lai": "Pleiku",
        "Bình Định": "Quy Nhon"
    }
    city = city_map.get(location, location)
    url = f"http://api.openweathermap.org/data/2.5/weather?q={city},VN&appid={api_key}&units=metric&lang=vi"
    
    try:
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            weather_desc = data['weather'][0]['description']
            temp = data['main']['temp']
            humidity = data['main']['humidity']
            return f"Thời tiết tại {location} ({city}): {weather_desc}, Nhiệt độ: {temp}°C, Độ ẩm: {humidity}%"
        elif response.status_code == 401:
            return "Lỗi xác thực: OpenWeatherMap API key không hợp lệ."
        elif response.status_code == 404:
            return f"Không tìm thấy thành phố '{city}' cho khu vực {location}."
        else:
            return f"Không lấy được dữ liệu thời tiết. Mã lỗi: {response.status_code}"
            
    except requests.exceptions.Timeout:
        logger.error("Timeout khi gọi OpenWeatherMap API")
        return "Lỗi kết nối: API thời tiết không phản hồi (timeout)."
    except requests.exceptions.RequestException as e:
        logger.error(f"Lỗi kết nối API thời tiết: {e}")
        return f"Lỗi kết nối API thời tiết: {str(e)}"