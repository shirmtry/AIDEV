import streamlit as st
import os
from dotenv import load_dotenv
from agent_manager import CropDecisionAgent

load_dotenv()

st.set_page_config(page_title="🌾 AI Agent Nông Nghiệp", layout="wide")
st.title("🌾 Hệ Thống AI Agent Tư Vấn Nông Nghiệp")
st.caption("Hỗ trợ nông dân Bình Định - Gia Lai ra quyết định canh tác")

with st.sidebar:
    st.header("⚙️ Cấu Hình")
    location = st.selectbox("Chọn địa phương:", ["Gia Lai", "Bình Định"])
    st.markdown("---")
    st.header("🔔 Nhận báo cáo qua Telegram")
    telegram_id = st.text_input("Nhập Telegram Chat ID (tùy chọn)", value="")
    st.caption("Để trống nếu không muốn nhận.")
    st.markdown("---")
    st.caption("🏆 Hackathon AIDEV 2026")

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
        with st.spinner("Agent đang thu thập và phân tích dữ liệu..."):
            agent = CropDecisionAgent()
            image_bytes = img_file.getvalue() if img_file else None
            manual_crop_value = manual_crop.strip() if manual_crop else None
            telegram_id_value = telegram_id.strip() if telegram_id.strip() else None

            decision, logs = agent.run_workflow(
                image_bytes=image_bytes,
                location=location,
                manual_crop=manual_crop_value,
                user_telegram_id=telegram_id_value
            )

            st.success("✅ Quá trình hoàn tất!")
            with st.expander("📋 Nhật ký hoạt động (Act → Observe → Re-plan)"):
                st.text("\n".join(logs))

            st.markdown("---")
            st.subheader("💡 Khuyến nghị từ Agent:")
            st.markdown(decision)