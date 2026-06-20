import requests
import os
import logging

logger = logging.getLogger(__name__)

OPENWEATHER_API_URL = "http://api.openweathermap.org/data/2.5/weather"

# ✅ NÂNG CẤP: Mở rộng bản đồ thành phố, hỗ trợ thêm các biến thể tên
CITY_MAP = {
    "Gia Lai": "Pleiku",
    "gia lai": "Pleiku",
    "Pleiku": "Pleiku",
    "Bình Định": "Quy Nhon",
    "bình định": "Quy Nhon",
    "binh dinh": "Quy Nhon",
    "Quy Nhon": "Quy Nhon",
    "Quy Nhơn": "Quy Nhon",
}


def get_current_weather(location: str = "Gia Lai") -> str:
    """
    Tool 3: Lấy dữ liệu thời tiết thực tế qua OpenWeatherMap API.

    Args:
        location: Tên địa phương (ví dụ: "Gia Lai", "Bình Định").

    Returns:
        str: Thông tin thời tiết dạng văn bản, hoặc thông báo lỗi.

    Yêu cầu biến môi trường: OPENWEATHER_API_KEY
    """
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key:
        logger.error("OPENWEATHER_API_KEY chưa được cấu hình trong file .env")
        return (
            "⚠️ Không có dữ liệu thời tiết (thiếu OPENWEATHER_API_KEY). "
            "Vui lòng kiểm tra cấu hình .env và đăng ký tại openweathermap.org."
        )

    # ✅ Tra cứu tên thành phố cho API (không phân biệt hoa/thường)
    city = CITY_MAP.get(location) or CITY_MAP.get(location.strip()) or location

    params = {
        "q": f"{city},VN",
        "appid": api_key,
        "units": "metric",
        "lang": "vi",
    }

    try:
        logger.info(f"Lấy thời tiết cho: {location} (city API: {city})")
        response = requests.get(OPENWEATHER_API_URL, params=params, timeout=10)

        if response.status_code == 200:
            data = response.json()
            weather_desc = data["weather"][0]["description"]
            temp = data["main"]["temp"]
            temp_feel = data["main"]["feels_like"]
            humidity = data["main"]["humidity"]
            wind_speed = data["wind"].get("speed", 0)
            # ✅ NÂNG CẤP: Thêm cảm giác nhiệt và tốc độ gió để tư vấn nông nghiệp chính xác hơn
            return (
                f"🌤️ Thời tiết tại {location} ({city}):\n"
                f"   • Tình trạng: {weather_desc.capitalize()}\n"
                f"   • Nhiệt độ: {temp}°C (cảm giác như {temp_feel}°C)\n"
                f"   • Độ ẩm: {humidity}%\n"
                f"   • Tốc độ gió: {wind_speed} m/s"
            )

        elif response.status_code == 401:
            logger.error("OPENWEATHER_API_KEY không hợp lệ.")
            return "❌ Lỗi xác thực: OpenWeatherMap API key không hợp lệ hoặc chưa được kích hoạt."

        elif response.status_code == 404:
            logger.warning(f"Không tìm thấy thành phố '{city}' trên OpenWeatherMap.")
            return f"⚠️ Không tìm thấy dữ liệu thời tiết cho '{location}' (thành phố API: '{city}')."

        else:
            logger.error(f"OpenWeatherMap lỗi {response.status_code}: {response.text[:200]}")
            return f"⚠️ Không lấy được dữ liệu thời tiết. Mã lỗi: {response.status_code}"

    except requests.exceptions.Timeout:
        logger.error("Timeout khi gọi OpenWeatherMap API")
        return "⚠️ Lỗi kết nối: API thời tiết không phản hồi (timeout). Sử dụng dữ liệu dự phòng."
    except requests.exceptions.RequestException as e:
        logger.error(f"Lỗi kết nối API thời tiết: {e}")
        return f"⚠️ Lỗi kết nối API thời tiết: {str(e)}"