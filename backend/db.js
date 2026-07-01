// backend/db.js
// ============================================================
// ĐẦY ĐỦ: bao gồm bảng attendance + các hàm CRUD
// ============================================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'classroom.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('❌ DB connection error:', err.message);
    else console.log('✅ SQLite connected:', dbPath);
});

function getVietnamTime() {
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return vietnamTime.toISOString().replace('T', ' ').slice(0, 19);
}

// ==================== TẠO BẢNG ====================
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentId TEXT NOT NULL,
        studentName TEXT,
        action TEXT NOT NULL,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        age INTEGER,
        gender TEXT
    )`, (err) => {
        if (err) console.error('❌ Lỗi tạo bảng events:', err.message);
        else console.log('✅ Bảng events đã sẵn sàng');
    });

    db.run(`CREATE TABLE IF NOT EXISTS students (
        studentId TEXT PRIMARY KEY,
        studentName TEXT,
        registeredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        gender TEXT,
        age INTEGER
    )`, (err) => {
        if (err) console.error('❌ Lỗi tạo bảng students:', err.message);
        else console.log('✅ Bảng students đã sẵn sàng');
    });

    // ===== BẢNG ATTENDANCE (quan trọng) =====
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        session_date TEXT,
        student_id TEXT,
        PRIMARY KEY (session_date, student_id)
    )`, (err) => {
        if (err) console.error('❌ Lỗi tạo bảng attendance:', err.message);
        else console.log('✅ Bảng attendance đã sẵn sàng');
    });

    // ALTER TABLE nếu thiếu cột
    const alterQueries = [
        `ALTER TABLE events ADD COLUMN age INTEGER`,
        `ALTER TABLE events ADD COLUMN gender TEXT`,
        `ALTER TABLE students ADD COLUMN gender TEXT`,
        `ALTER TABLE students ADD COLUMN age INTEGER`
    ];
    alterQueries.forEach(sql => {
        db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('❌ Lỗi ALTER:', err.message);
            }
        });
    });
});

// ==================== HÀM XỬ LÝ ====================
function logEvent(studentId, studentName, action, details, age = null, gender = null) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(
            `INSERT INTO events (studentId, studentName, action, details, timestamp, age, gender)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        const timestamp = getVietnamTime();
        stmt.run(studentId, studentName, action, JSON.stringify(details || {}), timestamp, age, gender, function(err) {
            stmt.finalize();
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
}

function registerStudent(studentId, studentName, gender = null, age = null) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(
            `INSERT OR REPLACE INTO students (studentId, studentName, gender, age) VALUES (?, ?, ?, ?)`
        );
        stmt.run(studentId, studentName, gender, age, function(err) {
            stmt.finalize();
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

function getStudents() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT studentId, studentName, gender, age FROM students ORDER BY studentName`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getStudentById(studentId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT studentId, studentName, gender, age FROM students WHERE studentId = ?`, [studentId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// Lấy điểm danh hôm nay (theo ngày hiện tại)
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

// ===== HÀM getAttendanceByDate (QUAN TRỌNG) =====
function getAttendanceByDate(date) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT student_id FROM attendance WHERE session_date = ?`,
            [date],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(r => r.student_id));
            }
        );
    });
}

// Ghi nhận điểm danh
function logAttendance(studentId, studentName, date = null) {
    return new Promise((resolve, reject) => {
        const sessionDate = date || new Date().toISOString().slice(0, 10);
        const stmt = db.prepare(
            `INSERT OR IGNORE INTO attendance (session_date, student_id) VALUES (?, ?)`
        );
        stmt.run(sessionDate, studentId, function(err) {
            stmt.finalize();
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

// Xóa điểm danh của một ngày
function clearAttendance(date) {
    return new Promise((resolve, reject) => {
        db.run(
            `DELETE FROM attendance WHERE session_date = ?`,
            [date],
            function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

// Cập nhật thông tin học sinh
function updateStudent(studentId, name, oldName, gender, age) {
    return new Promise((resolve, reject) => {
        const sql = `
            UPDATE students 
            SET studentName = COALESCE(?, studentName),
                gender = COALESCE(?, gender),
                age = COALESCE(?, age)
            WHERE studentId = ?
        `;
        db.run(sql, [name, gender, age, studentId], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

// Xóa học sinh
function deleteStudent(studentId) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM students WHERE studentId = ?`, [studentId], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
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
        db.get(`SELECT COUNT(DISTINCT studentId) as totalStudents FROM students`, (err, totalRow) => {
            if (err) reject(err);
            db.get(`
                SELECT COUNT(DISTINCT studentId) as presentToday
                FROM events
                WHERE date(timestamp) = date('now') AND action = 'attendance'
            `, (err2, presentRow) => {
                if (err2) reject(err2);
                resolve({
                    totalStudents: totalRow ? totalRow.totalStudents : 0,
                    presentToday: presentRow ? presentRow.presentToday : 0
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

function closeDb() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ==================== EXPORT ====================
module.exports = {
    db,
    logEvent,
    registerStudent,
    getStudents,
    getStudentById,
    getTodayAttendance,
    getAttendanceByDate,    // <-- ĐÃ CÓ
    logAttendance,          // <-- ĐÃ CÓ
    clearAttendance,        // <-- ĐÃ CÓ
    updateStudent,
    deleteStudent,
    getStudentAttendance,
    getStats,
    getVietnamTime,
    getStudentsWithGender,
    getEmotionStats,
    getClassEmotionStats,
    closeDb
};