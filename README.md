# 🌾 Hệ thống Multi‑Agent Giám sát Nông sản Real‑time

Ứng dụng **AI Agent** tự động phân tích cây trồng từ ảnh chụp, kết hợp với dữ liệu thị trường và thời tiết thực tế để đưa ra khuyến nghị chiến lược cho nông dân tại khu vực **Bình Định – Gia Lai**.

---

## 🚀 Tính năng chính

- 📷 **Nhận diện cây trồng và bệnh hại** từ ảnh (dùng Gemini Vision).
- 🌐 **Cào giá nông sản trực tuyến** theo từ khoá (ví dụ: gạo, cà phê, tiêu).
- 🌤️ **Lấy dữ liệu thời tiết hiện tại** từ OpenWeatherMap.
- 🧠 **Tổng hợp và đưa ra khuyến nghị** (thời điểm thu hoạch, biện pháp xử lý bệnh, ứng phó thời tiết) dựa trên tất cả thông tin.
- 🖥️ **Giao diện web trực quan** xây dựng bằng Streamlit.
- 🔄 **Quy trình tự chủ (Autonomous)** : Agent tự động gọi công cụ, phân tích và đưa ra quyết định.

---

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ |
|------------|-----------|
| Frontend | Streamlit |
| Nhận diện ảnh | Gemini 2.5 Flash (Google GenAI) |
| Cào dữ liệu | Requests + BeautifulSoup |
| Thời tiết | OpenWeatherMap API |
| Môi trường | Python 3.8+, venv |

---
```
## 📁 Cấu trúc thư mục
HACKATHON/
├── .env.example # Mẫu file biến môi trường
├── .gitignore # Bỏ qua các file không cần thiết
├── agent_manager.py # Điều phối Agent và quy trình làm việc
├── app.py # Ứng dụng Streamlit chính
├── requirements.txt # Các thư viện cần cài đặt
├── tools/
│ ├── scraper_tool.py # Cào giá nông sản
│ ├── vision_tool.py # Phân tích ảnh với Gemini
│ └── weather_tool.py # Lấy dữ liệu thời tiết
└── README.md # Hướng dẫn sử dụng
```


---

## ⚙️ Yêu cầu hệ thống

- Python 3.8 trở lên
- Kết nối Internet (để gọi API và cào dữ liệu)
- Tài khoản (hoặc API key) cho:
  - [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)
  - [OpenWeatherMap](https://openweathermap.org/api) (gói Free)

---

## 🔧 Cài đặt và chạy ứng dụng

### 1. Clone hoặc tải mã nguồn
Di chuyển vào thư mục dự án:
```
cd C:\Users\admin\Desktop\FB\video\HACKATHON
```

### 2. Tạo và kích hoạt môi trường ảo
```
python -m venv venv<br>
venv\Scripts\activate        # Windows
source venv/bin/activate     # Linux/Mac
```
### 3. Cài đặt các thư viện
```
pip install -r requirements.txt
Nếu thiếu một số gói, cài bổ sung:
pip install streamlit google-genai requests beautifulsoup4 python-dotenv
```

### 4. Cấu hình biến môi trường
Sao chép .env.example thành .env:

```
copy .env.example .env
```
Mở file .env và điền các API key thật:
```
GEMINI_API_KEY=your_gemini_api_key
OPENWEATHER_API_KEY=your_openweather_api_key
```
### 5. Chạy ứng dụng
```
streamlit run app.py
Trình duyệt sẽ tự động mở tại địa chỉ http://localhost:8501. <br>Nếu không, hãy truy cập thủ công.
```
📸 Cách sử dụng
1. Chọn địa phương (Gia Lai hoặc Bình Định) trên thanh bên trái.
2. Tải ảnh cây trồng bằng cách chụp trực tiếp từ camera hoặc tải file lên.
3. Nhấn nút “🚀 Kích hoạt AI Agent Phân Tích”.
4. Hệ thống sẽ hiển thị:
   - Nhật ký hoạt động (log) các bước Agent thực hiện.
   - Khuyến nghị chiến lược cuối cùng (bằng tiếng Việt).

⚠️ Lưu ý khi chạy lần đầu
- Đảm bảo các API key hợp lệ và có đủ hạn mức sử dụng.
- Tính năng cào giá thị trường phụ thuộc vào trang web đích; nếu bị lỗi, Agent vẫn hoạt động với dữ liệu mẫu (có thể tùy chỉnh trong `scraper_tool.py`).
- Nếu không có ảnh thật, có thể upload ảnh minh họa từ Internet để test quy trình.

## 📌 Thông tin API Keys

| Dịch vụ | Nơi lấy | Ghi chú |
|---------|---------|---------|
| Gemini (Google) | [AI Studio](https://aistudio.google.com/apikey) | Dùng cho nhận diện ảnh (Vision) và sinh văn bản |
| OpenWeatherMap | [OpenWeather](https://openweathermap.org/api) | Lấy dữ liệu thời tiết hiện tại (gói Free). **Lưu ý:** Tên thành phố phải khớp với tên trong API (ví dụ: `Pleiku` thay vì `Gia Lai`; `Quy Nhon` thay vì `Bình Định`). Nếu bạn gặp lỗi 404, hãy sửa tên thành phố trong file `weather_tool.py` hoặc trong code gọi `get_current_weather()`. |

👥 Đóng góp và phát triển
Dự án được xây dựng trong khuôn khổ Hackathon AIDEV 2026. Mọi ý kiến đóng góp vui lòng liên hệ qua email hoặc tạo issue trên repository (nếu có).

📄 Giấy phép
Dự án sử dụng mã nguồn mở, miễn phí cho mục đích học tập và nghiên cứu.

Chúc bạn sử dụng ứng dụng thành công! 🌱