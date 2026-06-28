// frontend/pose-detector.js
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let poseLandmarker = null;
let running = false;
let lastPoseState = {};
let stateChangeCount = 0;
const LOG_INTERVAL = 5000; // 5 giây
let lastLogTime = 0;

// Hàm khởi tạo PoseLandmarker
export async function initPoseDetector() {
    const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'CPU'
        },
        runningMode: 'VIDEO',
        numPoses: 5,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5
    });
    console.log('✅ Pose detector initialized');
}

// Hàm suy luận hành vi từ các landmark
function analyzePose(landmarks) {
    if (!landmarks || landmarks.length === 0) return { action: 'unknown', confidence: 0 };

    const lm = landmarks[0]; // lấy pose đầu tiên
    // Lấy các điểm quan trọng
    const nose = lm[0];
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];
    const leftHip = lm[23];
    const rightHip = lm[24];
    const leftKnee = lm[25];
    const rightKnee = lm[26];
    const leftAnkle = lm[27];
    const rightAnkle = lm[28];
    const leftWrist = lm[15];
    const rightWrist = lm[16];

    // Tính góc gập gối (ví dụ chân trái)
    const angleKnee = angleBetween3Points(leftHip, leftKnee, leftAnkle);

    // Xác định đứng/ngồi
    let isStanding = false;
    let isSitting = false;
    if (angleKnee > 150) {
        isStanding = true;
    } else if (angleKnee < 120 && leftHip.y > leftKnee.y) {
        isSitting = true;
    }

    // Xác định giơ tay
    let isRaisingHand = false;
    if (leftWrist.y < leftShoulder.y - 0.05 || rightWrist.y < rightShoulder.y - 0.05) {
        isRaisingHand = true;
    }

    // Xác định cúi đầu (ngủ)
    let isSleeping = false;
    if (nose.y > leftShoulder.y + 0.05) {
        isSleeping = true;
    }

    // Trả về hành vi ưu tiên
    if (isSleeping) return { action: 'sleeping', confidence: 0.8 };
    if (isRaisingHand) return { action: 'raising_hand', confidence: 0.9 };
    if (isSitting) return { action: 'sitting', confidence: 0.85 };
    if (isStanding) return { action: 'standing', confidence: 0.8 };
    return { action: 'unknown', confidence: 0.5 };
}

// Hàm tính góc giữa 3 điểm
function angleBetweenPoints(a, b, c) {
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag = Math.sqrt(v1.x * v1.x + v1.y * v1.y) * Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag === 0) return 0;
    return Math.acos(dot / mag) * 180 / Math.PI;
}

// Hàm xử lý frame
export async function detectPose(videoElement, onActionDetected) {
    if (!poseLandmarker || running) return;
    running = true;

    const processFrame = async () => {
        if (!videoElement || videoElement.paused || videoElement.ended) {
            running = false;
            return;
        }

        try {
            const results = await poseLandmarker.detectForVideo(videoElement, performance.now());
            if (results.landmarks && results.landmarks.length > 0) {
                const pose = analyzePose(results.landmarks);
                const now = Date.now();

                // Chỉ gửi log nếu trạng thái thay đổi hoặc đã qua 5s
                if (pose.action !== 'unknown') {
                    const currentKey = `${pose.action}`;
                    if (lastPoseState.action !== currentKey || (now - lastLogTime) >= LOG_INTERVAL) {
                        onActionDetected(pose);
                        lastPoseState = { action: currentKey, timestamp: now };
                        lastLogTime = now;
                    }
                }
            }
        } catch (e) {
            console.warn('Pose detection error:', e);
        }

        // Tiếp tục xử lý frame tiếp theo (requestAnimationFrame để đồng bộ với tốc độ khung hình)
        requestAnimationFrame(processFrame);
    };

    processFrame();
}