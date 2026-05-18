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
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 10
}).catch(() => {});

mongoose.connection.on('connected', () => {
    console.log("💾 MongoDB Connected");
});

/* =========================
   SCHEMA (FAIL LOCK ENABLED)
========================= */
const userSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botUsername: { type: String, required: true },
    deviceKey: { type: String, required: true },
    ip: String,

    status: {
        type: String,
        enum: ["pass", "fail"],
        default: "pass"
    },

    reason: {
        type: String,
        default: ""
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

userSchema.index({ tgId: 1, botUsername: 1 }, { unique: true });

const User =
mongoose.models.VerifiedUser ||
mongoose.model('VerifiedUser', userSchema);

/* =========================
   TELEGRAM ALERT (NON BLOCK)
========================= */
function sendAlert(token, chatId, text) {
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text
        })
    }).catch(() => {});
}

/* =========================
   VPN CHECK (SAFE)
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

        if (!botusername || !tg_id || !browser_id) {
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
           FIND USER
        ========================= */
        const user = await User.findOne({
            tgId: tg_id,
            botUsername: botusername
        });

        /* =========================
           ❌ PERMANENT FAIL BLOCK
        ========================= */
        if (user && user.status === "fail") {
            return res.json({
                status: "fail",
                message: "❌ Access Denied (Permanent Fail)"
            });
        }

        /* =========================
           ✅ ALREADY PASSED
        ========================= */
        if (user && user.status === "pass") {
            return res.json({
                status: "pass",
                message: "Already Verified"
            });
        }

        /* =========================
           VPN CHECK
        ========================= */
        const vpn = await checkVPN(ip);

        if (vpn) {
            await User.updateOne(
                { tgId: tg_id, botUsername: botusername },
                {
                    $set: {
                        tgId: tg_id,
                        botUsername: botusername,
                        deviceKey,
                        ip,
                        status: "fail",
                        reason: "VPN Detected",
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );

            sendAlert(bottoken, tg_id, "⚠️ VPN DETECTED");

            return res.json({
                status: "fail",
                message: "VPN / Proxy Not Allowed"
            });
        }

        /* =========================
           MULTI ACCOUNT CHECK
        ========================= */
        const multi = await User.findOne({
            deviceKey,
            botUsername: botusername,
            tgId: { $ne: tg_id },
            status: "pass"
        });

        if (multi) {
            await User.updateOne(
                { tgId: tg_id, botUsername: botusername },
                {
                    $set: {
                        tgId: tg_id,
                        botUsername: botusername,
                        deviceKey,
                        ip,
                        status: "fail",
                        reason: "Multi Account Detected",
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );

            sendAlert(bottoken, tg_id, "🚫 MULTIPLE ACCOUNT DETECTED");

            return res.json({
                status: "fail",
                message: "Multiple Account Detected"
            });
        }

        /* =========================
           SUCCESS SAVE
        ========================= */
        await User.updateOne(
            { tgId: tg_id, botUsername: botusername },
            {
                $set: {
                    tgId: tg_id,
                    botUsername: botusername,
                    deviceKey,
                    ip,
                    status: "pass",
                    reason: "Success",
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );

        /* ALERT */
        sendAlert(bottoken, tg_id, "🎉 VERIFIED SUCCESS");

        return res.json({
            status: "pass",
            message: "Verified Successfully"
        });

    } catch (err) {

        console.log("ERROR:", err);

        return res.json({
            status: "fail",
            message: "Server Error"
        });
    }
});

module.exports = app;
