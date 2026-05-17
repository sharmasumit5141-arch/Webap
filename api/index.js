const express = require('express');
const fetch = require('node-fetch');
const requestIp = require('request-ip');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(requestIp.mw());

// ⚠️ YAHAN APNA ASLI MONGODB LINK PAST KARO (STRICTLY INSIDE QUOTES)
// Agar Vercel variable use karna hai toh process.env.MONGO_URI rehne dena, nahi toh direct link dalo:
const mongoURI = "mongodb+srv://Websnews:uniokesugcom@cluster0.inqs1eh.mongodb.net/?appName=Cluster0";

// Database Connection Check
if (!mongoURI || mongoURI.includes("TUMHARA_USERNAME")) {
    console.error("❌ Error: Aapne MONGO_URI me apna asli connection string nahi dala hai!");
} else {
    mongoose.connect(mongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(() => console.log("💾 MongoDB Connected Successfully!"))
    .catch(err => console.error("❌ MongoDB Connection Failed:", err.message));
}

// Mongoose Schema Setup
const userSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botUsername: { type: String, required: true },
    deviceKey: { type: String, required: true, unique: true }, // Anti-fraud unique key
    ip: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Compound Index: Taaki ek bot par ek ID dubara verify na ho sake
userSchema.index({ tgId: 1, botUsername: 1 }, { unique: true });

const User = mongoose.models.VerifiedUser || mongoose.model('VerifiedUser', userSchema);

// Telegram Bot Alert Sender
async function sendAlert(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text })
        });
    } catch (e) {
        console.error("Telegram Alert Error:", e.message);
    }
}

// Backend API End-point
app.get('/verify-api', async (req, res) => {
    // Frontend se saari details receive karna
    const { botusername, bottoken, tg_id, browser_id, name } = req.query;

    if (!botusername || !bottoken || !tg_id || !browser_id) {
        return res.status(400).json({ status: 'fail', message: 'Parameters completely missing!' });
    }

    const ip = req.clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const finalDeviceKey = `${ip}_${browser_id}`;

    try {
        // 1. RULE: Same Device/IP but Different Telegram ID -> BYPASS BLOCKED (Multi-Account)
        const multiAccountCheck = await User.findOne({ deviceKey: finalDeviceKey, tgId: { $ne: tg_id } });
        if (multiAccountCheck) {
            await sendAlert(bottoken, tg_id, `⚠️ Alert: Multi-Account Bypass Blocked!\n\nUser: ${name}\nID: ${tg_id}\n\nSame device detected with a different account!`);
            return res.status(403).json({ status: 'fail', message: 'Multi-account cloning detected on this device!' });
        }

        // 2. RULE: Same Telegram ID already exists on same Bot Username -> ALREADY REGISTERED
        const usernameExistCheck = await User.findOne({ tgId: tg_id, botUsername: botusername });
        if (usernameExistCheck) {
            await sendAlert(bottoken, tg_id, `❌ Failed: Aap is bot (@${botusername}) par pehle se verified hain.`);
            return res.status(400).json({ status: 'fail', message: 'You are already verified on this bot!' });
        }

        // 3. SUCCESS: Sab clear hai toh save karo database me permanent
        const newUser = new User({
            tgId: tg_id,
            botUsername: botusername,
            deviceKey: finalDeviceKey,
            ip: ip
        });
        await newUser.save();

        // Bot par instantly log alert bhejna
        await sendAlert(bottoken, tg_id, `✅ Verified Successfully!\n\n👤 Name: ${name}\n🆔 ID: ${tg_id}\n🤖 Bot: @${botusername}\n🌐 IP: ${ip}\n🔒 Hardware Database Locked.`);

        return res.status(200).json({ status: 'pass', message: 'Verification Successful' });

    } catch (err) {
        console.error("Database Save Error:", err);
        return res.status(500).json({ status: 'fail', message: 'Database processing error' });
    }
});

module.exports = app;
