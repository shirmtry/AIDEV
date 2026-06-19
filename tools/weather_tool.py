import requests
import os

def get_current_weather(location="Gia Lai"):
    """
    Tool 3: Lấy dữ liệu thời tiết thực tế qua OpenWeatherMap API.
    """
    api_key = os.getenv("OPENWEATHER_API_KEY")
    url = f"http://api.openweathermap.org/data/2.5/weather?q={location},VN&appid={api_key}&units=metric&lang=vi"
    
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            weather_desc = data['weather'][0]['description']
            temp = data['main']['temp']
            humidity = data['main']['humidity']
            return f"Thời tiết tại {location}: {weather_desc}, Nhiệt độ: {temp}°C, Độ ẩm: {humidity}%"
        return "Không lấy được dữ liệu thời tiết."
    except Exception as e:
        return f"Lỗi kết nối API thời tiết: {str(e)}"