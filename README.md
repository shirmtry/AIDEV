# 🌾 MÙA VÀNG AGENT
> Hệ thống Multi-Agent cảnh báo sâu bệnh cà phê Tây Nguyên  
> **Hackathon Demo** · Powered by Gemini 1.5 + CrewAI + OpenWeatherMap

---

## 🚀 Chạy trong 5 phút

### 1. Clone & cài đặt
```bash
# Clone hoặc giải nén project
cd mua-vang-agent

# Tạo môi trường ảo (khuyến nghị)
python -m venv venv
source venv/bin/activate        # Linux/Mac
# hoặc: venv\Scripts\activate   # Windows

# Cài thư viện
pip install -r requirements.txt
```

### 2. Cấu hình API keys
```bash
cp .env.example .env
```
Mở file `.env` và điền:
- `GROQ_API_KEY` → lấy miễn phí tại [https://console.groq.com](https://console.groq.com/keys)
- `OPENWEATHER_API_KEY` → đăng ký miễn phí tại [openweathermap.org](https://openweathermap.org/api)

> ⚠️ **Không có API key?** App vẫn chạy được với dữ liệu mô phỏng!

### 3. Khởi động
```bash
streamlit run app.py
```
Mở trình duyệt tại `http://localhost:8501`

---

## 🤖 Kiến trúc Multi-Agent

```
┌─────────────────────────────────────────────────────────┐
│                   STREAMLIT FRONTEND                     │
│   Input: Vị trí + Câu hỏi nông dân                     │
└──────────────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │   OpenWeatherMap API      │
         │   (Thời tiết thực tế)     │
         └─────────────┬─────────────┘
                       │
         ┌─────────────▼─────────────┐
         │   Knowledge Base          │
         │   (diseases.json)         │
         │   6 bệnh phổ biến TN     │
         └─────────────┬─────────────┘
                       │
         ┌─────────────▼─────────────┐
         │      CREWAI CREW          │
         │                           │
         │  Agent 1 → Agent 2        │
         │  (Sequential Process)     │
         └─────────────┬─────────────┘
                       │
         ┌─────────────▼─────────────┐
         │  lama-3.3-70b-versatile   │
         │                           │
         └─────────────┬─────────────┘
                       │
         ┌─────────────▼─────────────┐
         │       KẾT QUẢ             │
         │  • Cảnh báo bệnh hại      │
         │  • Dự báo kinh tế         │
         │  • Mô phỏng Zalo Alert    │
         └───────────────────────────┘
```

## 📁 Cấu trúc Project

```
mua-vang-agent/
├── app.py              # Streamlit app chính
├── diseases.json       # Knowledge base 6 bệnh cà phê
├── requirements.txt    # Thư viện Python
├── .env.example        # Mẫu cấu hình môi trường
└── README.md           # File này
```

## 🌿 Knowledge Base: Bệnh hại Cà phê

| Bệnh | Loại | Mức độ | Thiệt hại |
|------|------|--------|-----------|
| Gỉ Sắt (Rust) | Nấm | Cao | 20-80% |
| Rệp Sáp | Côn trùng | Cao | 15-50% |
| Sâu Đục Quả | Côn trùng | Rất cao | 30-80% |
| Thán Thư | Nấm | Trung bình | 10-40% |
| Vàng Lá - Thối Rễ | Nấm đất | Cao | 50-100% |
| Khô Cành - Chết Ngược | Nấm | Trung bình | 10-30% |

## ⚙️ Yêu cầu hệ thống

- Python 3.10+
- RAM: 2GB+
- Kết nối Internet (để gọi API)

## 🔑 API Keys miễn phí

| Service | URL | Tier miễn phí |
|---------|-----|---------------|
| GROQ | [console.groq.com](https://console.groq.com/keys) | 1000 req/min |
| OpenWeatherMap | [openweathermap.org](https://openweathermap.org/api) | 60 req/min |

---

## 🛠️ Troubleshooting

**Lỗi import CrewAI:**
```bash
pip install crewai==0.30.11 --upgrade
```

**OpenWeatherMap 404 (không tìm thấy địa điểm):**  
Nhập tên thành phố tiếng Anh không dấu: `Pleiku`, `Buon Ma Thuot`, `Gia Nghia`

**Gemini API 429 (quá giới hạn):**  
Chờ 1-2 phút hoặc chuyển sang dùng `gemini-1.5-flash` (nhanh hơn, ít tốn quota hơn)

---

*🌾 MÙA VÀNG AGENT · Hackathon AI for Agriculture · Vì một nền nông nghiệp Tây Nguyên thịnh vượng*
