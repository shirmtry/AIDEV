// telegram-bot/bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Lắng nghe lệnh từ bot
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, '🤖 Bot giám sát lớp học đã sẵn sàng!');
});

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        '📋 *Các lệnh:*\n' +
        '/attendance - Xem điểm danh\n' +
        '/report - Báo cáo tổng hợp\n' +
        '/status - Trạng thái hệ thống',
        { parse_mode: 'Markdown' }
    );
});

// Hàm gửi cảnh báo (được gọi từ server)
function sendAlert(studentName, behavior) {
    const message = `🚨 *Cảnh báo hành vi!*\n\n` +
                   `👤 Học sinh: ${studentName}\n` +
                   `⚠️ Hành vi: ${behavior}\n` +
                   `🕐 Thời gian: ${new Date().toLocaleString()}`;
    bot.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' });
}

module.exports = { sendAlert };