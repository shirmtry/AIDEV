# 🌾 MÙA VÀNG AGENT
> Hệ thống Multi-Agent cảnh báo sâu bệnh cà phê Tây Nguyên  
> **Hackathon Demo** · Powered by Groq Llama + CrewAI + Claude Vision + OpenWeatherMap

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
Mở file `.env` và điền các key cần thiết:

| Key | Mô tả | Lấy tại |
|-----|-------|---------|
| `GROQ_API_KEY` | Dùng cho CrewAI agents (Llama 3) | [console.groq.com](https://console.groq.com/keys) |
| `OPENWEATHER_API_KEY` | Dữ liệu thời tiết thực tế | [openweathermap.org](https://openweathermap.org/api) |
| `ANTHROPIC_API_KEY` | *(Tùy chọn)* Phân tích ảnh bằng Claude Vision | [console.anthropic.com](https://console.anthropic.com/) |

> ⚠️ **Không có API key?** App vẫn chạy được với dữ liệu mô phỏng (weather mock, fallback report)!

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
│   • Upload ảnh (Claude Vision)                         │
│   • Nhập vị trí & câu hỏi                              │
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
         │  (Sequential Process)     │
         │                           │
         │  Agent 1: Disease Spec.   │
         │  Agent 2: Agri Advisor    │
         │  Agent 3: Economic Analyst│
         └─────────────┬─────────────┘
                       │
         ┌─────────────▼─────────────┐
         │  llama3-70b-8192 (Groq)   │
         │  (miễn phí, siêu nhanh)   │
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
├── app.py                  # Streamlit app chính (có tích hợp Vision)
├── ai/
│   ├── classifier.py       # HuggingFace / Claude Vision backend
│   ├── disease_mapper.py   # Tra cứu knowledge base
│   ├── risk_engine.py      # Tính điểm rủi ro dựa trên thời tiết
│   └── agents.py           # CrewAI manager (Groq)
├── data/
│   └── diseases.json       # Knowledge base 6 bệnh cà phê
├── models/
│   └── plant_disease_model/ # (Tùy chọn) model HuggingFace
├── requirements.txt        # Thư viện Python
├── .env.example            # Mẫu cấu hình môi trường
└── README.md               # File này
```

## 🌿 Knowledge Base: Bệnh hại Cà phê Tây Nguyên

Hệ thống tích hợp sẵn 6 bệnh phổ biến, được định nghĩa trong `diseases.json`:

| Bệnh | Loại | Mức độ | Thiệt hại năng suất |
|------|------|--------|---------------------|
| Gỉ sắt (Coffee Leaf Rust) | Nấm | Cao | 30–60% |
| Vàng lá (Chlorosis) | Sinh lý | Trung bình | 15–30% |
| Đốm mắt cua (Brown Eye Spot) | Nấm | Trung bình | 10–25% |
| Nấm hồng (Pink Disease) | Nấm | Cao | 20–50% |
| Đốm nâu lá (Cercospora) | Nấm | Thấp | 5–15% |
| Khô cành/Chết ngọn (Dieback) | Nấm/Côn trùng | Cao | 20–40% |

Mỗi bệnh bao gồm: điều kiện bùng phát (nhiệt độ, độ ẩm, mưa), triệu chứng, khuyến cáo xử lý, và tác động kinh tế.

## ⚙️ Yêu cầu hệ thống

- Python 3.10+
- RAM: 2GB+
- Kết nối Internet (để gọi API)

## 🔑 API Keys miễn phí

| Service | URL | Tier miễn phí |
|---------|-----|---------------|
| Groq (Llama 3) | [console.groq.com](https://console.groq.com/keys) | 1000 req/min |
| OpenWeatherMap | [openweathermap.org](https://openweathermap.org/api) | 60 req/min |
| Anthropic Claude | [console.anthropic.com](https://console.anthropic.com/) | Credit $5 (dùng thử) |

> 💡 **Mẹo:** Nếu không có Anthropic key, tính năng nhận diện ảnh sẽ bị tắt nhưng các agent vẫn hoạt động bình thường.

---

## 🛠️ Troubleshooting

**Lỗi import CrewAI:**
```bash
pip install crewai==0.30.11 --upgrade
```

**Lỗi thiếu `langchain_groq`:**
```bash
pip install langchain-groq
```

**OpenWeatherMap 404 (không tìm thấy địa điểm):**  
Nhập tên thành phố tiếng Anh không dấu: `Pleiku`, `Buon Ma Thuot`, `Gia Nghia`

**Groq API 429 (quá giới hạn):**  
Chờ 1-2 phút hoặc dùng fallback (không cần key). Hệ thống tự động chuyển sang chế độ mô phỏng.

**Claude Vision không hoạt động:**  
- Kiểm tra `ANTHROPIC_API_KEY` trong `.env`
- Đảm bảo đã cài `anthropic` (phiên bản >=0.18.0)
- Nếu vẫn lỗi, app vẫn chạy nhưng không phân tích ảnh.

## 📊 Demo & Mở rộng

- **Mô phỏng Zalo Alert:** Hiển thị cảnh báo dạng tin nhắn Zalo để minh họa luồng thông báo đến nông dân.
- **Có thể mở rộng:** Thêm nhiều bệnh hơn, tích hợp dữ liệu vệ tinh, hoặc kết nối với hệ thống khuyến nông thực tế.

---

*🌾 MÙA VÀNG AGENT · Hackathon AI for Agriculture · Vì một nền nông nghiệp Tây Nguyên thịnh vượng*