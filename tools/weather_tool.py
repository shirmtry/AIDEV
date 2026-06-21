import requests
import os
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

OPENWEATHER_API_URL = "http://api.openweathermap.org/data/2.5/weather"
FORECAST_API_URL = "http://api.openweathermap.org/data/2.5/forecast"

CITY_MAP = {
    "Gia Lai": "Pleiku",
    "gia lai": "Pleiku",
    "Pleiku": "Pleiku",
    "Bình Định": "Quy Nhon",
    "bình định": "Quy Nhon",
    "binh dinh": "Quy Nhon",
    "Quy Nhon": "Quy Nhon",
    "Quy Nhơn": "Quy Nhon",
    "Đắk Lắk": "Buon Ma Thuot",
    "dak lak": "Buon Ma Thuot",
    "Buon Ma Thuot": "Buon Ma Thuot",
    "Lâm Đồng": "Da Lat",
    "lam dong": "Da Lat",
    "Da Lat": "Da Lat",
    "Kon Tum": "Kon Tum",
    "kon tum": "Kon Tum",
}

_cache_current = {}
_cache_forecast = {}

def get_current_weather(location: str = "Gia Lai") -> str:
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key:
        return "⚠️ Thiếu OPENWEATHER_API_KEY."
    city = CITY_MAP.get(location, location)
    cache_key = (city, "current")
    if cache_key in _cache_current:
        data, timestamp = _cache_current[cache_key]
        if (datetime.now() - timestamp).seconds < 600:
            logger.info(f"Lấy thời tiết hiện tại từ cache cho {location}")
            return data
    params = {
        "q": f"{city},VN",
        "appid": api_key,
        "units": "metric",
        "lang": "vi",
    }
    try:
        logger.info(f"Lấy thời tiết hiện tại cho: {location} (city: {city})")
        response = requests.get(OPENWEATHER_API_URL, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            weather_desc = data["weather"][0]["description"]
            temp = data["main"]["temp"]
            temp_feel = data["main"]["feels_like"]
            humidity = data["main"]["humidity"]
            wind_speed = data["wind"].get("speed", 0)
            result = (
                f"🌤️ Thời tiết tại {location} ({city}):\n"
                f"   • Tình trạng: {weather_desc.capitalize()}\n"
                f"   • Nhiệt độ: {temp}°C (cảm giác {temp_feel}°C)\n"
                f"   • Độ ẩm: {humidity}%\n"
                f"   • Tốc độ gió: {wind_speed} m/s"
            )
            _cache_current[cache_key] = (result, datetime.now())
            return result
        elif response.status_code == 404:
            return f"⚠️ Không tìm thấy thành phố '{city}'."
        else:
            return f"⚠️ Lỗi {response.status_code}: {response.text[:100]}"
    except Exception as e:
        logger.error(f"Lỗi thời tiết: {e}")
        return f"⚠️ Lỗi kết nối API thời tiết: {str(e)}"

def get_weather_forecast(location: str = "Gia Lai", days: int = 5) -> str:
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key:
        return "⚠️ Thiếu OPENWEATHER_API_KEY."
    city = CITY_MAP.get(location, location)
    cache_key = (city, "forecast", days)
    if cache_key in _cache_forecast:
        data, timestamp = _cache_forecast[cache_key]
        if (datetime.now() - timestamp).seconds < 3600:
            logger.info(f"Lấy dự báo từ cache cho {location}")
            return data
    params = {
        "q": f"{city},VN",
        "appid": api_key,
        "units": "metric",
        "lang": "vi",
        "cnt": days * 8,
    }
    try:
        logger.info(f"Lấy dự báo cho {location} ({city})")
        response = requests.get(FORECAST_API_URL, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            forecasts = data["list"][:days*8]
            lines = [f"🌦️ Dự báo thời tiết {days} ngày tới tại {location}:"]
            for item in forecasts:
                dt = datetime.fromtimestamp(item["dt"])
                date_str = dt.strftime("%d/%m %H:%M")
                temp = item["main"]["temp"]
                desc = item["weather"][0]["description"].capitalize()
                humidity = item["main"]["humidity"]
                wind = item["wind"].get("speed", 0)
                lines.append(f"   • {date_str}: {desc}, {temp}°C, độ ẩm {humidity}%, gió {wind} m/s")
            result = "\n".join(lines)
            _cache_forecast[cache_key] = (result, datetime.now())
            return result
        else:
            return f"⚠️ Lỗi dự báo {response.status_code}: {response.text[:100]}"
    except Exception as e:
        logger.error(f"Lỗi dự báo: {e}")
        return f"⚠️ Lỗi kết nối dự báo: {str(e)}"

def get_forecast_data_for_chart(location: str = "Gia Lai", days: int = 5) -> list | None:
    """Trả về list các dict {dt, temp, humidity, description} để vẽ biểu đồ."""
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key:
        return None
    city = CITY_MAP.get(location, location)
    params = {
        "q": f"{city},VN",
        "appid": api_key,
        "units": "metric",
        "lang": "vi",
        "cnt": days * 8,
    }
    try:
        response = requests.get(FORECAST_API_URL, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            result = []
            for item in data["list"]:
                result.append({
                    "dt": item["dt"],
                    "temp": item["main"]["temp"],
                    "humidity": item["main"]["humidity"],
                    "description": item["weather"][0]["description"],
                })
            return result
        else:
            return None
    except Exception as e:
        logger.error(f"Lỗi lấy dữ liệu dự báo: {e}")
        return None