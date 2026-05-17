const express = require('express');
const fetch = require('node-fetch');
const requestIp = require('request-ip');
const mongoose = require('mongoose');

const app = express();

app.use(express.json());
app.use(requestIp.mw());

/* =========================
   ROOT
========================= */

app.get('/', (req, res) => {
    res.send("🚀 API Running Safe Mode");
});

/* =========================
   MONGODB
========================= */

const mongoURI =
"mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 10000
}).catch(() => {});

mongoose.connection.on('connected', () => {
    console.log("💾 MongoDB Connected");
});

mongoose.connection.on('error', (err) => {
    console.log("❌ MongoDB Error:", err.message);
});

/* =========================
   USER SCHEMA
========================= */

const userSchema = new mongoose.Schema({
    tgId: String,
    botUsername: String,
    deviceKey: String,
    ip: String,
    vpn: Boolean,
    createdAt: { type: Date, default: Date.now }
});

userSchema.index({ tgId: 1, botUsername: 1 });

const User =
mongoose.models.VerifiedUser ||
mongoose.model('VerifiedUser', userSchema);

/* =========================
   LOCK SCHEMA (ANTI RETRY BUG FIX)
========================= */

const lockSchema = new mongoose.Schema({
    deviceKey: String,
    botUsername: String,
    status: { type: String, default: "pending" },
    createdAt: { type: Date, default: Date.now }
});

lockSchema.index({ deviceKey: 1, botUsername: 1 }, { unique: true });

const Lock =
mongoose.models.VerifyLock ||
mongoose.model('VerifyLock', lockSchema);

/* =========================
   ALERT SAFE
========================= */

async function sendAlert(token, chatId, text) {
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text })
        });
    } catch (e) {}
}

/* =========================
   VPN CHECK (SAFE)
========================= */

async function checkIP(ip) {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=proxy,hosting`);
        const data = await res.json();

        return {
            vpn: data.proxy || data.hosting || false
        };
    } catch {
        return { vpn: false };
    }
}

/* =========================
   MAIN API
========================= */

app.get('/api', async (req, res) => {

    try {

        const { botusername, bottoken, tg_id, browser_id } = req.query;

        if (!botusername || !bottoken || !tg_id || !browser_id) {
            return res.status(400).json({
                status: 'fail',
                message: 'Missing Parameters'
            });
        }

        const ip =
            req.clientIp ||
            req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress ||
            "0.0.0.0";

        const deviceKey = `${ip}_${browser_id}`;

        /* =========================
           STEP 1: LOCK SYSTEM (ANTI RETRY BUG)
        ========================= */

        try {
            await Lock.findOneAndUpdate(
                { deviceKey, botUsername: botusername },
                { $setOnInsert: { deviceKey, botUsername: botusername } },
                { upsert: true, new: true }
            );
        } catch (e) {}

        /* =========================
           STEP 2: CHECK EXISTING USER (STRICT)
        ========================= */

        const exists = await User.findOne({
            botUsername: botusername,
            deviceKey: deviceKey
        });

        if (exists) {
            return res.json({
                status: 'pass',
                message: '✅ Already Verified'
            });
        }

        /* =========================
           STEP 3: VPN CHECK (OPTIONAL SAFE)
        ========================= */

        const ipData = await checkIP(ip);

        if (ipData.vpn) {
            try {
                await sendAlert(
                    bottoken,
                    tg_id,
                    "⚠️ VPN DETECTED"
                );
            } catch {}
        }

        /* =========================
           STEP 4: SAVE USER (CRASH FREE)
        ========================= */

        try {
            await User.create({
                tgId: tg_id,
                botUsername: botusername,
                deviceKey,
                ip,
                vpn: ipData.vpn
            });
        } catch (e) {
            // ignore duplicate crash
        }

        /* =========================
           SUCCESS ALERT
        ========================= */

        try {
            await sendAlert(
                bottoken,
                tg_id,
                "🎉 USER VERIFIED SUCCESSFULLY"
            );
        } catch {}

        return res.json({
            status: 'pass',
            message: '🎉 User Verified Successfully'
        });

    } catch (err) {

        console.log("ERROR:", err.message);

        return res.json({
            status: 'fail',
            message: '⚠️ Please verify again'
        });
    }
});

/* =========================
   EXPORT
========================= */

module.exports = app;
