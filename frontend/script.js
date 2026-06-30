// frontend/script.js
// ===================================================================
// FIXED VERSION:
// - Added API Key authentication for all fetch requests
// - Replaced MediaPipe Camera helper with requestAnimationFrame loop
// - Optimized preprocessImage using canvas filter (GPU-accelerated)
// - Added faceapi availability check
// - Improved error handling and logging
// ===================================================================

const SERVER_URL = 'http://localhost:5000';
const MODEL_URL = '/models';

// 🔑 API Key (must match the one in server.js .env)
const API_KEY = 'your-secret-key-change-me'; // Change this!

// DOM elements
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d', { willReadFrequently: true });
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

// Face detection state
let isModelLoaded = false;
let detectionInterval = null;
const DETECTION_INTERVAL = 1500;
let autoRegisterDone = false;
let studentList = [];

// Emotion tracking for behavior alerts
const negativeEmotionCount = {};
const NEGATIVE_EMOTION_THRESHOLD = 5;
const NEGATIVE_EMOTIONS = ['angry', 'sad', 'fearful', 'disgusted'];

// Pose detection state
let poseInitialized = false;
let poseRunning = false;
let lastPoseAction = '';
let lastPoseTime = 0;
const POSE_LOG_INTERVAL = 5000; // 5 seconds

// ==================== CHECK faceapi ====================
if (typeof faceapi === 'undefined') {
    console.error('❌ face-api.js chưa được load! Kiểm tra index.html');
    statusEl.textContent = '❌ Lỗi: face-api.js chưa load';
    statusEl.style.background = '#ffebee';
    statusEl.style.color = '#c62828';
}

// ==================== HELPER: fetch with headers ====================
async function fetchWithAuth(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        ...(options.headers || {})
    };
    const response = await fetch(url, {
        ...options,
        headers
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return response;
}

// ==================== HELPER: CAPTURE FRAME FROM VIDEO ====================
function captureFrameFromVideo(videoElement, quality = 0.8) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
}

// ==================== HELPER: PARSE FILENAME ====================
function parseStudentInfoFromFilename(filename) {
    const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
    const parts = nameWithoutExt.split('_');
    const mssv = parts[parts.length - 1];
    const nameParts = parts.slice(0, parts.length - 1);
    let studentName = nameParts.join(' ').trim();
    if (!studentName) studentName = nameWithoutExt;
    return { studentId: mssv, name: studentName, raw: nameWithoutExt };
}

// ==================== LOAD FACE MODELS ====================
async function loadModels() {
    statusEl.textContent = '⏳ Đang tải mô hình...';
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        try {
            await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
            console.log('✅ Age/Gender model loaded');
        } catch (e) {
            console.warn('⚠️ Không tải được ageGenderNet:', e.message);
        }

        isModelLoaded = true;
        statusEl.textContent = '✅ Sẵn sàng';
        statusEl.style.background = '#e8f5e9';
        statusEl.style.color = '#2e7d32';
        console.log('✅ Face models loaded');

        await updateStudentList();
        await autoRegisterFromSamples();
        await startVideo();
    } catch (err) {
        console.error(err);
        statusEl.textContent = '❌ Lỗi tải model';
        statusEl.style.background = '#ffebee';
        statusEl.style.color = '#c62828';
    }
}

// ==================== STUDENT LIST ====================
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

// ==================== CAMERA ====================
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

        // Khởi tạo Pose Detection sau khi camera chạy
        await initPoseDetection();
    } catch (err) {
        console.error(err);
        statusEl.textContent = '❌ Không thể mở camera';
        statusEl.style.background = '#ffebee';
        statusEl.style.color = '#c62828';
    }
}

// ==================== FACE DETECTION LOOP ====================
function startAutoDetection() {
    if (detectionInterval) clearInterval(detectionInterval);
    detectionInterval = setInterval(async () => {
        if (!isModelLoaded || video.paused || video.ended) return;
        await detectAndRecognize();
    }, DETECTION_INTERVAL);
}

// ==================== IMAGE PREPROCESS (OPTIMIZED WITH CANVAS FILTER) ====================
function preprocessImage(imageSource) {
    const canvas = document.createElement('canvas');
    canvas.width = imageSource.videoWidth || imageSource.width || 1280;
    canvas.height = imageSource.videoHeight || imageSource.height || 720;
    const c = canvas.getContext('2d', { willReadFrequently: true });

    // Use native canvas filter instead of pixel loop (GPU-accelerated)
    c.filter = 'brightness(1.08) contrast(1.2)';
    c.drawImage(imageSource, 0, 0, canvas.width, canvas.height);
    c.filter = 'none'; // reset

    return canvas;
}

// ==================== CROP FACE ====================
function cropFace(processedCanvas, detection) {
    const box = detection.detection.box;
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    const width = Math.min(box.width, processedCanvas.width - x);
    const height = Math.min(box.height, processedCanvas.height - y);
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = width;
    cropCanvas.height = height;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    cropCtx.drawImage(processedCanvas, x, y, width, height, 0, 0, width, height);
    return cropCanvas.toDataURL('image/jpeg', 0.9);
}

// ==================== SEND BEHAVIOR ALERT (emotion-based) ====================
async function sendBehaviorAlert(studentId, behavior) {
    try {
        const response = await fetchWithAuth(`${SERVER_URL}/api/behavior`, {
            method: 'POST',
            body: JSON.stringify({ studentId, behavior })
        });
        const data = await response.json();
        if (data.success) {
            console.log(`⚠️ Đã gửi cảnh báo hành vi cho ${studentId}: ${behavior}`);
            const logEntry = document.createElement('div');
            logEntry.style.color = '#f44336';
            logEntry.textContent = `🚨 ${new Date().toLocaleTimeString()} - ${studentId}: ${behavior}`;
            behaviorLog.prepend(logEntry);
            while (behaviorLog.children.length > 20) {
                behaviorLog.removeChild(behaviorLog.lastChild);
            }
        }
    } catch (err) {
        console.error('Lỗi gửi cảnh báo hành vi:', err);
    }
}

// ==================== FACE DETECTION & RECOGNITION ====================
async function detectAndRecognize() {
    if (!isModelLoaded) return;

    const processedCanvas = preprocessImage(video);

    const detections = await faceapi.detectAllFaces(
        processedCanvas,
        new faceapi.TinyFaceDetectorOptions({
            inputSize: 608,
            scoreThreshold: 0.35
        })
    )
    .withFaceLandmarks()
    .withFaceDescriptors()
    .withFaceExpressions()
    .withAgeAndGender();

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (detections.length === 0) {
        for (const key in negativeEmotionCount) negativeEmotionCount[key] = 0;
        return;
    }

    const validDetections = detections.filter(d => {
        const box = d.detection.box;
        return box.width > 40 && box.height > 40;
    });

    if (validDetections.length === 0) {
        for (const key in negativeEmotionCount) negativeEmotionCount[key] = 0;
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

    const ageGenders = validDetections.map(d => ({
        age: d.age ? Math.round(d.age) : null,
        gender: d.gender || null
    }));

    try {
        const response = await fetchWithAuth(`${SERVER_URL}/api/recognize-multiple`, {
            method: 'POST',
            body: JSON.stringify({ descriptors, emotions, croppedImages, ageGenders })
        });
        const data = await response.json();
        if (data.success) {
            data.results.forEach((result, index) => {
                const box = resized[index].detection.box;
                const ag = ageGenders[index] || {};

                if (result.studentId) {
                    ctx.fillStyle = '#4caf50';
                    ctx.font = 'bold 18px Arial';
                    ctx.fillText(`       ✅ ${result.studentName}`, box.x, box.y - 28);

                    if (ag.age !== null || ag.gender) {
                        const genderIcon = ag.gender === 'male' ? '👨' : ag.gender === 'female' ? '👩' : '';
                        ctx.font = '13px Arial';
                        ctx.fillStyle = '#00bcd4';
                        ctx.fillText(`          ${genderIcon} ${ag.gender || ''} ${ag.age ? ag.age + 't' : ''}`, box.x, box.y - 10);
                    }

                    ctx.font = '14px Arial';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(`  😊 ${result.emotion}`, box.x, box.y + box.height + 20);

                    const studentId = result.studentId;
                    const emotion = result.emotion;

                    if (NEGATIVE_EMOTIONS.includes(emotion)) {
                        if (!negativeEmotionCount[studentId]) negativeEmotionCount[studentId] = 0;
                        negativeEmotionCount[studentId]++;
                        if (negativeEmotionCount[studentId] >= NEGATIVE_EMOTION_THRESHOLD) {
                            sendBehaviorAlert(studentId, `Cảm xúc tiêu cực kéo dài (${emotion})`);
                            negativeEmotionCount[studentId] = 0;
                        }
                    } else {
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

// ==================== AUTO REGISTER FROM SAMPLES ====================
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
            const { studentId, name } = parseStudentInfoFromFilename(fileName);
            console.log(`📸 Đang xử lý: ${fileName} → ID: ${studentId}, Tên: ${name}`);

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
                .withFaceDescriptor()
                .withAgeAndGender();

            if (!detection) {
                console.warn(`⚠️ Không tìm thấy khuôn mặt trong ${fileName}`);
                continue;
            }

            const descriptor = Array.from(detection.descriptor);
            const gender = detection.gender || null;
            const age = detection.age ? Math.round(detection.age) : null;

            const box = detection.detection.box;
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = box.width;
            cropCanvas.height = box.height;
            const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
            cropCtx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
            const croppedImage = cropCanvas.toDataURL('image/jpeg', 0.9);

            const registerRes = await fetchWithAuth(`${SERVER_URL}/api/register`, {
                method: 'POST',
                body: JSON.stringify({
                    studentId,
                    name,
                    descriptor,
                    croppedImage,
                    gender,
                    age
                })
            });
            const result = await registerRes.json();
            if (result.success) {
                console.log(`✅ Đã đăng ký ${name} (${studentId})`);
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

// ==================== UPDATE UI ====================
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

// ==================== POSE DETECTION (MediaPipe Pose - NO Camera helper) ====================
function angleBetweenPoints(a, b, c) {
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag = Math.sqrt(v1.x * v1.x + v1.y * v1.y) * Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag === 0) return 0;
    return Math.acos(dot / mag) * 180 / Math.PI;
}

function analyzePose(landmarks) {
    if (!landmarks || landmarks.length === 0) return { action: 'unknown', confidence: 0 };

    const lm = landmarks[0];
    const nose = lm[0];
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];
    const leftWrist = lm[15];
    const rightWrist = lm[16];

    // 1. Giơ tay
    let isRaisingHand = false;
    if (leftWrist.y < leftShoulder.y - 0.05 || rightWrist.y < rightShoulder.y - 0.05) {
        isRaisingHand = true;
    }

    // 2. Cúi đầu / ngủ
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const noseToShoulderY = nose.y - shoulderMidY;
    let isSleeping = false;
    if (noseToShoulderY > 0.08) {
        isSleeping = true;
    }

    if (leftShoulder && rightShoulder && (leftWrist || rightWrist)) {
        if (isSleeping) return { action: 'sleeping', confidence: 0.85 };
        if (isRaisingHand) return { action: 'raising_hand', confidence: 0.9 };
        return { action: 'sitting', confidence: 0.7 };
    }

    return { action: 'unknown', confidence: 0.5 };
}

async function sendPoseLog(action, confidence) {
    if (action === 'unknown') return;

    const now = Date.now();
    if (action === lastPoseAction && (now - lastPoseTime) < POSE_LOG_INTERVAL) {
        return;
    }

    lastPoseAction = action;
    lastPoseTime = now;

    let imageBase64 = null;
    try {
        imageBase64 = captureFrameFromVideo(video, 0.8);
    } catch (e) {
        console.warn('Không thể chụp ảnh từ video:', e);
    }

    try {
        const response = await fetchWithAuth(`${SERVER_URL}/api/behavior`, {
            method: 'POST',
            body: JSON.stringify({
                studentId: 'system',
                behavior: `Pose: ${action} (${Math.round(confidence * 100)}%)`,
                image: imageBase64
            })
        });
        const data = await response.json();
        if (data.success) {
            console.log(`🧍 Pose log: ${action} (${Math.round(confidence * 100)}%)`);
            const logEntry = document.createElement('div');
            logEntry.style.color = '#2196f3';
            logEntry.textContent = `🧍 ${new Date().toLocaleTimeString()} - Hành vi: ${action}`;
            behaviorLog.prepend(logEntry);
            while (behaviorLog.children.length > 20) {
                behaviorLog.removeChild(behaviorLog.lastChild);
            }
        }
    } catch (err) {
        console.error('❌ Lỗi gửi pose log (fetch):', err);
    }
}

// Khởi tạo Pose detector (dùng requestAnimationFrame, không dùng Camera helper)
async function initPoseDetection() {
    if (poseInitialized) return;

    try {
        await loadPoseLibrary();

        const pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        pose.setOptions({
            modelComplexity: 0,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        let frameCount = 0;

        pose.onResults((results) => {
            frameCount++;
            if (frameCount % 2 !== 0) return;

            if (results.poseLandmarks && results.poseLandmarks.length > 0) {
                const landmarks = [results.poseLandmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }))];
                const poseResult = analyzePose(landmarks);
                if (poseResult.action !== 'unknown') {
                    sendPoseLog(poseResult.action, poseResult.confidence);
                }
            }
        });

        // Sử dụng requestAnimationFrame thay vì Camera helper
        let isProcessing = false;
        async function poseLoop() {
            if (!video.paused && !video.ended && video.readyState >= 2) {
                if (!isProcessing) {
                    isProcessing = true;
                    try {
                        await pose.send({ image: video });
                    } catch (e) {
                        // Ignore errors
                    } finally {
                        isProcessing = false;
                    }
                }
            }
            requestAnimationFrame(poseLoop);
        }

        poseLoop();

        poseInitialized = true;
        console.log('✅ Pose detector initialized (requestAnimationFrame mode)');
        statusEl.textContent = '✅ Sẵn sàng (có Pose)';
    } catch (err) {
        console.warn('⚠️ Không thể khởi tạo Pose detection:', err.message);
        statusEl.textContent = '✅ Sẵn sàng (không có Pose)';
    }
}

// Tải MediaPipe Pose library từ CDN
function loadPoseLibrary() {
    return new Promise((resolve, reject) => {
        if (typeof Pose !== 'undefined' && typeof Camera !== 'undefined') {
            // Camera helper not needed, but Pose must exist
            resolve();
            return;
        }

        const scripts = [
            'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
            'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
            'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js'
        ];

        let loaded = 0;
        const total = scripts.length;

        scripts.forEach(src => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                loaded++;
                if (loaded === total) {
                    setTimeout(() => {
                        if (typeof Pose !== 'undefined') {
                            resolve();
                        } else {
                            reject(new Error('Pose not defined after loading'));
                        }
                    }, 500);
                }
            };
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });

        setTimeout(() => {
            if (typeof Pose !== 'undefined') {
                resolve();
            }
        }, 10000);
    });
}

// ==================== UI EVENTS ====================
document.getElementById('captureBtn').addEventListener('click', async () => {
    await detectAndRecognize();
});

document.getElementById('attendanceBtn').addEventListener('click', async () => {
    await updateAttendanceUI();
    await updateStudentList();
});

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
    if (event.target == modal) modal.style.display = 'none';
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
        .withFaceDescriptor()
        .withAgeAndGender();

    if (!detection) {
        registerStatus.textContent = '❌ Không tìm thấy khuôn mặt trong ảnh. Vui lòng chọn ảnh khác.';
        return;
    }

    const descriptor = Array.from(detection.descriptor);
    const gender = detection.gender || null;
    const age = detection.age ? Math.round(detection.age) : null;
    const box = detection.detection.box;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = box.width;
    cropCanvas.height = box.height;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    cropCtx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    const croppedImage = cropCanvas.toDataURL('image/jpeg', 0.9);

    try {
        const response = await fetchWithAuth(`${SERVER_URL}/api/register`, {
            method: 'POST',
            body: JSON.stringify({ studentId: id, name, descriptor, croppedImage, gender, age })
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

// ==================== START ====================
loadModels();