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
   MONGO SAFE CONNECT
========================= */
const mongoURI =
"mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
}).then(() => {
    console.log("💾 MongoDB Connected");
}).catch(err => {
    console.log("⚠ MongoDB offline but API running");
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
        enum: ["verified", "failed"],
        default: "verified"
    },
    createdAt: { type: Date, default: Date.now }
});

userSchema.index({ tgId: 1, botUsername: 1 }, { unique: true });

const User =
mongoose.models.VerifiedUser ||
mongoose.model('VerifiedUser', userSchema);

/* =========================
   SAFE TELEGRAM ALERT (NON BLOCKING)
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
        console.log("TG skipped");
    }
}

/* =========================
   VPN CHECK SAFE
========================= */
async function checkVPN(ip) {
    try {
        const res = await fetch(
            `http://ip-api.com/json/${ip}?fields=proxy,hosting`,
            { timeout: 2000 }
        );

        const data = await res.json();

        return Boolean(data.proxy || data.hosting);

    } catch {
        return false;
    }
}

/* =========================
   MAIN API (NO CRASH GUARANTEE)
========================= */
app.get('/api', async (req, res) => {

    try {

        const { botusername, bottoken, tg_id, browser_id } = req.query;

        if (!botusername || !bottoken || !tg_id || !browser_id) {
            return res.json({
                status: "fail",
                message: "Missing parameters"
            });
        }

        const ip =
            req.clientIp ||
            req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress ||
            "0.0.0.0";

        const deviceKey = `${ip}_${browser_id}`;

        /* =========================
           VPN BLOCK (SAFE)
        ========================= */
        const vpn = await checkVPN(ip);

        if (vpn) {
            return res.json({
                status: "fail",
                message: "VPN / Proxy detected"
            });
        }

        /* =========================
           USER FIND
        ========================= */
        let user = await User.findOne({ tgId: tg_id, botUsername });

        if (user && user.status === "failed") {
            return res.json({
                status: "fail",
                message: "Access denied (previously failed)"
            });
        }

        if (user && user.status === "verified") {
            return res.json({
                status: "pass",
                message: "Already verified"
            });
        }

        /* =========================
           VERIFY LOGIC
        ========================= */
        const isSuccess = true; // replace with real logic

        if (!isSuccess) {

            try {
                await User.create({
                    tgId: tg_id,
                    botUsername,
                    deviceKey,
                    ip,
                    vpn: false,
                    status: "failed"
                });
            } catch {}

            return res.json({
                status: "fail",
                message: "Verification failed"
            });
        }

        /* =========================
           SAVE VERIFIED
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
                        vpn: false,
                        status: "verified",
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );
        } catch (e) {
            console.log("DB skip error");
        }

        /* =========================
           SAFE ALERT (NO BLOCK)
        ========================= */
        sendAlert(
            bottoken,
            tg_id,
            "🎉 USER VERIFIED SUCCESSFULLY"
        );

        /* =========================
           FINAL RESPONSE
        ========================= */
        return res.json({
            status: "pass",
            message: "User verified successfully"
        });

    } catch (err) {

        console.log("CRASH BLOCKED:", err.message);

        return res.json({
            status: "fail",
            message: "Server error, try again"
        });
    }
});

module.exports = app;
