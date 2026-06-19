# 🌾 MÙA VÀNG AGENT
> Hệ thống Multi-Agent cảnh báo sâu bệnh cà phê Tây Nguyên  
> **AI no1** · Powered by **Groq (Text + Vision)** + OpenWeatherMap

---

## 🚀 Chạy trong 5 phút

### 1. Clone & cài đặt
# Clone hoặc giải nén project
cd mua-vang-agent

# Tạo môi trường ảo (khuyến nghị)
python -m venv venv
source venv/bin/activate        # Linux/Mac
# hoặc: venv\Scripts\activate   # Windows

# Cài thư viện
pip install -r requirements.txt
2. Cấu hình API keys
bash
cp .env.example .env
Mở file .env và điền các key cần thiết:

Key	Mô tả	Lấy tại
GROQ_API_KEY	BẮT BUỘC – Dùng cho cả Text và Vision (Llama 3 & Vision)	console.groq.com
OPENWEATHER_API_KEY	(Tùy chọn) Dữ liệu thời tiết thực tế	openweathermap.org
⚠️ Chỉ cần GROQ_API_KEY là đủ để vận hành toàn bộ hệ thống (text + vision).
Không còn phụ thuộc vào Anthropic / Claude Vision nữa.

3. Khởi động

streamlit run app.py
Mở trình duyệt tại http://localhost:8501

🤖 Kiến trúc Multi-Agent (đã cập nhật)
text
┌─────────────────────────────────────────────────────────┐
│                   STREAMLIT FRONTEND                     │
│   • Upload ảnh (Groq Vision)                           │
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
         │    DUAL-AGENT SYSTEM      │
         │  (Groq Llama 3)           │
         │                           │
         │  Agent 1: Weather & Disease│
         │  Agent 2: Economics       │
         └─────────────┬─────────────┘
                       │
         ┌─────────────▼─────────────┐
         │  llama3-70b-8192 (Groq)   │
         │  + Vision Model           │
         │  (miễn phí, siêu nhanh)   │
         └─────────────┬─────────────┘
                       │
         ┌─────────────▼─────────────┐
         │       KẾT QUẢ             │
         │  • Cảnh báo bệnh hại      │
         │  • Dự báo kinh tế         │
         │  • Nhận diện ảnh          │
         │  • Mô phỏng Zalo Alert    │
         └───────────────────────────┘
📁 Cấu trúc Project
text
mua-vang-agent/
├── app.py                  # Ứng dụng Streamlit chính (tích hợp Groq Vision)
├── diseases.json           # Knowledge base (6 bệnh cà phê)
├── requirements.txt        # Thư viện Python
├── .env.example            # Mẫu cấu hình môi trường
└── README.md               # File này
Lưu ý: Project hiện tại không sử dụng CrewAI hay các agent phức tạp.
Thay vào đó là 2 agent đơn giản chạy tuần tự qua Groq API.

🌿 Knowledge Base: Bệnh hại Cà phê Tây Nguyên
Hệ thống tích hợp sẵn 6 bệnh phổ biến, được định nghĩa trong diseases.json:

Bệnh	Loại	Mức độ	Thiệt hại năng suất
Gỉ sắt (Coffee Leaf Rust)	Nấm	Cao	30–60%
Vàng lá (Chlorosis)	Sinh lý	Trung bình	15–30%
Đốm mắt cua (Brown Eye Spot)	Nấm	Trung bình	10–25%
Nấm hồng (Pink Disease)	Nấm	Cao	20–50%
Đốm nâu lá (Cercospora)	Nấm	Thấp	5–15%
Khô cành/Chết ngọn (Dieback)	Nấm/Côn trùng	Cao	20–40%
Mỗi bệnh bao gồm: điều kiện bùng phát (nhiệt độ, độ ẩm, mưa), triệu chứng, khuyến cáo xử lý, và tác động kinh tế.

⚙️ Yêu cầu hệ thống
Python 3.10+

RAM: 2GB+

Kết nối Internet (để gọi API Groq)

🔑 API Keys miễn phí
Service	URL	Tier miễn phí
Groq (Llama 3 + Vision)	console.groq.com	1000 req/min
OpenWeatherMap	openweathermap.org	60 req/min (không bắt buộc)
💡 Không có OpenWeatherMap key? App tự động chuyển sang dữ liệu mô phỏng.

🛠️ Troubleshooting
Lỗi use_container_width khi chạy Streamlit:

Nâng cấp Streamlit: pip install streamlit --upgrade

Hoặc sửa tham số thành use_column_width=True trong app.py.

Groq API 429 (quá giới hạn):

Chờ 1-2 phút hoặc dùng chế độ fallback (không cần key). Hệ thống tự động chuyển sang mô phỏng nếu không có key.

Lỗi nhận diện ảnh:

Đảm bảo GROQ_API_KEY có quyền dùng model llama-3.2-90b-vision-preview.

Kiểm tra định dạng ảnh (JPG, PNG, WEBP) và dung lượng < 10MB.

📊 Demo & Mở rộng
Mô phỏng Zalo Alert: Hiển thị cảnh báo dạng tin nhắn Zalo để minh họa luồng thông báo đến nông dân.

Có thể mở rộng: Thêm nhiều bệnh hơn, tích hợp dữ liệu vệ tinh, kết nối với hệ thống khuyến nông thực tế.

🌾 MÙA VÀNG AGENT · Hackathon AI for Agriculture · Vì một nền nông nghiệp Tây Nguyên thịnh vượng