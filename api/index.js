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
    res.send("🚀 Secure Multi-Bot API Running");
});

/* =========================
   DB CONNECT
========================= */
const mongoURI =
"mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 10000
}).catch(() => {});

mongoose.connection.on('connected', () => {
    console.log("💾 Mongo Connected");
});

/* =========================
   USER MODEL
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
   ALERT SAFE
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
   VPN CHECK (STRONGER)
========================= */
async function checkIP(ip) {
    try {
        const res = await fetch(
            `http://ip-api.com/json/${ip}?fields=status,proxy,hosting,isp,org,country`
        );
        const data = await res.json();

        return {
            vpn:
                data.proxy ||
                data.hosting ||
                (data.org && (
                    data.org.toLowerCase().includes("vpn") ||
                    data.org.toLowerCase().includes("proxy") ||
                    data.org.toLowerCase().includes("hosting")
                )),

            isp: data.isp || "UNKNOWN",
            country: data.country || "UNKNOWN"
        };

    } catch {
        return {
            vpn: false,
            isp: "UNKNOWN",
            country: "UNKNOWN"
        };
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
           🔥 VPN BLOCK (HARD LAYER)
        ========================= */
        const ipData = await checkIP(ip);

        if (ipData.vpn) {
            return res.json({
                status: 'fail',
                message: '🚫 VPN/Proxy Detected. Please disable VPN and try again.'
            });
        }

        /* =========================
           DEVICE CONFLICT (BOT SAFE)
        ========================= */
        const deviceConflict = await User.findOne({
            botUsername,
            deviceKey,
            tgId: { $ne: tg_id }
        });

        if (deviceConflict) {
            return res.json({
                status: 'fail',
                message: '🚫 This device already used in this bot'
            });
        }

        /* =========================
           EXISTING USER CHECK
        ========================= */
        const existing = await User.findOne({
            tgId: tg_id,
            botUsername
        });

        if (existing) {
            return res.json({
                status: 'pass',
                message: '✅ Already Verified'
            });
        }

        /* =========================
           SAVE USER SAFE
        ========================= */
        try {
            await User.updateOne(
                { tgId: tg_id, botUsername },
                {
                    $setOnInsert: {
                        tgId: tg_id,
                        botUsername,
                        deviceKey,
                        ip,
                        vpn: false,
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );
        } catch {}

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
            message: '🎉 Verified Successfully'
        });

    } catch (err) {

        console.log("ERROR:", err.message);

        return res.json({
            status: 'fail',
            message: '⚠️ Please try again'
        });
    }
});

module.exports = app;
