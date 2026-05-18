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
   DB CONNECT (SAFE)
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
   SCHEMA
========================= */
const userSchema = new mongoose.Schema({
    tgId: String,
    botUsername: String,
    deviceKey: String,
    ip: String,
    vpn: Boolean,

    status: {
        type: String,
        enum: ["pass", "fail"],
        default: "pass"
    },

    reason: String,
    createdAt: { type: Date, default: Date.now }
});

userSchema.index({ tgId: 1, botUsername: 1 }, { unique: true });

const User =
mongoose.models.VerifiedUser ||
mongoose.model('VerifiedUser', userSchema);

/* =========================
   SAFE TELEGRAM ALERT (NO CRASH)
========================= */
async function sendAlert(token, chatId, text) {
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text
            })
        });
    } catch (e) {
        // NEVER break API
        console.log("Telegram error ignored");
    }
}

/* =========================
   VPN CHECK
========================= */
async function checkVPN(ip) {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=proxy,hosting`);
        const data = await res.json();
        return Boolean(data.proxy || data.hosting);
    } catch {
        return false;
    }
}

/* =========================
   MAIN API
========================= */
app.get('/api', async (req, res) => {

    try {

        const { botusername, bottoken, tg_id, browser_id } = req.query;

        /* VALIDATION */
        if (!botusername || !bottoken || !tg_id || !browser_id) {
            return res.json({
                status: "fail",
                message: "Missing Parameters"
            });
        }

        /* IP + DEVICE */
        const ip =
            req.clientIp ||
            req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress ||
            "0.0.0.0";

        const deviceKey = `${ip}_${browser_id}`;

        /* =========================
           VPN CHECK
        ========================= */
        const vpn = await checkVPN(ip);

        if (vpn) {
            sendAlert(
                bottoken,
                tg_id,
                "⚠️ VPN / Proxy Detected"
            );
        }

        /* =========================
           FIND USER
        ========================= */
        const user = await User.findOne({
            tgId: tg_id,
            botUsername
        });

        /* ❌ FAILED USER BLOCK */
        if (user && user.status === "fail") {
            return res.json({
                status: "fail",
                message: "❌ Access Denied (Previously Failed)"
            });
        }

        /* ✅ ALREADY VERIFIED */
        if (user && user.status === "pass") {
            return res.json({
                status: "pass",
                message: "🎉 Already Verified"
            });
        }

        /* =========================
           MULTI ACCOUNT CHECK
        ========================= */
        const multi = await User.findOne({
            deviceKey,
            botUsername,
            tgId: { $ne: tg_id }
        });

        if (multi) {

            await User.updateOne(
                { tgId: tg_id, botUsername },
                {
                    $set: {
                        tgId: tg_id,
                        botUsername,
                        deviceKey,
                        ip,
                        vpn,
                        status: "fail",
                        reason: "Multi Account"
                    }
                },
                { upsert: true }
            );

            return res.json({
                status: "fail",
                message: "🚫 Multiple Account Detected"
            });
        }

        /* =========================
           VERIFY SUCCESS
        ========================= */
        await User.updateOne(
            { tgId: tg_id, botUsername },
            {
                $set: {
                    tgId: tg_id,
                    botUsername,
                    deviceKey,
                    ip,
                    vpn,
                    status: "pass",
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );

        /* =========================
           SUCCESS ALERT
        ========================= */
        sendAlert(
            bottoken,
            tg_id,
            "🎉 USER VERIFIED SUCCESSFULLY"
        );

        return res.json({
            status: "pass",
            message: "🎉 User Verified Successfully"
        });

    } catch (err) {

        console.log("ERROR:", err.message);

        return res.json({
            status: "fail",
            message: "Server Busy, Try Again"
        });
    }
});

module.exports = app;
