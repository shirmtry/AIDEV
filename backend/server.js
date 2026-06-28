// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { logEvent, registerStudent, getTodayAttendance, getStudentAttendance, getStats, getVietnamTime } = require('./db');

// Part 5 & 6: Optional dependencies (graceful fallback if not installed)
let PDFDocument = null;
let ExcelJS = null;
let sheetsService = null;

try { PDFDocument = require('pdfkit'); } catch (e) { console.warn('⚠️ pdfkit chưa cài: npm install pdfkit'); }
try { ExcelJS = require('exceljs'); } catch (e) { console.warn('⚠️ exceljs chưa cài: npm install exceljs'); }
try { sheetsService = require('./services/googleSheets'); } catch (e) { console.warn('⚠️ Google Sheets service chưa sẵn sàng'); }

const app = express();
const PORT = process.env.PORT || 5000;

// ==================== RATE LIMITING (Part 4) ====================
const requestCounts = {}; // { 'ip:endpoint': { count, resetAt } }

function rateLimit(maxRequests, windowMs) {
    return (req, res, next) => {
        const key = `${req.ip}:${req.path}`;
        const now = Date.now();
        if (!requestCounts[key] || now > requestCounts[key].resetAt) {
            requestCounts[key] = { count: 1, resetAt: now + windowMs };
            return next();
        }
        requestCounts[key].count++;
        if (requestCounts[key].count > maxRequests) {
            return res.status(429).json({ error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' });
        }
        next();
    };
}

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

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

// ==================== TELEGRAM BOT ====================
let bot = null;
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_token_here') {
    try {
        bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
        console.log('✅ Telegram Bot đã kết nối');
        console.log('📌 Chat ID mục tiêu:', process.env.TELEGRAM_CHAT_ID || 'CHƯA CẤU HÌNH');

        bot.onText(/\/start/, (msg) => {
            bot.sendMessage(msg.chat.id, '🤖 Bot giám sát lớp học đã sẵn sàng!');
        });

        bot.onText(/\/help/, (msg) => {
            bot.sendMessage(msg.chat.id,
                '📋 *Các lệnh:*\n' +
                '/today - Xem điểm danh hôm nay\n' +
                '/stats - Thống kê tổng quan\n' +
                '/student <id> - Xem lịch sử học sinh\n' +
                '/emotion <id> - Xem cảm xúc học sinh hôm nay\n' +
                '/classemotion - Tổng hợp cảm xúc lớp hôm nay\n' +
                '/report - Gửi báo cáo ngay',
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
                    if (r.action === 'emotion' && detail.emotion) line += ` 😊 ${detail.emotion}`;
                    message += line + '\n';
                });
                bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } catch (err) {
                bot.sendMessage(chatId, '❌ Lỗi truy vấn');
            }
        });

        // Part 3: Lệnh xem cảm xúc học sinh
        bot.onText(/\/emotion (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const id = match[1].trim();
            try {
                const stats = await getEmotionStats(id);
                if (!stats || stats.length === 0) {
                    bot.sendMessage(chatId, `Không có dữ liệu cảm xúc cho học sinh ${id} hôm nay.`);
                    return;
                }
                let message = `😊 *Cảm xúc học sinh ${id} hôm nay:*\n\n`;
                stats.forEach(s => {
                    const bar = '▓'.repeat(Math.round(s.count / stats.reduce((a, b) => a + b.count, 0) * 10));
                    message += `${s.emotion}: ${bar} (${s.count} lần)\n`;
                });
                bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } catch (err) {
                bot.sendMessage(chatId, '❌ Lỗi truy vấn');
            }
        });

        // Part 3: Lệnh xem cảm xúc toàn lớp
        bot.onText(/\/classemotion/, async (msg) => {
            const chatId = msg.chat.id;
            try {
                const stats = await getClassEmotionStats();
                if (!stats || stats.length === 0) {
                    bot.sendMessage(chatId, 'Chưa có dữ liệu cảm xúc lớp hôm nay.');
                    return;
                }
                let message = `😊 *Tổng hợp cảm xúc lớp hôm nay:*\n\n`;
                const total = stats.reduce((a, b) => a + b.count, 0);
                stats.forEach(s => {
                    const pct = Math.round(s.count / total * 100);
                    const bar = '▓'.repeat(Math.round(pct / 10));
                    message += `${s.emotion}: ${bar} ${pct}% (${s.count} lần)\n`;
                });
                bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } catch (err) {
                bot.sendMessage(chatId, '❌ Lỗi truy vấn');
            }
        });

        bot.onText(/\/report/, async (msg) => {
            const chatId = msg.chat.id;
            try {
                await sendAttendanceReport(true);
                bot.sendMessage(chatId, '✅ Đã gửi báo cáo điểm danh.');
            } catch (err) {
                bot.sendMessage(chatId, '❌ Lỗi gửi báo cáo');
            }
        });

        bot.onText(/\/dashboard/, (msg) => {
            const host = process.env.SERVER_HOST || `http://localhost:${PORT}`;
            bot.sendMessage(msg.chat.id,
                `📊 *Dashboard giám sát lớp học*\n\n🔗 ${host}/dashboard`,
                { parse_mode: 'Markdown' }
            );
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

[path.join(__dirname, 'database'), STUDENT_DATA_DIR, CROPPED_FACES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(DESCRIPTORS_FILE)) fs.writeFileSync(DESCRIPTORS_FILE, JSON.stringify([]));

// ==================== HÀM ĐỌC/GHI DESCRIPTORS ====================
function loadDescriptors() {
    try {
        return JSON.parse(fs.readFileSync(DESCRIPTORS_FILE, 'utf8'));
    } catch (err) {
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
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    return folder;
}

function saveStudentDescriptor(studentId, name, descriptor) {
    const folder = ensureStudentFolder(studentId);
    const filePath = path.join(folder, 'descriptor.json');
    let data = { id: studentId, name, descriptors: [] };
    if (fs.existsSync(filePath)) {
        try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) {}
    }
    if (!data.descriptors) data.descriptors = [];
    data.descriptors.push(descriptor);
    if (data.descriptors.length > 20) data.descriptors = data.descriptors.slice(-20);
    data.name = name;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    const descriptors = loadDescriptors();
    const existing = descriptors.find(s => s.id === studentId);
    if (existing) { existing.name = name; existing.descriptors = data.descriptors; }
    else descriptors.push({ id: studentId, name, descriptors: data.descriptors });
    saveDescriptors(descriptors);
}

function loadAllStudentDescriptors() {
    const allStudents = [];
    if (fs.existsSync(STUDENT_DATA_DIR)) {
        const folders = fs.readdirSync(STUDENT_DATA_DIR).filter(f =>
            fs.statSync(path.join(STUDENT_DATA_DIR, f)).isDirectory()
        );
        for (const folder of folders) {
            const descFile = path.join(STUDENT_DATA_DIR, folder, 'descriptor.json');
            if (fs.existsSync(descFile)) {
                try { allStudents.push(JSON.parse(fs.readFileSync(descFile, 'utf8'))); }
                catch (e) { console.warn(`⚠️ Lỗi đọc descriptor ${folder}`); }
            }
        }
    }
    return allStudents;
}

// ==================== SO SÁNH DESCRIPTOR ====================
function euclideanDistance(arr1, arr2) {
    if (!arr1 || !arr2 || arr1.length !== arr2.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < arr1.length; i++) sum += (arr1[i] - arr2[i]) ** 2;
    return Math.sqrt(sum);
}

function findBestMatch(descriptor, threshold = 0.6) {
    let allStudents = loadAllStudentDescriptors();
    if (allStudents.length === 0) allStudents = loadDescriptors();
    let bestMatch = null, bestDistance = Infinity;
    for (const student of allStudents) {
        const descs = student.descriptors || [student.descriptor];
        for (const desc of descs) {
            const dist = euclideanDistance(descriptor, desc);
            if (dist < bestDistance) { bestDistance = dist; bestMatch = student; }
        }
    }
    return bestMatch && bestDistance < threshold ? { student: bestMatch, distance: bestDistance } : null;
}

// ==================== ĐIỂM DANH ====================
let attendance = {};
let attendanceTimestamps = {};
const currentSession = new Date().toISOString().slice(0, 10);

function updateAttendance(studentId) {
    if (!attendance[currentSession]) attendance[currentSession] = [];
    if (!attendance[currentSession].includes(studentId)) {
        attendance[currentSession].push(studentId);
        if (!attendanceTimestamps[currentSession]) attendanceTimestamps[currentSession] = {};
        attendanceTimestamps[currentSession][studentId] = getVietnamTime();
        const student = loadAllStudentDescriptors().find(s => s.id === studentId);
        logEvent(studentId, student ? student.name : studentId, 'attendance', {});
    }
}

// ==================== EMOTION STATS (Part 3) ====================
const { db } = require('./db');

function getEmotionStats(studentId) {
    return new Promise((resolve, reject) => {
        const today = new Date().toISOString().slice(0, 10);
        db.all(`
            SELECT json_extract(details, '$.emotion') as emotion, COUNT(*) as count
            FROM events
            WHERE studentId = ? AND action = 'emotion' AND date(timestamp) = ?
            GROUP BY emotion
            ORDER BY count DESC
        `, [studentId, today], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getClassEmotionStats() {
    return new Promise((resolve, reject) => {
        const today = new Date().toISOString().slice(0, 10);
        db.all(`
            SELECT json_extract(details, '$.emotion') as emotion, COUNT(*) as count
            FROM events
            WHERE action = 'emotion' AND date(timestamp) = ?
            GROUP BY emotion
            ORDER BY count DESC
        `, [today], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
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
    return STUDY_SESSIONS.find(s => timeStr >= s.start && timeStr < s.end) || null;
}

let lastReportState = null;

async function sendAttendanceReport(force = false) {
    if (!bot) return;
    const session = getCurrentSession();
    if (!session) { console.log('⏰ Không trong giờ học'); return; }
    const allStudents = loadAllStudentDescriptors();
    if (allStudents.length === 0) return;
    const present = attendance[currentSession] || [];
    const presentIds = present.slice().sort();

    if (!force && lastReportState &&
        lastReportState.sessionName === session.name &&
        JSON.stringify(lastReportState.presentIds) === JSON.stringify(presentIds)) {
        return;
    }

    const presentSet = new Set(present);
    const absent = allStudents.filter(s => !presentSet.has(s.id));
    let message = `📊 *BÁO CÁO ĐIỂM DANH CA ${session.name.toUpperCase()}*\n`;
    message += `📅 Ngày: ${currentSession}\n⏰ ${session.start} - ${session.end}\n\n`;
    message += `✅ *Có mặt (${present.length}/${allStudents.length}):*\n`;
    if (present.length > 0) {
        message += allStudents.filter(s => presentSet.has(s.id)).map((s, i) => `${i+1}. ${s.name}`).join('\n');
    } else {
        message += '❌ Không có học sinh nào điểm danh';
    }
    message += `\n\n❌ *Vắng mặt (${absent.length}):*\n`;
    message += absent.length > 0 ? absent.map((s, i) => `${i+1}. ${s.name}`).join('\n') : '🎉 Tất cả đều có mặt!';

    try {
        await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        console.log(`📨 Đã gửi báo cáo ca ${session.name}`);
        if (present.length > 0) {
            const firstStudent = allStudents.find(s => presentSet.has(s.id));
            if (firstStudent) {
                const folder = getStudentFolder(firstStudent.id);
                if (fs.existsSync(folder)) {
                    const files = fs.readdirSync(folder).filter(f => f.endsWith('.jpg'));
                    if (files.length > 0) {
                        await bot.sendPhoto(process.env.TELEGRAM_CHAT_ID,
                            path.join(folder, files[files.length - 1]),
                            { caption: `📸 Ảnh điểm danh: ${firstStudent.name} (${firstStudent.id})` }
                        );
                    }
                }
            }
        }
        lastReportState = { sessionName: session.name, presentIds };
    } catch (err) {
        console.error('❌ Lỗi gửi báo cáo:', err.message);
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

function limitCroppedImages(studentId, maxCount = 10) {
    const folder = getStudentFolder(studentId);
    if (!fs.existsSync(folder)) return;
    const files = fs.readdirSync(folder).filter(f => f.endsWith('.jpg'));
    if (files.length <= maxCount) return;
    const sorted = files.sort((a, b) =>
        fs.statSync(path.join(folder, a)).mtimeMs - fs.statSync(path.join(folder, b)).mtimeMs
    );
    sorted.slice(0, files.length - maxCount).forEach(file => {
        fs.unlinkSync(path.join(folder, file));
    });
}

// ==================== API ENDPOINTS ====================

// 1. Đăng ký học sinh
app.post('/api/register', rateLimit(10, 60000), (req, res) => {
    try {
        const { studentId, name, descriptor, croppedImage } = req.body;
        if (!studentId || !name || !descriptor) return res.status(400).json({ error: 'Thiếu thông tin' });
        if (!Array.isArray(descriptor) || descriptor.length !== 128) {
            return res.status(400).json({ error: 'Descriptor phải là mảng 128 số' });
        }
        if (loadAllStudentDescriptors().find(s => s.id === studentId)) {
            return res.status(400).json({ error: `Học sinh ${studentId} đã tồn tại` });
        }
        saveStudentDescriptor(studentId, name, descriptor);
        registerStudent(studentId, name);
        if (croppedImage) {
            const folder = ensureStudentFolder(studentId);
            const base64Data = croppedImage.replace(/^data:image\/jpeg;base64,/, '');
            fs.writeFileSync(path.join(folder, `${studentId}_${Date.now()}.jpg`), Buffer.from(base64Data, 'base64'));
            limitCroppedImages(studentId, 10);
        }
        res.json({ success: true, message: `Đã đăng ký ${name}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Nhận diện nhiều khuôn mặt — hỗ trợ age/gender (Part 2)
let lastEmotion = {};

app.post('/api/recognize-multiple', rateLimit(100, 60000), (req, res) => {
    try {
        const { descriptors, emotions, croppedImages, ageGenders } = req.body;
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
                results.push({
                    studentId: student.id,
                    studentName: student.name,
                    distance: match.distance,
                    emotion: emotions && emotions[i] ? emotions[i] : 'neutral',
                    age: ageGenders && ageGenders[i] ? ageGenders[i].age : null,
                    gender: ageGenders && ageGenders[i] ? ageGenders[i].gender : null
                });
            } else {
                results.push({
                    studentId: null,
                    studentName: 'Unknown',
                    distance: null,
                    emotion: emotions && emotions[i] ? emotions[i] : 'neutral',
                    age: null,
                    gender: null
                });
            }
        }

        recognizedIds.forEach((id, idx) => {
            updateAttendance(id);
            const result = results.find(r => r.studentId === id);
            if (result) {
                // Log cảm xúc khi thay đổi
                if (lastEmotion[id] !== result.emotion) {
                    logEvent(id, result.studentName, 'emotion', {
                        emotion: result.emotion,
                        age: result.age,
                        gender: result.gender
                    });
                    lastEmotion[id] = result.emotion;
                }
                // Lưu ảnh crop và cập nhật descriptor
                if (croppedImages && croppedImages[idx]) {
                    const folder = ensureStudentFolder(id);
                    const base64Data = croppedImages[idx].replace(/^data:image\/jpeg;base64,/, '');
                    fs.writeFileSync(
                        path.join(folder, `${id}_${Date.now()}.jpg`),
                        Buffer.from(base64Data, 'base64')
                    );
                    limitCroppedImages(id, 10);
                    saveStudentDescriptor(id, result.studentName, descriptors[idx]);
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

// 4. Danh sách học sinh
app.get('/api/students', (req, res) => {
    try {
        res.json(loadAllStudentDescriptors().map(s => ({ id: s.id, name: s.name })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Cảnh báo hành vi
app.post('/api/behavior', rateLimit(50, 60000), async (req, res) => {
    try {
        const { studentId, behavior, timestamp } = req.body;
        if (!studentId || !behavior) return res.status(400).json({ error: 'Thiếu thông tin' });
        const student = loadAllStudentDescriptors().find(s => s.id === studentId);
        if (!student) return res.status(404).json({ error: 'Không tìm thấy học sinh' });
        logEvent(studentId, student.name, 'behavior', { behavior });
        if (!bot) return res.json({ success: false, message: 'Bot chưa kết nối' });
        const message = `🚨 *Cảnh báo hành vi!*\n\n` +
                       `👤 ${student.name} (${student.id})\n` +
                       `⚠️ Hành vi: ${behavior}\n` +
                       `🕐 ${timestamp || getVietnamTime()}`;
        await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6 & 7. Gửi báo cáo thủ công
app.post('/api/send-report', async (req, res) => {
    try { await sendAttendanceReport(true); res.json({ success: true, message: 'Đã gửi báo cáo' }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/send-report', async (req, res) => {
    try { await sendAttendanceReport(true); res.send('✅ Báo cáo đã được gửi qua Telegram!'); }
    catch (err) { res.status(500).send('❌ Lỗi: ' + err.message); }
});

// 8. Lịch sử điểm danh học sinh
app.get('/api/student/:id/attendance', (req, res) => {
    try {
        const studentId = req.params.id;
        const student = loadAllStudentDescriptors().find(s => s.id === studentId);
        if (!student) return res.status(404).json({ error: 'Không tìm thấy' });
        const sessions = Object.entries(attendance)
            .filter(([, list]) => list.includes(studentId))
            .map(([date]) => date);
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

// 10 & 11. Ảnh mẫu
app.get('/api/sample-images', (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'database');
        const files = fs.readdirSync(dbPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
        res.json({ success: true, images: files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sample-image/:filename', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'database', req.params.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
        const base64 = fs.readFileSync(filePath).toString('base64');
        res.json({ success: true, base64, filename: req.params.filename });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 12. Ảnh crop của học sinh
app.get('/api/student/:id/cropped', (req, res) => {
    try {
        const folder = getStudentFolder(req.params.id);
        if (!fs.existsSync(folder)) return res.status(404).json({ error: 'Không có ảnh crop' });
        const files = fs.readdirSync(folder).filter(f => f.endsWith('.jpg'));
        if (files.length === 0) return res.status(404).json({ error: 'Không có ảnh crop' });
        const base64 = fs.readFileSync(path.join(folder, files[files.length - 1])).toString('base64');
        res.json({ success: true, base64, filename: files[files.length - 1] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Part 3: API thống kê cảm xúc
app.get('/api/emotion/stats/:studentId', async (req, res) => {
    try {
        const stats = await getEmotionStats(req.params.studentId);
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/emotion/class', async (req, res) => {
    try {
        const stats = await getClassEmotionStats();
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Debug
app.get('/api/debug/students', (req, res) => {
    const all = loadAllStudentDescriptors();
    res.json({ count: all.length, students: all.map(s => ({ id: s.id, name: s.name, descriptors: s.descriptors?.length || 0 })) });
});

// ==================== PART 5: DASHBOARD & REPORT APIs ====================

// Dashboard stats (tổng hợp)
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Weekly report data cho biểu đồ
app.get('/api/report/week/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const allStudents = loadAllStudentDescriptors();
        const total = allStudents.length;

        const { db } = require('./db');
        const present = await new Promise((resolve, reject) => {
            db.get(`
                SELECT COUNT(DISTINCT studentId) as count FROM events
                WHERE date(timestamp) = ? AND action = 'attendance'
            `, [date], (err, row) => err ? reject(err) : resolve(row?.count || 0));
        });

        res.json({ date, total, present, absent: total - present });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Behavior events today
app.get('/api/behavior/today', async (req, res) => {
    try {
        const { db } = require('./db');
        const today = new Date().toISOString().slice(0, 10);
        const events = await new Promise((resolve, reject) => {
            db.all(`
                SELECT studentId, studentName, details, timestamp FROM events
                WHERE action = 'behavior' AND date(timestamp) = ?
                ORDER BY timestamp DESC
            `, [today], (err, rows) => err ? reject(err) : resolve(rows));
        });
        res.json({ success: true, events });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PDF Report
app.get('/api/report/pdf', async (req, res) => {
    if (!PDFDocument) {
        return res.status(503).json({ error: 'pdfkit chưa được cài. Chạy: npm install pdfkit' });
    }
    try {
        const allStudents = loadAllStudentDescriptors();
        const today = new Date().toISOString().slice(0, 10);
        const todayAttendance = await getTodayAttendance();
        const presentIds = new Set(todayAttendance.map(a => a.studentId));
        const stats = await getStats();

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="baocao_${today}.pdf"`);
        doc.pipe(res);

        // Header
        doc.fontSize(18).font('Helvetica-Bold').text('BÁO CÁO ĐIỂM DANH', { align: 'center' });
        doc.fontSize(12).font('Helvetica').text(`Ngày: ${today}`, { align: 'center' });
        doc.moveDown();

        // Stats
        doc.fontSize(13).font('Helvetica-Bold').text('THỐNG KÊ TỔNG QUAN');
        doc.fontSize(11).font('Helvetica');
        doc.text(`Tổng học sinh: ${stats.totalStudents}`);
        doc.text(`Có mặt: ${stats.presentToday}`);
        doc.text(`Vắng mặt: ${stats.totalStudents - stats.presentToday}`);
        doc.text(`Tỷ lệ: ${stats.totalStudents > 0 ? Math.round(stats.presentToday / stats.totalStudents * 100) : 0}%`);
        doc.moveDown();

        // Present table
        doc.fontSize(13).font('Helvetica-Bold').text('DANH SÁCH CÓ MẶT');
        doc.fontSize(10).font('Helvetica');
        const present = allStudents.filter(s => presentIds.has(s.id));
        if (present.length === 0) {
            doc.text('Chưa có học sinh nào điểm danh.');
        } else {
            present.forEach((s, i) => {
                const time = todayAttendance.find(a => a.studentId === s.id)?.timestamp || '';
                doc.text(`${i+1}. ${s.name} (${s.id}) - ${time}`);
            });
        }
        doc.moveDown();

        // Absent table
        doc.fontSize(13).font('Helvetica-Bold').text('DANH SÁCH VẮNG MẶT');
        doc.fontSize(10).font('Helvetica');
        const absent = allStudents.filter(s => !presentIds.has(s.id));
        if (absent.length === 0) {
            doc.text('Tất cả học sinh đều có mặt!');
        } else {
            absent.forEach((s, i) => doc.text(`${i+1}. ${s.name} (${s.id})`));
        }

        doc.moveDown(2);
        doc.fontSize(9).fillColor('#888').text(`Tạo lúc: ${getVietnamTime()}`, { align: 'right' });
        doc.end();
    } catch (err) {
        console.error('PDF error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Excel Report
app.get('/api/report/excel', async (req, res) => {
    if (!ExcelJS) {
        return res.status(503).json({ error: 'exceljs chưa được cài. Chạy: npm install exceljs' });
    }
    try {
        const allStudents = loadAllStudentDescriptors();
        const today = new Date().toISOString().slice(0, 10);
        const todayAttendance = await getTodayAttendance();
        const presentIds = new Set(todayAttendance.map(a => a.studentId));
        const presentMap = {};
        todayAttendance.forEach(a => { presentMap[a.studentId] = a.timestamp; });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Smart Classroom Monitor';
        const sheet = workbook.addWorksheet(`Điểm danh ${today}`);

        // Header row
        sheet.columns = [
            { header: 'STT', key: 'stt', width: 8 },
            { header: 'Mã học sinh', key: 'id', width: 15 },
            { header: 'Họ tên', key: 'name', width: 28 },
            { header: 'Trạng thái', key: 'status', width: 15 },
            { header: 'Thời gian điểm danh', key: 'time', width: 22 }
        ];

        // Style header
        sheet.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
            cell.alignment = { horizontal: 'center' };
        });

        // Data rows
        allStudents.forEach((s, i) => {
            const isPresent = presentIds.has(s.id);
            const row = sheet.addRow({
                stt: i + 1,
                id: s.id,
                name: s.name,
                status: isPresent ? '✅ Có mặt' : '❌ Vắng mặt',
                time: presentMap[s.id] || ''
            });
            row.getCell('status').font = { color: { argb: isPresent ? 'FF2E7D32' : 'FFC62828' } };
            if (i % 2 === 0) {
                row.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } });
            }
        });

        // Summary
        sheet.addRow([]);
        const stats = await getStats();
        sheet.addRow(['', '', 'Tổng cộng:', allStudents.length, '']);
        sheet.addRow(['', '', 'Có mặt:', stats.presentToday, '']);
        sheet.addRow(['', '', 'Vắng mặt:', stats.totalStudents - stats.presentToday, '']);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="diemdanh_${today}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Excel error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== PART 6: GOOGLE SHEETS ====================

app.post('/api/sheets/export', async (req, res) => {
    if (!sheetsService) {
        return res.status(503).json({ error: 'Google Sheets service chưa cấu hình. Cài googleapis và tạo services/googleSheets.js' });
    }
    if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
        return res.status(503).json({ error: 'Thiếu GOOGLE_SHEETS_SPREADSHEET_ID trong .env' });
    }
    try {
        const allStudents = loadAllStudentDescriptors().map(s => ({ id: s.id, name: s.name }));
        const today = new Date().toISOString().slice(0, 10);
        const attendance = await getTodayAttendance();
        const result = await sheetsService.exportAttendanceToSheets(allStudents, attendance, today);
        res.json({ success: true, url: result.url, sheetName: result.sheetName, rows: result.rows });
    } catch (err) {
        console.error('Sheets export error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sheets/link', (req, res) => {
    const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!id) return res.status(503).json({ error: 'Chưa cấu hình Google Sheets' });
    res.json({ success: true, url: `https://docs.google.com/spreadsheets/d/${id}` });
});

// ==================== KHỞI ĐỘNG ====================
scheduleReports();

app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
    console.log(`📅 Session hôm nay: ${currentSession}`);
    console.log('✅ Đã khởi tạo lịch gửi báo cáo tự động');
});