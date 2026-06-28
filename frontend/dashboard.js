// frontend/dashboard.js
const SERVER_URL = window.location.origin;

let emotionChart = null;
let weeklyChart = null;
let countdownTimer = null;
let countdownSeconds = 30;

// ==================== KHỞI TẠO ====================
document.addEventListener('DOMContentLoaded', () => {
    updateDateLabel();
    initCharts();
    loadAll();
    startAutoRefresh();
});

function updateDateLabel() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('date-label').textContent = now.toLocaleDateString('vi-VN', options);
}

// ==================== BIỂU ĐỒ ====================
function initCharts() {
    // Biểu đồ cảm xúc (tròn)
    const emotionCtx = document.getElementById('emotionChart').getContext('2d');
    emotionChart = new Chart(emotionCtx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#4caf50', '#2196f3', '#ff9800', '#e91e63',
                    '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { font: { size: 12 }, padding: 12 } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${ctx.parsed} lần`
                    }
                }
            }
        }
    });

    // Biểu đồ điểm danh tuần (cột)
    const weeklyCtx = document.getElementById('weeklyChart').getContext('2d');
    weeklyChart = new Chart(weeklyCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Có mặt',
                    data: [],
                    backgroundColor: 'rgba(76, 175, 80, 0.8)',
                    borderRadius: 6
                },
                {
                    label: 'Vắng',
                    data: [],
                    backgroundColor: 'rgba(233, 69, 96, 0.7)',
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 12 } } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// ==================== TẢI TOÀN BỘ DỮ LIỆU ====================
async function loadAll() {
    try {
        await Promise.all([
            loadStats(),
            loadAttendanceTables(),
            loadEmotionChart(),
            loadWeeklyChart(),
            loadBehaviorLog()
        ]);
    } catch (e) {
        console.error('Lỗi tải dashboard:', e);
        showToast('❌ Lỗi tải dữ liệu, vui lòng thử lại');
    }
}

// ==================== THỐNG KÊ ====================
async function loadStats() {
    try {
        const res = await fetch(`${SERVER_URL}/api/stats`);
        const data = await res.json();
        const total = data.totalStudents || 0;
        const present = data.presentToday || 0;
        const absent = total - present;
        const rate = total > 0 ? Math.round(present / total * 100) : 0;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-present').textContent = present;
        document.getElementById('stat-absent').textContent = absent;
        document.getElementById('stat-rate').textContent = rate + '%';
    } catch (e) {
        console.warn('Không tải được stats:', e.message);
        document.getElementById('stat-total').textContent = '--';
        document.getElementById('stat-present').textContent = '--';
        document.getElementById('stat-absent').textContent = '--';
        document.getElementById('stat-rate').textContent = '--%';
    }
}

// ==================== BẢNG ĐIỂM DANH ====================
async function loadAttendanceTables() {
    try {
        // 1. Lấy tất cả học sinh từ API /api/students
        const allRes = await fetch(`${SERVER_URL}/api/students`);
        const rawStudents = await allRes.json();

        // Ánh xạ đúng tên trường (studentId -> id, studentName -> name)
        const allStudents = rawStudents.map(s => ({
            id: s.studentId,
            name: s.studentName,
            gender: s.gender,
            age: s.age,
            ...s
        }));

        // 2. Lấy danh sách có mặt hôm nay
        const attRes = await fetch(`${SERVER_URL}/api/attendance`);
        const attData = await attRes.json();
        const presentIds = new Set((attData.students || []).map(s => s.id));

        const present = allStudents.filter(s => presentIds.has(s.id));
        const absent = allStudents.filter(s => !presentIds.has(s.id));

        document.getElementById('present-badge').textContent = `${present.length} học sinh`;
        document.getElementById('absent-badge').textContent = `${absent.length} học sinh`;

        // Bảng có mặt
        document.getElementById('present-table-wrap').innerHTML = present.length === 0
            ? '<div class="loading">Chưa có học sinh nào điểm danh</div>'
            : `<table>
                <thead><tr><th>#</th><th>Học sinh</th><th>Mã số</th><th>Trạng thái</th></tr></thead>
                <tbody>${present.map((s, i) => `
                    <tr>
                        <td>${i+1}</td>
                        <td><strong>${s.name}</strong></td>
                        <td><code>${s.id}</code></td>
                        <td><span class="badge badge-green">✅ Có mặt</span></td>
                    </tr>`).join('')}
                </tbody>
               </table>`;

        // Bảng vắng mặt
        document.getElementById('absent-table-wrap').innerHTML = absent.length === 0
            ? '<div class="loading" style="color:#4caf50">🎉 Tất cả học sinh đều có mặt!</div>'
            : `<table>
                <thead><tr><th>#</th><th>Học sinh</th><th>Mã số</th><th>Trạng thái</th></tr></thead>
                <tbody>${absent.map((s, i) => `
                    <tr>
                        <td>${i+1}</td>
                        <td><strong>${s.name}</strong></td>
                        <td><code>${s.id}</code></td>
                        <td><span class="badge badge-red">❌ Vắng</span></td>
                    </tr>`).join('')}
                </tbody>
               </table>`;
    } catch (e) {
        console.error('Lỗi tải bảng điểm danh:', e);
        document.getElementById('present-table-wrap').innerHTML = '<div class="loading">❌ Không thể tải dữ liệu</div>';
        document.getElementById('absent-table-wrap').innerHTML = '<div class="loading">❌ Không thể tải dữ liệu</div>';
    }
}

// ==================== BIỂU ĐỒ CẢM XÚC ====================
async function loadEmotionChart() {
    try {
        const res = await fetch(`${SERVER_URL}/api/emotion/class`);
        const data = await res.json();
        const stats = data.stats || [];

        const emotionLabels = {
            happy: '😊 Vui', sad: '😢 Buồn', angry: '😠 Tức giận',
            fearful: '😨 Sợ hãi', disgusted: '🤢 Chán ghét',
            surprised: '😲 Ngạc nhiên', neutral: '😐 Bình thường'
        };

        const labels = stats.map(s => emotionLabels[s.emotion] || s.emotion);
        const values = stats.map(s => s.count);
        const total = values.reduce((a, b) => a + b, 0);

        emotionChart.data.labels = labels;
        emotionChart.data.datasets[0].data = values;
        emotionChart.update();

        document.getElementById('emotion-total-badge').textContent = `${total} lượt`;

        if (stats.length > 0) {
            const dominant = stats[0];
            const icon = emotionLabels[dominant.emotion] || dominant.emotion;
            document.getElementById('stat-emotion').textContent = icon.split(' ')[0];
        } else {
            document.getElementById('stat-emotion').textContent = '😐';
        }
    } catch (e) {
        console.warn('Không tải được emotion stats:', e.message);
        document.getElementById('stat-emotion').textContent = '--';
    }
}

// ==================== BIỂU ĐỒ TUẦN ====================
async function loadWeeklyChart() {
    try {
        const today = new Date();
        const labels = [];
        const presentData = [];
        const absentData = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const dayLabel = d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric' });
            labels.push(dayLabel);

            try {
                const res = await fetch(`${SERVER_URL}/api/report/week/${dateStr}`);
                const data = await res.json();
                presentData.push(data.present || 0);
                absentData.push(data.absent || 0);
            } catch {
                presentData.push(0);
                absentData.push(0);
            }
        }

        weeklyChart.data.labels = labels;
        weeklyChart.data.datasets[0].data = presentData;
        weeklyChart.data.datasets[1].data = absentData;
        weeklyChart.update();
    } catch (e) {
        console.warn('Không tải được weekly chart:', e.message);
    }
}

// ==================== NHẬT KÝ HÀNH VI ====================
async function loadBehaviorLog() {
    try {
        const res = await fetch(`${SERVER_URL}/api/behavior/today`);
        const data = await res.json();
        const events = data.events || [];

        document.getElementById('behavior-badge').textContent = `${events.length} sự kiện`;

        if (events.length === 0) {
            document.getElementById('behavior-feed').innerHTML =
                '<div class="loading">Không có cảnh báo nào hôm nay 🎉</div>';
            return;
        }

        const dotColor = (behavior) => {
            if (behavior.includes('điện thoại')) return 'dot-red';
            if (behavior.includes('cảm xúc')) return 'dot-orange';
            return 'dot-blue';
        };

        document.getElementById('behavior-feed').innerHTML = events.map(e => {
            const detail = e.details ? JSON.parse(e.details) : {};
            const behavior = detail.behavior || 'Hành vi bất thường';
            return `<div class="behavior-item">
                <div class="behavior-dot ${dotColor(behavior)}"></div>
                <div class="behavior-text">
                    <div class="name">${e.studentName} (${e.studentId})</div>
                    <div>${behavior}</div>
                    <div class="time">🕐 ${e.timestamp}</div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        console.warn('Không tải được behavior log:', e.message);
        document.getElementById('behavior-feed').innerHTML =
            '<div class="loading">Không thể tải nhật ký hành vi</div>';
    }
}

// ==================== CÁC HÀNH ĐỘNG (XUẤT BÁO CÁO) ====================
async function sendReport() {
    showToast('⏳ Đang gửi báo cáo...');
    try {
        const res = await fetch(`${SERVER_URL}/api/send-report`, { method: 'POST' });
        const data = await res.json();
        showToast(data.success ? '✅ Đã gửi báo cáo qua Telegram!' : '❌ Lỗi: ' + data.error);
    } catch (e) {
        showToast('❌ Không thể kết nối server');
    }
}

async function exportCSV() {
    showToast('⏳ Đang tạo file CSV...');
    try {
        const res = await fetch(`${SERVER_URL}/api/report/csv`);
        if (!res.ok) throw new Error('Server error');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `diemdanh_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('✅ Đã tải file CSV!');
    } catch (e) {
        showToast('❌ Lỗi xuất CSV: ' + e.message);
    }
}

async function exportWeeklyCSV() {
    const today = new Date().toISOString().slice(0, 10);
    showToast('⏳ Đang tạo báo cáo tuần...');
    try {
        const res = await fetch(`${SERVER_URL}/api/report/week-csv/${today}`);
        if (!res.ok) throw new Error('Server error');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `baocao_tuan_${today}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('✅ Đã tải báo cáo tuần!');
    } catch (e) {
        showToast('❌ Lỗi xuất báo cáo tuần: ' + e.message);
    }
}

async function exportExcel() {
    showToast('⏳ Đang tạo file Excel...');
    try {
        const res = await fetch(`${SERVER_URL}/api/report/excel`);
        if (!res.ok) throw new Error('Server error');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `diemdanh_${new Date().toISOString().slice(0,10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('✅ Đã tải file Excel!');
    } catch (e) {
        showToast('❌ Lỗi xuất Excel');
    }
}

async function exportPDF() {
    showToast('⏳ Đang tạo PDF...');
    try {
        const res = await fetch(`${SERVER_URL}/api/report/pdf`);
        if (!res.ok) throw new Error('Server error');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `baocao_${new Date().toISOString().slice(0,10)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('✅ Đã tải file PDF!');
    } catch (e) {
        showToast('❌ Lỗi xuất PDF: ' + e.message);
    }
}

// ==================== TỰ ĐỘNG LÀM MỚI ====================
function startAutoRefresh() {
    countdownSeconds = 30;
    updateCountdown();
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
        countdownSeconds--;
        updateCountdown();
        if (countdownSeconds <= 0) {
            countdownSeconds = 30;
            loadAll();
        }
    }, 1000);
}

function updateCountdown() {
    const el = document.getElementById('refresh-countdown');
    if (el) el.textContent = `Cập nhật sau ${countdownSeconds}s`;
}

// ==================== THÔNG BÁO TOAST ====================
let toastTimer = null;
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// Gắn các hàm vào window để dùng trực tiếp từ HTML onclick
window.sendReport = sendReport;
window.exportCSV = exportCSV;
window.exportWeeklyCSV = exportWeeklyCSV;
window.exportExcel = exportExcel;
window.exportPDF = exportPDF;
window.loadAll = loadAll; // cho nút làm mới