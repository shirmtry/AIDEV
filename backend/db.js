const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'classroom.db');
const db = new sqlite3.Database(dbPath);

// Tạo bảng events và students nếu chưa tồn tại
db.run(`
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentId TEXT NOT NULL,
        studentName TEXT,
        action TEXT NOT NULL,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS students (
        studentId TEXT PRIMARY KEY,
        studentName TEXT,
        registeredAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Hàm lấy thời gian UTC+7 (Việt Nam)
function getVietnamTime() {
    const now = new Date();
    // Cộng thêm 7 giờ (UTC+7)
    const vietnamTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return vietnamTime.toISOString().replace('T', ' ').slice(0, 19);
}

function logEvent(studentId, studentName, action, details) {
    const stmt = db.prepare(
        `INSERT INTO events (studentId, studentName, action, details, timestamp) VALUES (?, ?, ?, ?, ?)`
    );
    const timestamp = getVietnamTime();
    stmt.run(studentId, studentName, action, JSON.stringify(details || {}), timestamp);
    stmt.finalize();
}

function registerStudent(studentId, studentName) {
    const stmt = db.prepare(
        `INSERT OR REPLACE INTO students (studentId, studentName) VALUES (?, ?)`
    );
    stmt.run(studentId, studentName);
    stmt.finalize();
}

function getStudents() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT studentId, studentName FROM students`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getTodayAttendance() {
    return new Promise((resolve, reject) => {
        const today = new Date().toISOString().slice(0, 10);
        db.all(`
            SELECT studentId, studentName, timestamp 
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
            SELECT action, details, timestamp 
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

module.exports = { db, logEvent, registerStudent, getStudents, getTodayAttendance, getStudentAttendance, getStats, getVietnamTime };