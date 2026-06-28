// frontend/script.js
const SERVER_URL = 'http://localhost:5000';
const MODEL_URL = '/models';

// DOM elements
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const statusEl = document.getElementById('status');
const attendanceList = document.getElementById('attendance-list');
const behaviorLog = document.getElementById('behavior-log');

// Modal elements
const modal = document.getElementById('registerModal');
const closeBtn = document.querySelector('.close');
const registerBtn = document.getElementById('registerBtn');
const studentName = document.getElementById('studentName');
const studentId = document.getElementById('studentId');
const imageUpload = document.getElementById('imageUpload');
const previewImage = document.getElementById('previewImage');
const registerStatus = document.getElementById('registerStatus');
const submitRegister = document.getElementById('submitRegister');

let isModelLoaded = false;
let detectionInterval = null;
const DETECTION_INTERVAL = 2000;
let autoRegisterDone = false;
let studentList = [];

// Lưu trạng thái cảm xúc tiêu cực để cảnh báo hành vi
const negativeEmotionCount = {};
const NEGATIVE_EMOTION_THRESHOLD = 5; // số lần cảm xúc tiêu cực liên tiếp
const NEGATIVE_EMOTIONS = ['angry', 'sad', 'fearful', 'disgusted'];

// -------------------- LOAD MODELS --------------------
async function loadModels() {
    statusEl.textContent = '⏳ Đang tải mô hình...';
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        isModelLoaded = true;
        statusEl.textContent = '✅ Sẵn sàng';
        statusEl.style.background = '#e8f5e9';
        statusEl.style.color = '#2e7d32';
        console.log('✅ Model loaded (bao gồm emotion)');

        await updateStudentList();
        await autoRegisterFromSamples();
        startVideo();
    } catch (err) {
        console.error(err);
        statusEl.textContent = '❌ Lỗi tải model';
        statusEl.style.background = '#ffebee';
        statusEl.style.color = '#c62828';
    }
}

async function updateStudentList() {
    try {
        const res = await fetch(`${SERVER_URL}/api/students`);
        const data = await res.json();
        studentList = data;
        console.log(`📋 Đã tải ${studentList.length} học sinh`);
    } catch (err) {
        console.error('Lỗi lấy danh sách học sinh:', err);
        studentList = [];
    }
}

// -------------------- CAMERA --------------------
async function startVideo() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720, facingMode: 'environment' }
        });
        video.srcObject = stream;
        await video.play();
        console.log('📷 Camera started');
        overlay.width = video.videoWidth || 1280;
        overlay.height = video.videoHeight || 720;
        startAutoDetection();
        updateAttendanceUI();
    } catch (err) {
        console.error(err);
        statusEl.textContent = '❌ Không thể mở camera';
        statusEl.style.background = '#ffebee';
        statusEl.style.color = '#c62828';
    }
}

function startAutoDetection() {
    if (detectionInterval) clearInterval(detectionInterval);
    detectionInterval = setInterval(async () => {
        if (!isModelLoaded || video.paused || video.ended) return;
        await detectAndRecognize();
    }, DETECTION_INTERVAL);
}

// -------------------- TIỀN XỬ LÝ ẢNH --------------------
function preprocessImage(imageSource) {
    const canvas = document.createElement('canvas');
    canvas.width = imageSource.videoWidth || imageSource.width || 1280;
    canvas.height = imageSource.videoHeight || imageSource.height || 720;
    const c = canvas.getContext('2d');
    c.drawImage(imageSource, 0, 0, canvas.width, canvas.height);

    const imageData = c.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const brightness = 25;
    const contrast = 1.3;
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128 + brightness));
        data[i+1] = Math.min(255, Math.max(0, (data[i+1] - 128) * contrast + 128 + brightness));
        data[i+2] = Math.min(255, Math.max(0, (data[i+2] - 128) * contrast + 128 + brightness));
    }
    c.putImageData(imageData, 0, 0);
    return canvas;
}

// -------------------- CROP ẢNH --------------------
function cropFace(processedCanvas, detection) {
    const box = detection.detection.box;
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    const width = Math.min(box.width, processedCanvas.width - x);
    const height = Math.min(box.height, processedCanvas.height - y);
    
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = width;
    cropCanvas.height = height;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(processedCanvas, x, y, width, height, 0, 0, width, height);
    return cropCanvas.toDataURL('image/jpeg', 0.9);
}

// -------------------- HÀM GỬI CẢNH BÁO HÀNH VI --------------------
async function sendBehaviorAlert(studentId, behavior) {
    try {
        const response = await fetch(`${SERVER_URL}/api/behavior`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, behavior })
        });
        const data = await response.json();
        if (data.success) {
            console.log(`⚠️ Đã gửi cảnh báo hành vi cho ${studentId}: ${behavior}`);
            // Cập nhật UI log
            const logEntry = document.createElement('div');
            logEntry.style.color = '#f44336';
            logEntry.textContent = `🚨 ${new Date().toLocaleTimeString()} - ${studentId}: ${behavior}`;
            behaviorLog.prepend(logEntry);
            // Giới hạn số dòng log
            while (behaviorLog.children.length > 20) {
                behaviorLog.removeChild(behaviorLog.lastChild);
            }
        }
    } catch (err) {
        console.error('Lỗi gửi cảnh báo hành vi:', err);
    }
}

// -------------------- NHẬN DIỆN --------------------
async function detectAndRecognize() {
    if (!isModelLoaded) return;

    const processedCanvas = preprocessImage(video);

    const detections = await faceapi.detectAllFaces(
        processedCanvas,
        new faceapi.TinyFaceDetectorOptions({
            inputSize: 608,
            scoreThreshold: 0.3
        })
    )
    .withFaceLandmarks()
    .withFaceDescriptors()
    .withFaceExpressions();

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (detections.length === 0) {
        // Reset trạng thái cảm xúc nếu không có ai
        for (const key in negativeEmotionCount) {
            negativeEmotionCount[key] = 0;
        }
        return;
    }

    const validDetections = detections.filter(d => {
        const box = d.detection.box;
        return box.width > 60 && box.height > 60;
    });

    if (validDetections.length === 0) {
        for (const key in negativeEmotionCount) {
            negativeEmotionCount[key] = 0;
        }
        return;
    }

    const resized = faceapi.resizeResults(validDetections, { width: overlay.width, height: overlay.height });
    faceapi.draw.drawDetections(overlay, resized);

    const descriptors = validDetections.map(d => Array.from(d.descriptor));
    const emotions = validDetections.map(d => {
        const exp = d.expressions;
        let maxScore = 0;
        let dominant = 'neutral';
        for (const [key, val] of Object.entries(exp)) {
            if (val > maxScore) {
                maxScore = val;
                dominant = key;
            }
        }
        return dominant;
    });
    const croppedImages = validDetections.map(d => cropFace(processedCanvas, d));

    // Gửi lên server
    try {
        const response = await fetch(`${SERVER_URL}/api/recognize-multiple`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descriptors, emotions, croppedImages })
        });
        const data = await response.json();
        if (data.success) {
            data.results.forEach((result, index) => {
                const box = resized[index].detection.box;
                if (result.studentId) {
                    ctx.fillStyle = '#4caf50';
                    ctx.font = 'bold 20px Arial';
                    ctx.fillText(`       ✅ ${result.studentName}`, box.x, box.y - 10);
                    ctx.font = '14px Arial';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(`😊 ${result.emotion}`, box.x, box.y + box.height + 20);

                    // ==== CẢNH BÁO HÀNH VI: theo dõi cảm xúc tiêu cực ====
                    const studentId = result.studentId;
                    const emotion = result.emotion;

                    if (NEGATIVE_EMOTIONS.includes(emotion)) {
                        if (!negativeEmotionCount[studentId]) {
                            negativeEmotionCount[studentId] = 0;
                        }
                        negativeEmotionCount[studentId]++;
                        
                        if (negativeEmotionCount[studentId] >= NEGATIVE_EMOTION_THRESHOLD) {
                            // Gửi cảnh báo
                            sendBehaviorAlert(studentId, `Cảm xúc tiêu cực kéo dài (${emotion})`);
                            negativeEmotionCount[studentId] = 0; // Reset sau khi gửi
                        }
                    } else {
                        // Nếu cảm xúc tích cực, reset bộ đếm
                        negativeEmotionCount[studentId] = 0;
                    }
                } else {
                    ctx.fillStyle = '#ff9800';
                    ctx.font = '18px Arial';
                    ctx.fillText('❓ Unknown', box.x, box.y - 10);
                }
            });
            updateAttendanceUI();
            updateStudentList();
        }
    } catch (err) {
        console.error('Lỗi gửi descriptor:', err);
    }
}

// -------------------- TỰ ĐỘNG ĐĂNG KÝ --------------------
async function autoRegisterFromSamples() {
    if (autoRegisterDone) return;
    try {
        if (studentList.length > 0) {
            console.log(`✅ Đã có ${studentList.length} học sinh. Bỏ qua auto-register.`);
            autoRegisterDone = true;
            return;
        }

        console.log('🔄 Chưa có học sinh, tự động đăng ký từ ảnh mẫu...');
        const imagesRes = await fetch(`${SERVER_URL}/api/sample-images`);
        const data = await imagesRes.json();
        if (!data.success || data.images.length === 0) {
            console.log('⚠️ Không có ảnh mẫu trong thư mục database/');
            return;
        }

        let registeredCount = 0;
        for (const fileName of data.images) {
            const name = fileName.replace(/\.[^.]+$/, '');
            console.log(`📸 Đang xử lý: ${fileName}`);

            const imgRes = await fetch(`${SERVER_URL}/api/sample-image/${fileName}`);
            const imgData = await imgRes.json();
            if (!imgData.success) {
                console.error(`❌ Không lấy được ảnh ${fileName}`);
                continue;
            }

            const img = new Image();
            img.src = `data:image/jpeg;base64,${imgData.base64}`;
            await img.decode();

            const detection = await faceapi.detectSingleFace(img)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                console.warn(`⚠️ Không tìm thấy khuôn mặt trong ${fileName}`);
                continue;
            }

            const descriptor = Array.from(detection.descriptor);
            
            const box = detection.detection.box;
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = box.width;
            cropCanvas.height = box.height;
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
            const croppedImage = cropCanvas.toDataURL('image/jpeg', 0.9);

            const registerRes = await fetch(`${SERVER_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: name, name, descriptor, croppedImage })
            });
            const result = await registerRes.json();
            if (result.success) {
                console.log(`✅ Đã đăng ký ${name}`);
                registeredCount++;
            } else {
                console.error(`❌ Lỗi đăng ký ${name}: ${result.error}`);
            }
        }
        console.log(`🎉 Hoàn tất tự động đăng ký! Đã đăng ký ${registeredCount} học sinh.`);
        autoRegisterDone = true;
        await updateStudentList();
        updateAttendanceUI();
    } catch (err) {
        console.error('Lỗi auto-register:', err);
    }
}

// -------------------- UI --------------------
async function updateAttendanceUI() {
    try {
        const res = await fetch(`${SERVER_URL}/api/attendance`);
        const data = await res.json();
        let html = '';
        if (data.students.length === 0) {
            html = '❌ Chưa có học sinh nào được điểm danh';
        } else {
            data.students.forEach(s => {
                html += `<div class="student-item">
                            <span class="name">${s.name}</span>
                            <span class="status">✅ Có mặt</span>
                        </div>`;
            });
        }
        attendanceList.innerHTML = html;
    } catch (err) {
        console.error('Lỗi lấy điểm danh:', err);
        attendanceList.innerHTML = '❌ Không thể tải điểm danh';
    }
}

// -------------------- SỰ KIỆN NÚT BẤM --------------------
document.getElementById('captureBtn').addEventListener('click', async () => {
    await detectAndRecognize();
});

document.getElementById('attendanceBtn').addEventListener('click', async () => {
    await updateAttendanceUI();
    await updateStudentList();
});

// -------------------- MODAL ĐĂNG KÝ --------------------
registerBtn.onclick = function() {
    modal.style.display = 'block';
    studentName.value = '';
    studentId.value = '';
    previewImage.style.display = 'none';
    registerStatus.textContent = '';
};

closeBtn.onclick = function() {
    modal.style.display = 'none';
};

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
};

imageUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(ev) {
            previewImage.src = ev.target.result;
            previewImage.style.display = 'block';
            registerStatus.textContent = '📸 Ảnh đã tải, đang trích xuất khuôn mặt...';
        };
        reader.readAsDataURL(file);
    }
});

submitRegister.addEventListener('click', async function() {
    const name = studentName.value.trim();
    const id = studentId.value.trim();
    const file = imageUpload.files[0];
    if (!name || !id) {
        registerStatus.textContent = '❌ Vui lòng nhập đầy đủ họ tên và mã số.';
        return;
    }
    if (!file) {
        registerStatus.textContent = '❌ Vui lòng chọn ảnh khuôn mặt.';
        return;
    }

    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();

    const detection = await faceapi.detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) {
        registerStatus.textContent = '❌ Không tìm thấy khuôn mặt trong ảnh. Vui lòng chọn ảnh khác.';
        return;
    }

    const descriptor = Array.from(detection.descriptor);
    const box = detection.detection.box;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = box.width;
    cropCanvas.height = box.height;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    const croppedImage = cropCanvas.toDataURL('image/jpeg', 0.9);

    try {
        const response = await fetch(`${SERVER_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: id, name, descriptor, croppedImage })
        });
        const data = await response.json();
        if (data.success) {
            registerStatus.textContent = `✅ Đăng ký thành công học sinh ${name} (${id})`;
            setTimeout(() => { modal.style.display = 'none'; }, 2000);
            await updateStudentList();
            updateAttendanceUI();
        } else {
            registerStatus.textContent = `❌ Lỗi: ${data.error || 'Không xác định'}`;
        }
    } catch (err) {
        console.error(err);
        registerStatus.textContent = '❌ Lỗi kết nối server.';
    }
});

loadModels();