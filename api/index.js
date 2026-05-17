const express = require('express');
const fetch = require('node-fetch');
const requestIp = require('request-ip');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(requestIp.mw());

// 🔥 Tumhara Real MongoDB Connection String Direct Added Hai
const mongoURI = "mongodb+srv://Websnews:uniokesugcom@cluster0.inqs1eh.mongodb.net/?appName=Cluster0";

// Clean Mongoose v8+ Connection Logic
mongoose.connect(mongoURI)
    .then(() => console.log("💾 MongoDB Connected Successfully!"))
    .catch(err => console.error("❌ MongoDB Connection Failed:", err.message));

// Database Schema Setup
const userSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botUsername: { type: String, required: true },
    deviceKey: { type: String, required: true, unique: true },
    ip: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Compound Index: Ek bot par ek user ek hi baar register ho sake
userSchema.index({ tgId: 1, botUsername: 1 }, { unique: true });
const User = mongoose.models.VerifiedUser || mongoose.model('VerifiedUser', userSchema);

// Telegram Alert Sender
async function sendAlert(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text })
        });
    } catch (e) {
        console.error("Alert Error:", e.message);
    }
}

// Verification Endpoint
app.get('/verify-api', async (req, res) => {
    // Dynamic parameters read karna
    const { botusername, bottoken, tg_id, browser_id, name } = req.query;

    if (!botusername || !bottoken || !tg_id || !browser_id) {
        return res.status(400).json({ status: 'fail', message: 'Parameters completely missing!' });
    }

    const ip = req.clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const finalDeviceKey = `${ip}_${browser_id}`;

    try {
        // 1. Anti-Fraud Multi-Account Check
        const multiAccountCheck = await User.findOne({ deviceKey: finalDeviceKey, tgId: { $ne: tg_id } });
        if (multiAccountCheck) {
            await sendAlert(bottoken, tg_id, `⚠️ Alert: Multi-Account Blocked!\n\nUser: ${name}\nID: ${tg_id}\n\nSame device detected with another account!`);
            return res.status(403).json({ status: 'fail', message: 'Multi-account cloning detected!' });
        }

        // 2. Already Registered Check for this Specific Bot
        const usernameExistCheck = await User.findOne({ tgId: tg_id, botUsername: botusername });
        if (usernameExistCheck) {
            await sendAlert(bottoken, tg_id, `❌ Failed: Aap (@${botusername}) par pehle se verified hain.`);
            return res.status(400).json({ status: 'fail', message: 'Already registered on this bot!' });
        }

        // 3. Success: New User Entry
        const newUser = new User({
            tgId: tg_id,
            botUsername: botusername,
            deviceKey: finalDeviceKey,
            ip: ip
        });
        await newUser.save();

        // Send Instant Log Alert to Bot
        await sendAlert(bottoken, tg_id, `✅ Verified Successfully!\n\n👤 Name: ${name}\n🆔 ID: ${tg_id}\n🤖 Bot: @${botusername}\n🌐 IP: ${ip}`);
        return res.status(200).json({ status: 'pass', message: 'Success' });

    } catch (err) {
        console.error("Save Error:", err);
        return res.status(500).json({ status: 'fail', message: 'Database Error' });
    }
});

module.exports = app;
