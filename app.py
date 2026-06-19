import streamlit as st
import os
from agent_manager import CropDecisionAgent

st.set_page_config(page_title="AI Agent Giám Sát Nông Nghiệp", layout="wide")

st.title("🌾 Hệ Thống Multi-Agent Giám Sát Nông Sản Real-time")
st.caption("Ứng dụng dành riêng cho khu vực Bình Định - Gia Lai | Hackathon AIDEV 2026")

# Cấu hình vùng vị trí
location = st.sidebar.selectbox("Chọn địa phương khảo sát:", ["Gia Lai", "Bình Định"])

st.subheader("📸 Chụp ảnh hoặc Tải ảnh cây trồng")
img_file = st.camera_input("Chụp hình cây trồng trực tiếp từ thiết bị") 
# Hoặc cho phép upload file để dễ demo trên máy tính:
if not img_file:
    img_file = st.file_uploader("Hoặc tải ảnh cây trồng từ máy lên...", type=["jpg", "jpeg", "png"])

if img_file:
    st.image(img_file, caption="Ảnh nông sản đầu vào", width=300)
    
    if st.button("🚀 Kích hoạt AI Agent Phân Tích"):
        with st.spinner("Agent đang tự chủ vận hành hệ thống Tool..."):
            image_bytes = img_file.getvalue()
            
            # Gọi Agent điều phối
            agent = CropDecisionAgent()
            decision, execution_logs = agent.run_workflow(image_bytes, location=location)
            
            # Hiển thị quá trình chạy tự chủ của Agent (Để BGK chấm điểm Autonomy)
            st.success("✅ Quá trình vận hành của Agent:")
            for log in execution_logs:
                st.write(log)
                
            st.markdown("---")
            st.subheader("💡 Khuyến nghị chiến lược từ Agent:")
            st.write(decision)