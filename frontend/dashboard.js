// frontend/dashboard.js
const SERVER_URL = window.location.origin; // Same origin as server

let emotionChart = null;
let weeklyChart = null;
let refreshTimer = null;
let countdownTimer = null;
let countdownSeconds = 30;

// ==================== INIT ====================
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

// ==================== CHARTS INIT ====================
function initCharts() {
    // Emotion pie chart
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
                legend: {
                    position: 'right',
                    labels: { font: { size: 12 }, padding: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${ctx.parsed} lần`
                    }
                }
            }
        }
    });

    // Weekly attendance bar chart
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

// ==================== LOAD ALL DATA ====================
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
        showToast('❌ Lỗi tải dữ liệu');
    }
}

// ==================== STATS ====================
async function loadStats() {
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
}

// ==================== ATTENDANCE TABLES ====================
async function loadAttendanceTables() {
    // All students
    const allRes = await fetch(`${SERVER_URL}/api/students`);
    const allStudents = await allRes.json();

    // Present today
    const attRes = await fetch(`${SERVER_URL}/api/attendance`);
    const attData = await attRes.json();
    const presentIds = new Set((attData.students || []).map(s => s.id));

    const present = allStudents.filter(s => presentIds.has(s.id));
    const absent = allStudents.filter(s => !presentIds.has(s.id));

    document.getElementById('present-badge').textContent = `${present.length} học sinh`;
    document.getElementById('absent-badge').textContent = `${absent.length} học sinh`;

    // Present table
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

    // Absent table
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
}

// ==================== EMOTION CHART ====================
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

        // Dominant emotion for stat card
        if (stats.length > 0) {
            const dominant = stats[0];
            const icon = emotionLabels[dominant.emotion] || dominant.emotion;
            document.getElementById('stat-emotion').textContent = icon.split(' ')[0];
        }
    } catch (e) {
        console.warn('Không tải được emotion stats:', e.message);
    }
}

// ==================== WEEKLY CHART ====================
async function loadWeeklyChart() {
    try {
        const today = new Date();
        const labels = [];
        const presentData = [];
        const absentData = [];

        // Get last 7 days
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

// ==================== BEHAVIOR LOG ====================
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
        document.getElementById('behavior-feed').innerHTML =
            '<div class="loading">Không thể tải nhật ký hành vi</div>';
    }
}

// ==================== ACTIONS ====================
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

async function exportSheets() {
    showToast('⏳ Đang xuất Google Sheets...');
    try {
        const res = await fetch(`${SERVER_URL}/api/sheets/export`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Đã xuất lên Google Sheets!');
            if (data.url) window.open(data.url, '_blank');
        } else {
            showToast('❌ ' + (data.error || 'Lỗi xuất Sheets'));
        }
    } catch (e) {
        showToast('❌ Lỗi kết nối');
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

// ==================== AUTO REFRESH ====================
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

// ==================== TOAST ====================
let toastTimer = null;
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}