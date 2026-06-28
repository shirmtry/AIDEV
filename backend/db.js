const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'classroom.db');
const db = new sqlite3.Database(dbPath);

// Hàm lấy thời gian UTC+7 (Việt Nam)
function getVietnamTime() {
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return vietnamTime.toISOString().replace('T', ' ').slice(0, 19);
}

// ==================== TẠO BẢNG VÀ ALTER (tuần tự) ====================
db.serialize(() => {
    // Tạo bảng events
    db.run(`
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            studentId TEXT NOT NULL,
            studentName TEXT,
            action TEXT NOT NULL,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            age INTEGER,
            gender TEXT
        )
    `, (err) => {
        if (err) console.error('❌ Lỗi tạo bảng events:', err.message);
        else console.log('✅ Bảng events đã sẵn sàng');
    });

    // Tạo bảng students
    db.run(`
        CREATE TABLE IF NOT EXISTS students (
            studentId TEXT PRIMARY KEY,
            studentName TEXT,
            registeredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            gender TEXT,
            age INTEGER
        )
    `, (err) => {
        if (err) console.error('❌ Lỗi tạo bảng students:', err.message);
        else console.log('✅ Bảng students đã sẵn sàng');
    });

    // Thêm cột nếu chưa có (ALTER TABLE)
    db.run(`ALTER TABLE events ADD COLUMN age INTEGER`, (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('❌ Lỗi ALTER events age:', err.message);
    });
    db.run(`ALTER TABLE events ADD COLUMN gender TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('❌ Lỗi ALTER events gender:', err.message);
    });
    db.run(`ALTER TABLE students ADD COLUMN gender TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('❌ Lỗi ALTER students gender:', err.message);
    });
    db.run(`ALTER TABLE students ADD COLUMN age INTEGER`, (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('❌ Lỗi ALTER students age:', err.message);
    });
});

// ==================== CÁC HÀM XỬ LÝ ====================

function logEvent(studentId, studentName, action, details, age = null, gender = null) {
    const stmt = db.prepare(
        `INSERT INTO events (studentId, studentName, action, details, timestamp, age, gender)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const timestamp = getVietnamTime();
    stmt.run(studentId, studentName, action, JSON.stringify(details || {}), timestamp, age, gender);
    stmt.finalize();
}

function registerStudent(studentId, studentName, gender = null, age = null) {
    const stmt = db.prepare(
        `INSERT OR REPLACE INTO students (studentId, studentName, gender, age) VALUES (?, ?, ?, ?)`
    );
    stmt.run(studentId, studentName, gender, age);
    stmt.finalize();
}

function getStudents() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT studentId, studentName, gender, age FROM students`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getTodayAttendance() {
    return new Promise((resolve, reject) => {
        const today = new Date().toISOString().slice(0, 10);
        db.all(`
            SELECT studentId, studentName, timestamp, age, gender
            FROM events
            WHERE date(timestamp) = ? AND action = 'attendance'
            ORDER BY timestamp
        `, [today], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getStudentAttendance(studentId) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT action, details, timestamp, age, gender
            FROM events
            WHERE studentId = ?
            ORDER BY timestamp DESC
        `, [studentId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getStats() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT COUNT(DISTINCT studentId) as totalStudents FROM students`, (err, totalRow) => {
            if (err) reject(err);
            db.all(`
                SELECT COUNT(DISTINCT studentId) as presentToday
                FROM events
                WHERE date(timestamp) = date('now') AND action = 'attendance'
            `, (err2, presentRow) => {
                if (err2) reject(err2);
                resolve({
                    totalStudents: totalRow[0].totalStudents || 0,
                    presentToday: presentRow[0].presentToday || 0
                });
            });
        });
    });
}

function getStudentsWithGender() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT studentId, studentName, gender FROM students`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// ==================== EXPORT ====================
module.exports = {
    db,
    logEvent,
    registerStudent,
    getStudents,
    getTodayAttendance,
    getStudentAttendance,
    getStats,
    getVietnamTime,
    getStudentsWithGender
};