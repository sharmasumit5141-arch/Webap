// api/index.js

const express = require('express');
const fetch = require('node-fetch');
const requestIp = require('request-ip');
const mongoose = require('mongoose');

const app = express();

/* =========================
MIDDLEWARE
========================= */

app.use(express.json());
app.use(requestIp.mw());

/* =========================
ROOT
========================= */

app.get('/', (req, res) => {
    res.send("🚀 API Running");
});

/* =========================
MONGODB
========================= */

const mongoURI = "mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 8000
});

mongoose.connection.on('connected', () => {
    console.log("💾 MongoDB Connected");
});

mongoose.connection.on('error', (err) => {
    console.log("❌ MongoDB Error:", err);
});

/* =========================
SCHEMA
========================= */

const userSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botUsername: { type: String, required: true },
    deviceKey: { type: String, required: true },
    ip: { type: String },
    vpn: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

userSchema.index(
    { tgId: 1, botUsername: 1 },
    { unique: true }
);

const User = mongoose.models.VerifiedUser || mongoose.model('VerifiedUser', userSchema);

/* =========================
FAST TELEGRAM ALERT (NON-BLOCKING)
========================= */

function sendAlert(token, chatId, text) {
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            disable_notification: false
        })
    }).catch(() => {}); // Fire and forget
}

/* =========================
VPN CHECK (FAST)
========================= */

async function checkIP(ip) {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=proxy,hosting`);
        const data = await res.json();
        return {
            vpn: data.proxy || data.hosting || false
        };
    } catch (e) {
        return { vpn: false };
    }
}

/* =========================
MAIN API (ULTRA FAST)
========================= */

app.get('/api', async (req, res) => {
    try {
        const { botusername, bottoken, tg_id, browser_id } = req.query;

        if (!botusername || !bottoken || !tg_id || !browser_id) {
            return res.status(200).json({
                status: 'fail',
                message: 'Missing Parameters'
            });
        }

        /* IP RESOLUTION */
        const ip = req.clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress || "UNKNOWN";
        const deviceKey = `${ip}_${browser_id}`;

        /* 🔥 START VPN CHECK IN PARALLEL */
        const ipPromise = checkIP(ip);

        /* 🔍 SECURITY CHECK 1: ALREADY VERIFIED */
        const alreadyVerified = await User.findOne({
            tgId: tg_id,
            botUsername: botusername
        });

        if (alreadyVerified) {
            // Send instant alert for repeat/re-entry access
            sendAlert(
                bottoken, 
                tg_id, 
                `🔄 <b>ALREADY VERIFIED</b>\n━━━━━━━━━━━━\n🟢 Welcome Back\n⚡ Instant Session Restored`
            );

            return res.status(200).json({
                status: 'pass',
                message: 'Already Verified'
            });
        }

        /* 🔍 SECURITY CHECK 2: MULTI-ACCOUNT DETECTION */
        const multiAccount = await User.findOne({
            deviceKey,
            botUsername: botusername,
            tgId: { $ne: tg_id }
        });

        if (multiAccount) {
            sendAlert(
                bottoken, 
                tg_id, 
                `🚫 <b>SECURITY ALERT</b>\n━━━━━━━━━━━━\n❌ <b>Multiple Account Detected</b>\n⚠️ Verification Access Denied`
            );

            return res.status(200).json({
                status: 'fail',
                message: 'Multiple Account Detected'
            });
        }

        /* 🔍 SECURITY CHECK 3: VPN EVALUATION */
        const ipData = await ipPromise;

        if (ipData.vpn) {
            sendAlert(
                bottoken, 
                tg_id, 
                `⚠️ <b>VPN DETECTED</b>\n━━━━━━━━━━━━\n⚙️ Connection Routing via Proxy/Hosting\n⚡ Continuing verification...`
            );
        }

        /* 🔥 INSTANT SUCCESS TELEGRAM ALERT */
        // Fired immediately before DB writes or network responses to maximize speed
        sendAlert(
            bottoken,
            tg_id,
            `🎉 <b>VERIFIED SUCCESSFULLY</b>\n━━━━━━━━━━━━\n🟢 <b>Access Granted</b>\n⚡ Instant System Active\n📍 <b>IP:</b> ${ip}\n🛡️ <b>VPN:</b> ${ipData.vpn ? 'Yes' : 'No'}`
        );

        /* SAVE USER TO DB (ASYNC & BACKGROUND - DOES NOT BLOCK RESPONSE) */
        User.updateOne(
            { tgId: tg_id, botUsername: botusername },
            {
                $set: {
                    tgId: tg_id,
                    botUsername: botusername,
                    deviceKey,
                    ip,
                    vpn: ipData.vpn,
                    createdAt: new Date()
                }
            },
            { upsert: true }
        ).catch((dbErr) => {
            console.error("Background DB Save Error:", dbErr);
        });

        /* IMMEDIATE API RESPONSE */
        return res.status(200).json({
            status: 'pass',
            message: 'Verified Successfully'
        });

    } catch (err) {
        console.log("ERROR:", err);
        return res.status(200).json({
            status: 'fail',
            message: 'Verification Failed'
        });
    }
});

/* =========================
EXPORT
========================= */

module.exports = app;
    
