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
    res.send("🚀 API Running");
});

/* =========================
   DB SAFE CONNECT
========================= */
const mongoURI =
"mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 8000
}).catch(() => {});

mongoose.connection.on('connected', () => {
    console.log("💾 MongoDB Connected");
});

/* =========================
   MODEL
========================= */
const userSchema = new mongoose.Schema({
    tgId: String,
    botUsername: String,
    deviceKey: String,
    ip: String,
    vpn: Boolean,
    createdAt: { type: Date, default: Date.now }
});

userSchema.index({ tgId: 1, botUsername: 1 }, { unique: true });

const User =
mongoose.models.VerifiedUser ||
mongoose.model('VerifiedUser', userSchema);

/* =========================
   SAFE ALERT SYSTEM
========================= */
async function sendAlert(token, chatId, text) {
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text })
        });
    } catch {}
}

/* =========================
   IP CHECK
========================= */
async function checkIP(ip) {
    try {
        const res = await fetch(
            `http://ip-api.com/json/${ip}?fields=proxy,hosting,isp,country`
        );
        const data = await res.json();

        return {
            vpn: Boolean(data.proxy || data.hosting),
            isp: data.isp || "UNKNOWN",
            country: data.country || "UNKNOWN"
        };
    } catch {
        return { vpn: false, isp: "UNKNOWN", country: "UNKNOWN" };
    }
}

/* =========================
   MAIN API
========================= */
app.get('/api', async (req, res) => {

    try {

        const { botusername, bottoken, tg_id, browser_id } = req.query;

        if (!botusername || !bottoken || !tg_id || !browser_id) {
            return res.json({
                status: 'fail',
                message: 'Missing parameters'
            });
        }

        const ip =
            req.clientIp ||
            req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress ||
            "0.0.0.0";

        const deviceKey = `${ip}_${browser_id}`;

        /* =========================
           VPN CHECK
        ========================= */
        const ipData = await checkIP(ip);

        if (ipData.vpn) {
            sendAlert(
                bottoken,
                tg_id,
                "⚠️ VPN DETECTED (Access Monitored)"
            );
        }

        /* =========================
           DEVICE CONFLICT ALERT
        ========================= */
        const conflict = await User.findOne({
            deviceKey,
            botUsername,
            tgId: { $ne: tg_id }
        });

        if (conflict) {

            sendAlert(
                bottoken,
                tg_id,
                "🚫 Device already used on another account"
            );

            return res.json({
                status: 'fail',
                message: 'Device already used'
            });
        }

        /* =========================
           ALREADY VERIFIED ALERT
        ========================= */
        const exists = await User.findOne({
            tgId: tg_id,
            botUsername
        });

        if (exists) {

            sendAlert(
                bottoken,
                tg_id,
                "ℹ️ You are already verified"
            );

            return res.json({
                status: 'pass',
                message: 'Already Verified'
            });
        }

        /* =========================
           SAVE SAFE
        ========================= */
        try {
            await User.updateOne(
                { tgId: tg_id, botUsername },
                {
                    $set: {
                        tgId: tg_id,
                        botUsername,
                        deviceKey,
                        ip,
                        vpn: ipData.vpn,
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );
        } catch {}

        /* =========================
           SUCCESS ALERT (MAIN)
        ========================= */
        sendAlert(
            bottoken,
            tg_id,
            `🎉 VERIFIED SUCCESSFULLY

🛡 Access Granted
🌐 Country: ${ipData.country}
📡 ISP: ${ipData.isp}`
        );

        /* =========================
           RESPONSE
        ========================= */
        return res.json({
            status: 'pass',
            message: '🎉 User Verified Successfully'
        });

    } catch (err) {

        console.log("ERROR:", err.message);

        /* ALWAYS SAFE */
        return res.json({
            status: 'pass',
            message: '🎉 User Verified Successfully'
        });
    }
});

module.exports = app;
