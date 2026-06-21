import streamlit as st
import os
from dotenv import load_dotenv
from agent_manager import CropDecisionAgent
from tools.weather_tool import get_current_weather, get_weather_forecast, get_forecast_data_for_chart
import matplotlib.pyplot as plt
import pandas as pd
from datetime import datetime

load_dotenv()

st.set_page_config(page_title="🌾 AI Agent Nông Nghiệp", layout="wide")
st.title("🌾 Hệ Thống AI Agent Tư Vấn Nông Nghiệp")
st.caption("Hỗ trợ nông dân Tây Nguyên - Bình Định ra quyết định canh tác")

# Sidebar
with st.sidebar:
    st.header("⚙️ Cấu Hình")
    location = st.selectbox("Chọn địa phương:", ["Gia Lai", "Bình Định", "Đắk Lắk", "Lâm Đồng", "Kon Tum"])
    st.markdown("---")
    st.header("🔔 Nhận báo cáo qua Telegram")
    telegram_id = st.text_input("Nhập Telegram Chat ID (tùy chọn)", value="")
    st.caption("Để trống nếu không muốn nhận.")
    st.markdown("---")
    st.caption("🏆 Hackathon AIDEV 2026")

def plot_forecast(forecast_data):
    if not forecast_data or not isinstance(forecast_data, list) or len(forecast_data) == 0:
        st.warning("Không có dữ liệu dự báo để vẽ biểu đồ.")
        return
    df = pd.DataFrame(forecast_data)
    df["datetime"] = pd.to_datetime(df["dt"], unit="s")
    df = df.set_index("datetime")
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(df.index, df["temp"], marker="o", label="Nhiệt độ (°C)")
    ax.set_xlabel("Thời gian")
    ax.set_ylabel("Nhiệt độ (°C)")
    ax.set_title("Dự báo nhiệt độ 5 ngày tới")
    ax.legend()
    plt.xticks(rotation=45)
    st.pyplot(fig)

# Hiển thị thời tiết & dự báo
col1, col2 = st.columns(2)
with col1:
    with st.expander("🌤️ Thời tiết hiện tại", expanded=True):
        if location:
            weather_info = get_current_weather(location)
            st.write(weather_info)
with col2:
    with st.expander("🌦️ Dự báo 5 ngày tới (biểu đồ)", expanded=True):
        if location:
            forecast_data = get_forecast_data_for_chart(location, days=5)
            if forecast_data and isinstance(forecast_data, list) and len(forecast_data) > 0:
                plot_forecast(forecast_data)
            else:
                # fallback hiển thị text
                forecast_info = get_weather_forecast(location, days=5)
                st.write(forecast_info)

st.subheader("📸 Ảnh cây trồng (không bắt buộc)")
img_file = st.camera_input("Chụp ảnh trực tiếp")
if not img_file:
    img_file = st.file_uploader("Hoặc tải ảnh lên", type=["jpg", "jpeg", "png"])
if img_file:
    st.image(img_file, caption="Ảnh đã tải", width=300)

st.subheader("✏️ Nhập tên cây trồng (khuyến nghị để có kết quả chính xác)")
manual_crop = st.text_input("Tên cây (ví dụ: cà phê, lúa, tiêu, ...)")

if st.button("🚀 Kích hoạt AI Agent", type="primary"):
    if not manual_crop and not img_file:
        st.error("Vui lòng nhập tên cây hoặc tải ảnh.")
    else:
        progress_bar = st.progress(0)
        status_text = st.empty()
        status_text.text("Đang khởi tạo Agent...")
        progress_bar.progress(10)

        agent = CropDecisionAgent()
        image_bytes = img_file.getvalue() if img_file else None
        manual_crop_value = manual_crop.strip() if manual_crop else None
        telegram_id_value = telegram_id.strip() if telegram_id.strip() else None

        with st.spinner("Agent đang thu thập và phân tích dữ liệu..."):
            progress_bar.progress(30)
            status_text.text("Đang gọi các công cụ...")
            decision, logs = agent.run_workflow(
                image_bytes=image_bytes,
                location=location,
                manual_crop=manual_crop_value,
                user_telegram_id=telegram_id_value
            )
            progress_bar.progress(100)
            status_text.text("Hoàn tất!")

        st.success("✅ Quá trình hoàn tất!")
        with st.expander("📋 Nhật ký hoạt động (Act → Observe → Re-plan)"):
            st.text("\n".join(logs))

        st.markdown("---")
        st.subheader("💡 Khuyến nghị từ Agent:")
        st.markdown(decision)

        # Lưu lịch sử
        if "history" not in st.session_state:
            st.session_state.history = []
        st.session_state.history.append({
            "time": str(datetime.now()),
            "crop": manual_crop_value or "Từ ảnh",
            "decision": decision
        })

# Hiển thị lịch sử
if "history" in st.session_state and st.session_state.history:
    with st.expander("📜 Lịch sử báo cáo"):
        for item in st.session_state.history[-5:]:
            st.write(f"**{item['time']}** - {item['crop']}")
            st.write(item['decision'][:200] + "...")