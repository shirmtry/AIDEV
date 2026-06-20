# 🌾 Hệ thống Multi‑Agent Giám sát Nông sản Real‑time

Ứng dụng **AI Agent** tự động phân tích cây trồng từ ảnh chụp, kết hợp với dữ liệu thị trường và thời tiết thực tế để đưa ra khuyến nghị chiến lược cho nông dân tại khu vực **Bình Định – Gia Lai**.  
Dự án được phát triển trong khuôn khổ **Hackathon AIDEV Summer 2026 – Vòng Chung kết**.

---

## 🚀 Tính năng chính

- 📷 **Nhận diện cây trồng và bệnh hại** từ ảnh (dùng Gemini 2.5 Flash / 1.5 Flash).
- 🔄 **Cơ chế Retry & Fallback thông minh** khi API Vision quá tải (lỗi 503) – tự động thử lại với model dự phòng và cho phép người dùng nhập tên cây thủ công.
- 🌐 **Cào giá nông sản thực tế** từ `nhabeagri.com` (hoặc fallback sang dữ liệu mẫu nếu trang lỗi).
- 🌤️ **Lấy dữ liệu thời tiết hiện tại** từ OpenWeatherMap (hỗ trợ Pleiku, Quy Nhơn).
- 🧠 **Tổng hợp và đưa ra khuyến nghị** (thời điểm thu hoạch, biện pháp xử lý bệnh, ứng phó thời tiết) dựa trên tất cả thông tin.
- 🖥️ **Giao diện web trực quan** xây dựng bằng Streamlit.
- 🔄 **Quy trình tự chủ (Autonomous)**: Agent tự động gọi công cụ, xử lý lỗi và đưa ra quyết định.
- ✏️ **Nhập tên cây thủ công** khi Vision không nhận diện được – đảm bảo luồng làm việc không bị gián đoạn.

---

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ |
|------------|-----------|
| Frontend | Streamlit |
| Nhận diện ảnh | Gemini 2.5 Flash / 1.5 Flash (Google GenAI) |
| Cào dữ liệu | Requests + BeautifulSoup (từ nhabeagri.com) |
| Thời tiết | OpenWeatherMap API |
| Quản lý biến môi trường | python‑dotenv |
| Môi trường | Python 3.8+, venv |

---

## 📁 Cấu trúc thư mục

```
HACKATHON/
├── .env.example                # Mẫu file biến môi trường
├── .gitignore                  # Bỏ qua file nhạy cảm
├── agent_manager.py            # Điều phối Agent và quy trình làm việc
├── app.py                      # Ứng dụng Streamlit chính
├── requirements.txt            # Các thư viện cần cài đặt
├── tools/
│   ├── scraper_tool.py         # Cào giá nông sản (thật từ nhabeagri.com)
│   ├── vision_tool.py          # Phân tích ảnh với Gemini (có retry)
│   └── weather_tool.py         # Lấy dữ liệu thời tiết từ OpenWeatherMap
└── README.md                   # Hướng dẫn sử dụng
```

---

## ⚙️ Yêu cầu hệ thống

- Python 3.8 trở lên
- Kết nối Internet (để gọi API và cào dữ liệu)
- Tài khoản (hoặc API key) cho:
  - [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)
  - [OpenWeatherMap](https://openweathermap.org/api)

---

## 🔧 Cài đặt và chạy ứng dụng

### 1. Clone hoặc tải mã nguồn
Di chuyển vào thư mục dự án:
```bash
cd C:\Users\admin\Desktop\FB\video\HACKATHON
```

### 2. Tạo và kích hoạt môi trường ảo
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
```

### 3. Cài đặt các thư viện
```bash
pip install -r requirements.txt
# Nếu thiếu một số gói, cài bổ sung:
pip install streamlit google-genai requests beautifulsoup4 python-dotenv
```

### 4. Cấu hình biến môi trường
Sao chép `.env.example` thành `.env`:
```bash
copy .env.example .env
```
Mở file `.env` và điền các API key thật:
```ini
GEMINI_API_KEY=your_gemini_api_key
OPENWEATHER_API_KEY=your_openweather_api_key
```

### 5. Chạy ứng dụng
```bash
streamlit run app.py
```
Trình duyệt sẽ tự động mở tại địa chỉ `http://localhost:8501`. Nếu không, hãy truy cập thủ công.

---

## 📸 Cách sử dụng

1. **Chọn địa phương** (Gia Lai hoặc Bình Định) trên thanh bên trái.
2. **Tải ảnh cây trồng** bằng cách chụp trực tiếp từ camera hoặc tải file lên.
3. **(Tùy chọn)** Nếu ảnh không rõ hoặc Vision gặp lỗi, bạn có thể **nhập tên cây trồng thủ công** trong phần mở rộng `✏️ Nhập tên cây trồng thủ công`.
4. Nhấn nút **“🚀 Kích hoạt AI Agent Phân Tích”**.
5. Hệ thống sẽ hiển thị:
   - **Nhật ký hoạt động (log)** các bước Agent thực hiện (Act → Observe → Re-plan).
   - **Khuyến nghị chiến lược cuối cùng** (bằng tiếng Việt) với các phân tích về giá, thời tiết và hành động cụ thể.

---

## ⚠️ Lưu ý khi chạy lần đầu

- **API keys**: Đảm bảo các key hợp lệ và có đủ hạn mức sử dụng .
- **Scraper**: Mặc định cào dữ liệu từ `nhabeagri.com`. Nếu trang thay đổi cấu trúc, bạn cần cập nhật selector trong `scraper_tool.py`. Nếu không lấy được dữ liệu, Agent tự động fallback về dữ liệu mẫu.
- **Xử lý lỗi Vision**: Khi Gemini bị lỗi 503 (quá tải), Agent sẽ tự động retry tối đa 3 lần với exponential backoff và chuyển sang model `gemini-1.5-flash` nếu cần. Nếu vẫn thất bại, hệ thống khuyến khích người dùng nhập tên cây thủ công.
- **Thời tiết**: Tên thành phố phải khớp với API (ví dụ: `Pleiku` thay vì `Gia Lai`; `Quy Nhon` thay vì `Bình Định`). Nếu gặp lỗi 404, hãy sửa tên trong `weather_tool.py`.

---

## 📌 Thông tin API Keys

| Dịch vụ | Nơi lấy | Ghi chú |
|---------|---------|---------|
| Gemini (Google) | [AI Studio](https://aistudio.google.com/apikey) | Dùng cho nhận diện ảnh (Vision) và sinh văn bản |
| OpenWeatherMap | [OpenWeather](https://openweathermap.org/api) | Lấy dữ liệu thời tiết hiện tại. **Lưu ý:** Tên thành phố phải khớp với tên trong API (ví dụ: `Pleiku` thay vì `Gia Lai`; `Quy Nhon` thay vì `Bình Định`). |

---

## 🧠 Cơ chế Tự chủ của Agent

- **Act → Observe → Re-plan** rõ ràng:
  1. **Act**: Gọi tool Vision, Scraper, Weather.
  2. **Observe**: Thu thập kết quả và ghi log.
  3. **Re-plan**: Nếu tool lỗi, Agent tự quyết định fallback (dùng dữ liệu mẫu, retry, hoặc yêu cầu người dùng nhập thủ công).
- Không cần người dùng can thiệp từng bước, toàn bộ quy trình diễn ra tự động.
- Khi mọi tool đều hoạt động, Agent tổng hợp thành khuyến nghị cuối cùng.


## 🎯 Đánh giá tác động thực tiễn

- **Tiết kiệm thời gian cho nông dân**: Thay vì phải tự tìm kiếm thông tin giá cả, thời tiết và chẩn đoán bệnh từ nhiều nguồn khác nhau, ứng dụng giúp tổng hợp và đưa ra khuyến nghị trong vòng chưa đầy 30 giây.
- **Hỗ trợ ra quyết định kịp thời**: Các khuyến nghị dựa trên dữ liệu thực tế, giúp nông dân đưa ra quyết định về thời điểm thu hoạch, bán hàng và biện pháp xử lý bệnh.
- **Tăng độ chính xác**: Sử dụng AI để nhận diện bệnh hại qua ảnh, giảm thiểu sai sót do quan sát bằng mắt thường.


## 📈 Kế hoạch phát triển tiếp theo

- **Mở rộng kho dữ liệu cây trồng**: Bổ sung thêm các loại cây trồng phổ biến tại khu vực Miền Trung – Tây Nguyên.
- **Tích hợp bản đồ thời tiết**: Thêm dự báo thời tiết 7 ngày tới và cảnh báo thời tiết cực đoan.
- **Kết nối với IoT**: Nhận dữ liệu từ cảm biến độ ẩm, nhiệt độ đất để đưa ra khuyến nghị tưới tiêu chính xác hơn.
- **Xây dựng mobile app**: Phát triển ứng dụng di động để nông dân có thể sử dụng dễ dàng trên điện thoại thông minh.

## 👥 Đóng góp và phát triển

Dự án được xây dựng trong khuôn khổ Hackathon AIDEV 2026. <br>Mọi ý kiến đóng góp vui lòng liên hệ qua email hoặc tạo issue trên repository (nếu có).<br>
```
HTK group email: dinhtanhuy547@gmail.com
```


## 📄 Giấy phép

Dự án sử dụng mã nguồn mở, miễn phí cho mục đích học tập và nghiên cứu.

**Chúc bạn sử dụng ứng dụng thành công!** 🌱
