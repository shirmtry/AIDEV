// backend/services/googleSheets.js
// Google Sheets integration cho hệ thống điểm danh
// Yêu cầu .env:
//   GOOGLE_SHEETS_PRIVATE_KEY=...
//   GOOGLE_SHEETS_CLIENT_EMAIL=...
//   GOOGLE_SHEETS_SPREADSHEET_ID=...

const { google } = require('googleapis');

// Cache auth client để không tạo lại mỗi lần
let _authClient = null;

async function getAuthClient() {
    if (_authClient) return _authClient;

    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY
        ? process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n')
        : null;
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;

    if (!privateKey || !clientEmail) {
        throw new Error('Thiếu GOOGLE_SHEETS_PRIVATE_KEY hoặc GOOGLE_SHEETS_CLIENT_EMAIL trong .env');
    }

    _authClient = new google.auth.JWT(
        clientEmail,
        null,
        privateKey,
        ['https://www.googleapis.com/auth/spreadsheets']
    );

    await _authClient.authorize();
    console.log('✅ Google Sheets auth thành công');
    return _authClient;
}

function getSheetsClient(auth) {
    return google.sheets({ version: 'v4', auth });
}

// Tạo hoặc lấy sheet theo tên
async function getOrCreateSheet(sheets, spreadsheetId, sheetName) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = meta.data.sheets.find(s => s.properties.title === sheetName);
    if (existing) return existing.properties.sheetId;

    // Tạo sheet mới
    const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{
                addSheet: {
                    properties: { title: sheetName }
                }
            }]
        }
    });
    return addRes.data.replies[0].addSheet.properties.sheetId;
}

// Format tiêu đề đẹp
async function formatHeaderRow(sheets, spreadsheetId, sheetId) {
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{
                repeatCell: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 0.1, green: 0.1, blue: 0.19 },
                            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11 },
                            horizontalAlignment: 'CENTER'
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
            }, {
                updateSheetProperties: {
                    properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                    fields: 'gridProperties.frozenRowCount'
                }
            }]
        }
    });
}

// ==================== HÀM CHÍNH ====================

/**
 * Xuất điểm danh một ngày lên Google Sheets
 * @param {Array} students - [{ id, name }] tất cả học sinh
 * @param {Array} attendance - [{ studentId, studentName, timestamp }] đã điểm danh
 * @param {string} date - 'YYYY-MM-DD'
 */
async function exportAttendanceToSheets(students, attendance, date) {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) throw new Error('Thiếu GOOGLE_SHEETS_SPREADSHEET_ID trong .env');

    const auth = await getAuthClient();
    const sheets = getSheetsClient(auth);

    const sheetName = `Điểm danh ${date}`;
    const sheetId = await getOrCreateSheet(sheets, spreadsheetId, sheetName);

    const presentIds = new Set(attendance.map(a => a.studentId));
    const presentMap = {};
    attendance.forEach(a => { presentMap[a.studentId] = a.timestamp; });

    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    // Build rows
    const rows = [
        // Tiêu đề
        ['STT', 'Mã học sinh', 'Họ tên', 'Trạng thái', 'Thời gian điểm danh', 'Ghi chú'],
        // Dữ liệu
        ...students.map((s, i) => [
            i + 1,
            s.id,
            s.name,
            presentIds.has(s.id) ? '✅ Có mặt' : '❌ Vắng mặt',
            presentMap[s.id] || '',
            ''
        ]),
        // Dòng trống
        [],
        // Tổng kết
        ['', '', 'TỔNG KẾT', '', '', ''],
        ['', '', 'Tổng học sinh:', students.length, '', ''],
        ['', '', 'Có mặt:', presentIds.size, '', ''],
        ['', '', 'Vắng mặt:', students.length - presentIds.size, '', ''],
        ['', '', 'Tỷ lệ:', `${students.length > 0 ? Math.round(presentIds.size / students.length * 100) : 0}%`, '', ''],
        [],
        ['', '', 'Cập nhật lúc:', now, '', '']
    ];

    // Ghi dữ liệu (clear cũ rồi ghi mới)
    const range = `${sheetName}!A1`;
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: sheetName });
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows }
    });

    // Format header
    await formatHeaderRow(sheets, spreadsheetId, sheetId);

    // Auto-resize columns
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{
                autoResizeDimensions: {
                    dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 6 }
                }
            }]
        }
    });

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    console.log(`✅ Đã xuất điểm danh ${date} lên Sheets: ${url}`);
    return { url, sheetName, rows: students.length };
}

/**
 * Xuất lịch sử điểm danh nhiều ngày
 * @param {Array} weekData - [{ date, students, present, absent }]
 */
async function exportWeeklyReport(weekData) {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) throw new Error('Thiếu GOOGLE_SHEETS_SPREADSHEET_ID');

    const auth = await getAuthClient();
    const sheets = getSheetsClient(auth);

    const sheetName = 'Báo cáo tuần';
    const sheetId = await getOrCreateSheet(sheets, spreadsheetId, sheetName);

    const rows = [
        ['Ngày', 'Tổng học sinh', 'Có mặt', 'Vắng mặt', 'Tỷ lệ (%)'],
        ...weekData.map(d => [
            d.date,
            d.total,
            d.present,
            d.absent,
            d.total > 0 ? (d.present / d.total * 100).toFixed(1) : '0'
        ])
    ];

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: sheetName });
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows }
    });

    await formatHeaderRow(sheets, spreadsheetId, sheetId);

    return { url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
}

/**
 * Tự động export khi có học sinh mới điểm danh
 * Dùng debounce để tránh gọi API liên tục
 */
let _autoExportTimer = null;

function scheduleAutoExport(getStudentsFn, getAttendanceFn) {
    if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) return;
    clearTimeout(_autoExportTimer);
    _autoExportTimer = setTimeout(async () => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const students = await getStudentsFn();
            const attendance = await getAttendanceFn();
            await exportAttendanceToSheets(students, attendance, today);
        } catch (e) {
            console.error('⚠️ Auto-export Sheets thất bại:', e.message);
        }
    }, 5000); // Debounce 5 giây
}

module.exports = { exportAttendanceToSheets, exportWeeklyReport, scheduleAutoExport };