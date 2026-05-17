const express = require('express');
const fetch = require('node-fetch');
const requestIp = require('request-ip');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(requestIp.mw());

// 1. MongoDB Connection Setup
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error("❌ Error: MONGO_URI environment variable mein nahi mila!");
} else {
    mongoose.connect(mongoURI)
        .then(() => console.log("💾 MongoDB Connected Successfully!"))
        .catch(err => console.error("❌ MongoDB Connection Failed:", err.message));
}

// 2. Mongoose Database Schema & Model Setup
const userSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botUsername: { type: String, required: true },
    deviceKey: { type: String, required: true, unique: true }, // Hardware unique key
    ip: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Index to avoid multiple registrations for same bot
userSchema.index({ tgId: 1, botUsername: 1 }, { unique: true });

const User = mongoose.models.VerifiedUser || mongoose.model('VerifiedUser', userSchema);

// Telegram Bot Message Sender
async function sendAlert(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text })
        });
    } catch (e) {
        console.error("Alert error:", e.message);
    }
}

// --- BACKEND API ENDPOINT ---
app.get('/verify-api', async (req, res) => {
    const { botusername, bottoken, tg_id, browser_id, name } = req.query;

    if (!botusername || !bottoken || !tg_id || !browser_id) {
        return res.status(400).json({ status: 'fail', message: 'Missing core verification data' });
    }

    const ip = req.clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const finalDeviceKey = `${ip}_${browser_id}`;

    try {
        // 1. CONDITION: Same Device/IP but Different Telegram ID -> FAIL
        const multiAccountCheck = await User.findOne({ deviceKey: finalDeviceKey, tgId: { $ne: tg_id } });
        if (multiAccountCheck) {
            await sendAlert(bottoken, tg_id, `⚠️ Alert: Multi-Account Bypass Blocked!\n\nUser: ${name}\nID: ${tg_id}\n\nSame device detected with a different Telegram account!`);
            return res.status(403).json({ status: 'fail', message: 'Device cloning or multi-account detected!' });
        }

        // 2. CONDITION: Same Telegram ID already exists on same Bot Username -> FAIL
        const usernameExistCheck = await User.findOne({ tgId: tg_id, botUsername: botusername });
        if (usernameExistCheck) {
            await sendAlert(bottoken, tg_id, `❌ Verification Failed:\n\nAap is bot (@${botusername}) par pehle se hi verified hain.`);
            return res.status(400).json({ status: 'fail', message: 'Your Telegram ID is already registered!' });
        }

        // 3. PASS SCENARIO: Naya user hai toh MongoDB me permanently save karo
        const newUser = new User({
            tgId: tg_id,
            botUsername: botusername,
            deviceKey: finalDeviceKey,
            ip: ip
        });
        await newUser.save();

        // Instant alert trigger through bot token
        await sendAlert(bottoken, tg_id, `✅ Verified Successfully!\n\n👤 Name: ${name}\n🆔 ID: ${tg_id}\n🤖 Bot: @${botusername}\n🌐 IP: ${ip}\n🔒 Device Database Locked.`);

        return res.status(200).json({ status: 'pass', message: 'Verification Passed' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: 'fail', message: 'Database processing error' });
    }
});

module.exports = app;
          
