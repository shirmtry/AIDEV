// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { logEvent, registerStudent, getTodayAttendance, getStudentAttendance, getStats, getVietnamTime } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ==================== PHỤC VỤ FILE TĨNH ====================
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/models', express.static(path.join(__dirname, 'models')));
app.use('/cropped', express.static(path.join(__dirname, 'database', 'cropped_faces')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ==================== TELEGRAM BOT ====================
let bot = null;
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_token_here') {
    try {
        bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
        console.log('✅ Telegram Bot đã kết nối');
        console.log('📌 Chat ID mục tiêu:', process.env.TELEGRAM_CHAT_ID || 'CHƯA CẤU HÌNH');

        // ---- LỆNH BOT ----
        bot.onText(/\/start/, (msg) => {
            bot.sendMessage(msg.chat.id, '🤖 Bot giám sát lớp học đã sẵn sàng!');
        });

        bot.onText(/\/help/, (msg) => {
            bot.sendMessage(msg.chat.id, 
                '📋 *Các lệnh:*\n' +
                '/today - Xem điểm danh hôm nay\n' +
                '/stats - Thống kê tổng quan\n' +
                '/student <id> - Xem lịch sử học sinh\n' +
                '/report - Gửi báo cáo ngay (nếu đang trong giờ học)',
                { parse_mode: 'Markdown' }
            );
        });

        bot.onText(/\/today/, async (msg) => {
            const chatId = msg.chat.id;
            try {
                const rows = await getTodayAttendance();
                let message = `📋 *ĐIỂM DANH HÔM NAY*\n\n`;
                if (rows.length === 0) {
                    message += 'Chưa có học sinh nào điểm danh.';
                } else {
                    rows.forEach((r, i) => {
                        message += `${i+1}. ${r.studentName} (${r.studentId}) - ${r.timestamp}\n`;
                    });
                }
                bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } catch (err) {
                bot.sendMessage(chatId, '❌ Lỗi truy vấn');
                console.error(err);
            }
        });

        bot.onText(/\/stats/, async (msg) => {
            const chatId = msg.chat.id;
            try {
                const stats = await getStats();
                const message = `📊 *THỐNG KÊ*\n\n` +
                               `👥 Tổng số học sinh: ${stats.totalStudents}\n` +
                               `✅ Có mặt hôm nay: ${stats.presentToday}\n` +
                               `❌ Vắng: ${stats.totalStudents - stats.presentToday}`;
                bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } catch (err) {
                bot.sendMessage(chatId, '❌ Lỗi truy vấn');
                console.error(err);
            }
        });

        bot.onText(/\/student (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const id = match[1];
            try {
                const rows = await getStudentAttendance(id);
                if (rows.length === 0) {
                    bot.sendMessage(chatId, `Không tìm thấy dữ liệu cho học sinh ${id}`);
                    return;
                }
                let message = `📝 *Lịch sử học sinh ${id}*\n\n`;
                rows.slice(0, 10).forEach((r, i) => {
                    const detail = r.details ? JSON.parse(r.details) : {};
                    let line = `${i+1}. ${r.action} ${r.timestamp}`;
                    if (r.action === 'emotion' && detail.emotion) {
                        line += ` 😊 ${detail.emotion}`;
                    }
                    message += line + '\n';
                });
                bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } catch (err) {
                bot.sendMessage(chatId, '❌ Lỗi truy vấn');
                console.error(err);
            }
        });

        bot.onText(/\/report/, async (msg) => {
            const chatId = msg.chat.id;
            try {
                await sendAttendanceReport(true);
                bot.sendMessage(chatId, '✅ Đã gửi báo cáo điểm danh.');
            } catch (err) {
                bot.sendMessage(chatId, '❌ Lỗi gửi báo cáo');
                console.error(err);
            }
        });

    } catch (err) {
        console.warn('⚠️ Không kết nối được Telegram Bot:', err.message);
    }
} else {
    console.log('⚠️ Bỏ qua Telegram Bot (thiếu token)');
}

// ==================== CẤU HÌNH ĐƯỜNG DẪN ====================
const DESCRIPTORS_FILE = path.join(__dirname, 'database', 'descriptors.json');
const STUDENT_DATA_DIR = path.join(__dirname, 'database', 'student_data');
const CROPPED_FACES_DIR = path.join(__dirname, 'database', 'cropped_faces');

if (!fs.existsSync(path.join(__dirname, 'database'))) {
    fs.mkdirSync(path.join(__dirname, 'database'), { recursive: true });
}
if (!fs.existsSync(STUDENT_DATA_DIR)) {
    fs.mkdirSync(STUDENT_DATA_DIR, { recursive: true });
}
if (!fs.existsSync(CROPPED_FACES_DIR)) {
    fs.mkdirSync(CROPPED_FACES_DIR, { recursive: true });
}
if (!fs.existsSync(DESCRIPTORS_FILE)) {
    fs.writeFileSync(DESCRIPTORS_FILE, JSON.stringify([]));
}

// ==================== HÀM ĐỌC/GHI DESCRIPTORS ====================
function loadDescriptors() {
    try {
        const data = fs.readFileSync(DESCRIPTORS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Lỗi đọc descriptors:', err);
        return [];
    }
}

function saveDescriptors(descriptors) {
    fs.writeFileSync(DESCRIPTORS_FILE, JSON.stringify(descriptors, null, 2));
}

function getStudentFolder(studentId) {
    return path.join(STUDENT_DATA_DIR, studentId);
}

function ensureStudentFolder(studentId) {
    const folder = getStudentFolder(studentId);
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
    return folder;
}

// Lưu descriptor mới (hỗ trợ nhiều descriptors)
function saveStudentDescriptor(studentId, name, descriptor) {
    const folder = ensureStudentFolder(studentId);
    const filePath = path.join(folder, 'descriptor.json');
    let data = { id: studentId, name, descriptors: [] };
    
    if (fs.existsSync(filePath)) {
        try {
            const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            data = existing;
        } catch (err) {
            console.warn(`⚠️ Lỗi đọc descriptor của ${studentId}, tạo mới`);
        }
    }
    
    if (!data.descriptors) data.descriptors = [];
    data.descriptors.push(descriptor);
    // Giữ tối đa 20 descriptors để tránh phình to
    if (data.descriptors.length > 20) {
        data.descriptors = data.descriptors.slice(-20);
    }
    data.name = name;
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    // Cập nhật descriptors.json để tương thích ngược
    const descriptors = loadDescriptors();
    const existing = descriptors.find(s => s.id === studentId);
    if (existing) {
        existing.name = name;
        existing.descriptors = data.descriptors;
    } else {
        descriptors.push({ id: studentId, name, descriptors: data.descriptors });
    }
    saveDescriptors(descriptors);
}

// Load tất cả học sinh (từ thư mục student_data)
function loadAllStudentDescriptors() {
    const allStudents = [];
    if (fs.existsSync(STUDENT_DATA_DIR)) {
        const folders = fs.readdirSync(STUDENT_DATA_DIR).filter(f => {
            const stat = fs.statSync(path.join(STUDENT_DATA_DIR, f));
            return stat.isDirectory();
        });
        for (const folder of folders) {
            const descFile = path.join(STUDENT_DATA_DIR, folder, 'descriptor.json');
            if (fs.existsSync(descFile)) {
                try {
                    const data = JSON.parse(fs.readFileSync(descFile, 'utf8'));
                    allStudents.push(data);
                } catch (err) {
                    console.warn(`⚠️ Lỗi đọc descriptor của ${folder}:`, err.message);
                }
            } else {
                console.warn(`⚠️ Không tìm thấy descriptor.json trong thư mục ${folder}`);
            }
        }
    }
    // Chỉ log khi có thay đổi (không log mỗi lần gọi)
    return allStudents;
}

// ==================== HÀM SO SÁNH (giảm threshold xuống 0.6) ====================
function euclideanDistance(arr1, arr2) {
    if (!arr1 || !arr2 || arr1.length !== arr2.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < arr1.length; i++) {
        sum += Math.pow(arr1[i] - arr2[i], 2);
    }
    return Math.sqrt(sum);
}

function findBestMatch(descriptor, threshold = 0.6) {
    let allStudents = loadAllStudentDescriptors();
    if (allStudents.length === 0) allStudents = loadDescriptors();
    
    let bestMatch = null;
    let bestDistance = Infinity;
    for (const student of allStudents) {
        const descriptors = student.descriptors || [student.descriptor];
        for (const desc of descriptors) {
            const dist = euclideanDistance(descriptor, desc);
            if (dist < bestDistance) {
                bestDistance = dist;
                bestMatch = student;
            }
        }
    }
    if (bestMatch && bestDistance < threshold) {
        return { student: bestMatch, distance: bestDistance };
    }
    return null;
}

// ==================== LƯU ĐIỂM DANH + LOG ====================
let attendance = {};
let attendanceTimestamps = {};
const currentSession = new Date().toISOString().slice(0, 10);

function updateAttendance(studentId) {
    if (!attendance[currentSession]) attendance[currentSession] = [];
    if (!attendance[currentSession].includes(studentId)) {
        attendance[currentSession].push(studentId);
        if (!attendanceTimestamps[currentSession]) {
            attendanceTimestamps[currentSession] = {};
        }
        const vietnamTime = getVietnamTime();
        attendanceTimestamps[currentSession][studentId] = vietnamTime;
        const student = loadAllStudentDescriptors().find(s => s.id === studentId);
        logEvent(studentId, student ? student.name : studentId, 'attendance', {});
    }
}

// ==================== CA HỌC & BÁO CÁO ====================
const STUDY_SESSIONS = [
    { name: 'Sáng 1', start: '07:30', end: '08:15' },
    { name: 'Sáng 2', start: '08:15', end: '09:00' },
    { name: 'Sáng 3', start: '09:10', end: '09:55' },
    { name: 'Sáng 4', start: '09:55', end: '10:40' },
    { name: 'Sáng 5', start: '10:40', end: '11:25' },
    { name: 'Chiều 1', start: '13:30', end: '14:15' },
    { name: 'Chiều 2', start: '14:15', end: '15:00' },
    { name: 'Chiều 3', start: '15:10', end: '15:55' },
    { name: 'Chiều 4', start: '15:55', end: '16:40' },
    { name: 'Chiều 5', start: '16:40', end: '17:25' },
    { name: 'Tối 1', start: '18:30', end: '19:15' },
    { name: 'Tối 2', start: '19:15', end: '20:00' },
    { name: 'Tối 3', start: '20:10', end: '20:55' },
    { name: 'Tối 4', start: '20:55', end: '21:40' },
    { name: 'Tối 5', start: '21:40', end: '22:25' },
    { name: 'Tối 6', start: '22:25', end: '23:10' },
    { name: 'Tối 7', start: '23:10', end: '23:55' }
];

function getCurrentSession() {
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    for (const session of STUDY_SESSIONS) {
        if (timeStr >= session.start && timeStr < session.end) {
            return session;
        }
    }
    return null;
}

let lastReportState = null;

async function sendAttendanceReport(force = false) {
    console.log('📤 sendAttendanceReport called, force:', force);
    if (!bot) {
        console.log('⚠️ Bot chưa kết nối, không gửi báo cáo');
        return;
    }
    const session = getCurrentSession();
    if (!session) {
        console.log('⏰ Không trong giờ học, bỏ qua báo cáo');
        return;
    }
    const allStudents = loadAllStudentDescriptors();
    if (allStudents.length === 0) {
        console.log('⚠️ Chưa có học sinh nào được đăng ký');
        return;
    }
    const present = attendance[currentSession] || [];
    const presentIds = present.slice().sort();

    if (!force && lastReportState && lastReportState.sessionName === session.name &&
        JSON.stringify(lastReportState.presentIds) === JSON.stringify(presentIds)) {
        console.log('⏭️ Không có thay đổi, bỏ qua gửi báo cáo');
        return;
    }

    const presentSet = new Set(present);
    const absent = allStudents.filter(s => !presentSet.has(s.id));

    let message = `📊 *BÁO CÁO ĐIỂM DANH CA ${session.name.toUpperCase()}*\n`;
    message += `📅 Ngày: ${currentSession}\n`;
    message += `⏰ ${session.start} - ${session.end}\n\n`;
    message += `✅ *Có mặt (${present.length}/${allStudents.length}):*\n`;
    if (present.length > 0) {
        const presentStudents = allStudents.filter(s => presentSet.has(s.id));
        message += presentStudents.map((s, i) => `${i+1}. ${s.name}`).join('\n');
    } else {
        message += '❌ Không có học sinh nào điểm danh';
    }
    message += `\n\n❌ *Vắng mặt (${absent.length}):*\n`;
    if (absent.length > 0) {
        message += absent.map((s, i) => `${i+1}. ${s.name}`).join('\n');
    } else {
        message += '🎉 Tất cả đều có mặt!';
    }

    try {
        await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        console.log(`📨 Đã gửi báo cáo điểm danh ca ${session.name}`);
        
        // Gửi ảnh của học sinh đầu tiên có mặt
        if (present.length > 0) {
            const firstStudent = allStudents.find(s => presentSet.has(s.id));
            if (firstStudent) {
                const folder = getStudentFolder(firstStudent.id);
                const files = fs.readdirSync(folder).filter(f => f.endsWith('.jpg'));
                if (files.length > 0) {
                    const latestImage = path.join(folder, files[files.length - 1]);
                    await bot.sendPhoto(process.env.TELEGRAM_CHAT_ID, latestImage, {
                        caption: `📸 Ảnh điểm danh: ${firstStudent.name} (${firstStudent.id})`
                    });
                }
            }
        }
        
        lastReportState = { sessionName: session.name, presentIds };
    } catch (err) {
        console.error('❌ Lỗi gửi báo cáo:', err.message);
        if (err.response) {
            console.error('Chi tiết lỗi Telegram:', err.response.body);
        }
    }
}

function scheduleReports() {
    setInterval(async () => {
        const now = new Date();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        if ((minutes === 5 || minutes === 25) && seconds < 5) {
            await sendAttendanceReport(false);
        }
    }, 30000);
}

// ==================== HÀM GIỚI HẠN SỐ ẢNH CROP ====================
function limitCroppedImages(studentId, maxCount = 10) {
    const folder = getStudentFolder(studentId);
    if (!fs.existsSync(folder)) return;
    const files = fs.readdirSync(folder).filter(f => f.endsWith('.jpg'));
    if (files.length <= maxCount) return;
    // Sắp xếp theo thời gian sửa đổi (cũ nhất trước)
    const sorted = files.sort((a, b) => {
        return fs.statSync(path.join(folder, a)).mtimeMs - fs.statSync(path.join(folder, b)).mtimeMs;
    });
    const toDelete = sorted.slice(0, files.length - maxCount);
    toDelete.forEach(file => {
        fs.unlinkSync(path.join(folder, file));
        console.log(`🗑️ Đã xóa ảnh cũ: ${file}`);
    });
}

// ==================== API ENDPOINTS ====================

// 1. Đăng ký học sinh
app.post('/api/register', (req, res) => {
    try {
        const { studentId, name, descriptor, croppedImage } = req.body;
        if (!studentId || !name || !descriptor) {
            return res.status(400).json({ error: 'Thiếu thông tin' });
        }
        if (!Array.isArray(descriptor) || descriptor.length !== 128) {
            return res.status(400).json({ error: 'Descriptor phải là mảng 128 số' });
        }
        const allStudents = loadAllStudentDescriptors();
        if (allStudents.find(s => s.id === studentId)) {
            return res.status(400).json({ error: `Học sinh ${studentId} đã tồn tại` });
        }
        saveStudentDescriptor(studentId, name, descriptor);
        registerStudent(studentId, name);
        
        if (croppedImage) {
            const folder = ensureStudentFolder(studentId);
            const filename = `${studentId}_${Date.now()}.jpg`;
            const filePath = path.join(folder, filename);
            const base64Data = croppedImage.replace(/^data:image\/jpeg;base64,/, '');
            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
            console.log(`📸 Đã lưu ảnh crop: ${filename}`);
            // Giới hạn số ảnh
            limitCroppedImages(studentId, 10);
        }
        
        res.json({ success: true, message: `Đã đăng ký ${name}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Nhận diện nhiều khuôn mặt (nhận cảm xúc + crop)
let lastEmotion = {};

app.post('/api/recognize-multiple', (req, res) => {
    try {
        const { descriptors, emotions, croppedImages } = req.body;
        if (!descriptors || !Array.isArray(descriptors) || descriptors.length === 0) {
            return res.status(400).json({ error: 'Yêu cầu gửi mảng descriptors' });
        }

        const results = [];
        const recognizedIds = [];
        for (let i = 0; i < descriptors.length; i++) {
            const match = findBestMatch(descriptors[i]);
            if (match) {
                const student = match.student;
                recognizedIds.push(student.id);
                // Log khoảng cách để debug
                console.log(`🔍 Nhận diện: ${student.name} (distance: ${match.distance.toFixed(4)})`);
                results.push({
                    studentId: student.id,
                    studentName: student.name,
                    distance: match.distance,
                    emotion: emotions && emotions[i] ? emotions[i] : 'neutral'
                });
            } else {
                results.push({
                    studentId: null,
                    studentName: 'Unknown',
                    distance: null,
                    emotion: emotions && emotions[i] ? emotions[i] : 'neutral'
                });
            }
        }
        
        recognizedIds.forEach((id, idx) => {
            updateAttendance(id);
            const result = results.find(r => r.studentId === id);
            if (result) {
                const emotion = result.emotion;
                const last = lastEmotion[id];
                if (last !== emotion) {
                    logEvent(id, result.studentName, 'emotion', { emotion });
                    lastEmotion[id] = emotion;
                }
                
                // Lưu ảnh crop nếu có và giới hạn số ảnh
                if (croppedImages && croppedImages[idx]) {
                    const folder = ensureStudentFolder(id);
                    const filename = `${id}_${Date.now()}.jpg`;
                    const filePath = path.join(folder, filename);
                    const base64Data = croppedImages[idx].replace(/^data:image\/jpeg;base64,/, '');
                    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                    console.log(`📸 Đã lưu ảnh crop: ${filename}`);
                    // Giới hạn số ảnh
                    limitCroppedImages(id, 10);
                    
                    const descriptor = descriptors[idx];
                    saveStudentDescriptor(id, result.studentName, descriptor);
                }
            }
        });

        res.json({ success: true, count: results.length, results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 3. Lấy điểm danh
app.get('/api/attendance', (req, res) => {
    try {
        const session = req.query.session || currentSession;
        const list = attendance[session] || [];
        const allStudents = loadAllStudentDescriptors();
        const students = list.map(id => allStudents.find(s => s.id === id)).filter(Boolean);
        res.json({ session, count: students.length, students });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Lấy danh sách học sinh
app.get('/api/students', (req, res) => {
    try {
        const all = loadAllStudentDescriptors();
        res.json(all.map(s => ({ id: s.id, name: s.name })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Cảnh báo hành vi
app.post('/api/behavior', async (req, res) => {
    try {
        const { studentId, behavior, timestamp } = req.body;
        if (!studentId || !behavior) {
            return res.status(400).json({ error: 'Thiếu studentId hoặc behavior' });
        }
        const all = loadAllStudentDescriptors();
        const student = all.find(s => s.id === studentId);
        if (!student) return res.status(404).json({ error: 'Không tìm thấy' });
        logEvent(studentId, student.name, 'behavior', { behavior });
        if (!bot) return res.json({ success: false, message: 'Bot chưa kết nối' });
        const message = `🚨 *Cảnh báo hành vi!*\n\n` +
                       `👤 Học sinh: ${student.name} (${student.id})\n` +
                       `⚠️ Hành vi: ${behavior}\n` +
                       `🕐 Thời gian: ${timestamp || new Date().toLocaleString()}`;
        await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 6. Gửi báo cáo thủ công (POST)
app.post('/api/send-report', async (req, res) => {
    try {
        await sendAttendanceReport(true);
        res.json({ success: true, message: 'Đã gửi báo cáo' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Gửi báo cáo thủ công (GET)
app.get('/api/send-report', async (req, res) => {
    try {
        await sendAttendanceReport(true);
        res.send('✅ Báo cáo đã được gửi qua Telegram!');
    } catch (err) {
        res.status(500).send('❌ Lỗi: ' + err.message);
    }
});

// 8. Xem lịch sử điểm danh của một học sinh (cũ)
app.get('/api/student/:id/attendance', (req, res) => {
    try {
        const studentId = req.params.id;
        const all = loadAllStudentDescriptors();
        const student = all.find(s => s.id === studentId);
        if (!student) return res.status(404).json({ error: 'Không tìm thấy' });
        const sessions = [];
        for (const [date, list] of Object.entries(attendance)) {
            if (list.includes(studentId)) sessions.push(date);
        }
        res.json({ student: student.name, sessions, count: sessions.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. Reset điểm danh
app.delete('/api/attendance/reset', (req, res) => {
    try {
        attendance = {};
        attendanceTimestamps = {};
        res.json({ success: true, message: 'Đã reset điểm danh' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. Lấy danh sách ảnh mẫu
app.get('/api/sample-images', (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'database');
        const files = fs.readdirSync(dbPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
        res.json({ success: true, images: files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 11. Lấy ảnh mẫu dưới dạng base64
app.get('/api/sample-image/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'database', filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        const data = fs.readFileSync(filePath);
        const base64 = data.toString('base64');
        res.json({ success: true, base64, filename });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 12. Lấy ảnh crop của học sinh
app.get('/api/student/:id/cropped', (req, res) => {
    try {
        const studentId = req.params.id;
        const folder = getStudentFolder(studentId);
        if (!fs.existsSync(folder)) {
            return res.status(404).json({ error: 'Không có ảnh crop' });
        }
        const files = fs.readdirSync(folder).filter(f => f.endsWith('.jpg'));
        if (files.length === 0) {
            return res.status(404).json({ error: 'Không có ảnh crop' });
        }
        const latestFile = files[files.length - 1];
        const filePath = path.join(folder, latestFile);
        const base64 = fs.readFileSync(filePath).toString('base64');
        res.json({ success: true, base64, filename: latestFile });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== DEBUG: Kiểm tra số học sinh ====================
app.get('/api/debug/students', (req, res) => {
    const all = loadAllStudentDescriptors();
    res.json({ count: all.length, students: all.map(s => ({ id: s.id, name: s.name, descriptors: s.descriptors ? s.descriptors.length : 0 })) });
});

// ==================== KHỞI ĐỘNG ====================
scheduleReports();

app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
    console.log(`📅 Session hôm nay: ${currentSession}`);
    console.log(`📁 File descriptors: ${DESCRIPTORS_FILE}`);
    console.log(`📁 Thư mục học sinh: ${STUDENT_DATA_DIR}`);
    console.log(`📁 Thư mục ảnh crop: ${CROPPED_FACES_DIR}`);
    console.log('✅ Đã khởi tạo lịch gửi báo cáo tự động');
});