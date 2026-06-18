import os
import requests
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from datetime import datetime

@dataclass
class RiskResult:
    score: float
    level: str   # LOW, MEDIUM, HIGH, CRITICAL
    reasoning: str
    factors: List[str]

class WeatherService:
    """Fetches weather from OpenWeatherMap with fallback to mock."""
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("OPENWEATHER_API_KEY")
        self.base_url = "https://api.openweathermap.org/data/2.5/weather"
    
    def get_weather(self, location: str) -> Dict[str, Any]:
        if not self.api_key:
            return self._mock_weather(location)
        try:
            params = {"q": location, "appid": self.api_key, "units": "metric", "lang": "vi"}
            resp = requests.get(self.base_url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            return {
                "success": True,
                "location": f"{data['name']}, {data.get('sys', {}).get('country', 'VN')}",
                "temperature": round(data["main"]["temp"], 1),
                "feels_like": round(data["main"]["feels_like"], 1),
                "humidity": data["main"]["humidity"],
                "description": data["weather"][0]["description"].capitalize(),
                "wind_speed": round(data["wind"]["speed"] * 3.6, 1),
                "clouds": data["clouds"]["all"],
                "rainfall_1h": data.get("rain", {}).get("1h", 0),
                "timestamp": datetime.fromtimestamp(data["dt"]).strftime("%d/%m/%Y %H:%M"),
                "source": "OpenWeatherMap (Live)"
            }
        except Exception as e:
            return self._mock_weather(location, error=str(e))
    
    def _mock_weather(self, location: str, error: Optional[str] = None) -> Dict:
        import random
        base_data = {
            "Chư Sê": {"temp": 22, "humidity": 88, "rain": 4.2, "desc": "Mưa rào nhẹ"},
            "Đắk Đoa": {"temp": 21, "humidity": 91, "rain": 6.5, "desc": "Mưa vừa, có sấm nhẹ"},
            "Pleiku": {"temp": 20, "humidity": 86, "rain": 2.1, "desc": "Nhiều mây, ẩm"},
            "Buôn Ma Thuột": {"temp": 25, "humidity": 78, "rain": 0, "desc": "Nắng nhẹ, mây rải rác"},
        }
        matched = next((v for k, v in base_data.items() if k.lower() in location.lower()), 
                       {"temp": 23, "humidity": 85, "rain": 3.0, "desc": "Mây nhiều, ẩm ướt"})
        temp = matched["temp"] + random.uniform(-1, 1)
        return {
            "success": True,
            "location": location,
            "temperature": round(temp, 1),
            "feels_like": round(temp - 2.5, 1),
            "humidity": matched["humidity"] + random.randint(-3, 3),
            "description": matched["desc"],
            "wind_speed": round(random.uniform(5, 18), 1),
            "clouds": 75,
            "rainfall_1h": matched["rain"],
            "timestamp": datetime.now().strftime("%d/%m/%Y %H:%M"),
            "source": "⚠️ Dữ liệu mô phỏng (Chưa có API key OpenWeatherMap)",
            "error": error
        }

class RiskEngine:
    """Computes disease risk scores based on weather vs disease conditions."""
    
    def __init__(self):
        pass
    
    def compute_risk(self, weather: Dict, diseases: List[Dict]) -> List[Dict]:
        """Compute risk for each disease and return sorted list with risk details."""
        results = []
        temp = weather.get("temperature", 25)
        humidity = weather.get("humidity", 75)
        rainfall = weather.get("rainfall_1h", 0)
        
        for disease in diseases:
            conditions = disease.get("conditions", {})
            risk_score = 0
            factors = []
            
            # Temperature
            temp_range = conditions.get("temperature_range_celsius", [0, 100])
            if len(temp_range) >= 2 and temp_range[0] <= temp <= temp_range[1]:
                risk_score += 40
                factors.append(f"Nhiệt độ {temp}°C nằm trong vùng nguy hiểm ({temp_range[0]}-{temp_range[1]}°C)")
            
            # Humidity
            hum_min = conditions.get("humidity_percent_min", 0)
            hum_max = conditions.get("humidity_percent_max", 100)
            if hum_min > 0 and humidity >= hum_min:
                risk_score += 35
                factors.append(f"Độ ẩm {humidity}% vượt ngưỡng nguy hiểm (>{hum_min}%)")
            elif hum_max < 100 and humidity <= hum_max:
                risk_score += 30
                factors.append(f"Độ ẩm thấp {humidity}% thuận lợi cho côn trùng")
            
            # Rainfall
            rain_threshold = conditions.get("rainfall_mm_threshold", 0)
            if conditions.get("rainfall_favorable", False) and rainfall >= rain_threshold:
                risk_score += 25
                factors.append(f"Lượng mưa {rainfall}mm tạo điều kiện phát triển bệnh")
            elif not conditions.get("rainfall_favorable", True) and rainfall == 0:
                risk_score += 20
                factors.append("Thời tiết khô hanh thuận lợi cho sâu bọ")
            
            # Clamp
            risk_score = min(100, risk_score)
            if risk_score >= 40:  # only report if significant
                level = "CRITICAL" if risk_score >= 75 else "HIGH" if risk_score >= 60 else "MEDIUM"
                results.append({
                    **disease,
                    "risk_score": risk_score,
                    "risk_level": level,
                    "risk_factors": factors,
                    "risk_reasoning": "; ".join(factors) if factors else "Điều kiện bình thường."
                })
        
        return sorted(results, key=lambda x: x["risk_score"], reverse=True)