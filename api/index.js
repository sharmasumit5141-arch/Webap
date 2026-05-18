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
   DB CONNECT
========================= */
const mongoURI =
"mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 8000
}).catch(()=>{});

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
        enum: ["failed", "verified"],
        default: "verified"
    },

    createdAt: { type: Date, default: Date.now }
});

userSchema.index({ tgId: 1, botUsername: 1 }, { unique: true });

const User =
mongoose.models.VerifiedUser ||
mongoose.model('VerifiedUser', userSchema);

/* =========================
   SAFE TELEGRAM ALERT (NON-BLOCKING)
========================= */
async function sendAlert(token, chatId, text) {

    try {

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000); // 2 sec limit

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

    } catch (e) {
        // ❌ NEVER FAIL API IF TG BLOCKS
        console.log("TG Alert skipped");
    }
}

/* =========================
   VPN CHECK (FREE API SAFE)
========================= */
async function checkVPN(ip) {

    try {

        const res = await fetch(
            `http://ip-api.com/json/${ip}?fields=proxy,hosting`
        );

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

        if (!botusername || !bottoken || !tg_id || !browser_id) {
            return res.json({
                status: "fail",
                message: "Missing Parameters"
            });
        }

        const ip =
            req.clientIp ||
            req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress ||
            "0.0.0.0";

        const deviceKey = `${ip}_${browser_id}`;

        /* =========================
           VPN DETECTION
        ========================= */
        const vpn = await checkVPN(ip);

        if (vpn) {
            return res.json({
                status: "fail",
                message: "❌ VPN/Proxy Detected"
            });
        }

        /* =========================
           FIND USER
        ========================= */
        let user = await User.findOne({ tgId: tg_id, botUsername });

        if (user && user.status === "failed") {
            return res.json({
                status: "fail",
                message: "❌ Access Denied (Previously Failed)"
            });
        }

        if (user && user.status === "verified") {
            return res.json({
                status: "pass",
                message: "🎉 Already Verified"
            });
        }

        /* =========================
           VERIFY LOGIC
        ========================= */
        const isSuccess = true; // real logic here

        if (!isSuccess) {

            await User.create({
                tgId: tg_id,
                botUsername,
                deviceKey,
                ip,
                vpn: false,
                status: "failed"
            });

            return res.json({
                status: "fail",
                message: "❌ Verification Failed"
            });
        }

        /* =========================
           SAVE VERIFIED
        ========================= */
        await User.updateOne(
            { tgId: tg_id, botUsername },
            {
                $set: {
                    tgId: tg_id,
                    botUsername,
                    deviceKey,
                    ip,
                    vpn: false,
                    status: "verified",
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );

        /* =========================
           SAFE ALERT (NON BLOCKING)
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
            message: "Server Error"
        });
    }
});

module.exports = app;
