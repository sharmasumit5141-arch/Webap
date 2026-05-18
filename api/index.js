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
SCHEMA (UPDATED FOR FAIL TRACKING)
========================= */

const userSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botUsername: { type: String, required: true },
    deviceKey: { type: String, required: true },
    ip: { type: String },
    vpn: { type: Boolean, default: false },
    status: { type: String, enum: ['pass', 'fail'], default: 'pass' }, // Status track karne ke liye
    reason: { type: String, default: 'Success' }, // Failure ka reason store karne ke liye
    createdAt: { type: Date, default: Date.now }
});

// Unique index sirf tab kaam karega jab dynamic single record manage karna ho.
// Failed attempts multiplex ho sakte hain, isliye index humne strict rakha hai for upsert behavior.
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
BACKGROUND LOG SAVER (NON-BLOCKING)
========================= */

function logToDatabase(tgId, botUsername, deviceKey, ip, vpn, status, reason) {
    User.updateOne(
        { tgId: tgId, botUsername: botUsername },
        {
            $set: {
                tgId,
                botUsername,
                deviceKey,
                ip,
                vpn,
                status,
                reason,
                createdAt: new Date()
            }
        },
        { upsert: true }
    ).catch((dbErr) => {
        console.error("Background DB Log Error:", dbErr);
    });
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
    
    // Fallback variables for logging if parameters are missing
    let ip = "UNKNOWN";
    let deviceKey = "UNKNOWN";
    let current_tg_id = req.query.tg_id || "UNKNOWN_ID";
    let current_bot_user = req.query.botusername || "UNKNOWN_BOT";

    try {
        const { botusername, bottoken, tg_id, browser_id } = req.query;

        /* IP RESOLUTION */
        ip = req.clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress || "UNKNOWN";
        deviceKey = browser_id ? `${ip}_${browser_id}` : `${ip}_UNKNOWN`;

        // 1. MISSING PARAMETERS CHECK
        if (!botusername || !bottoken || !tg_id || !browser_id) {
            logToDatabase(current_tg_id, current_bot_user, deviceKey, ip, false, 'fail', 'Missing Parameters');
            return res.status(200).json({
                status: 'fail',
                message: 'Missing Parameters'
            });
        }

        /* 🔥 START VPN CHECK IN PARALLEL */
        const ipPromise = checkIP(ip);

        /* 🔍 SECURITY CHECK 1: ALREADY VERIFIED */
        const alreadyVerified = await User.findOne({
            tgId: tg_id,
            botUsername: botusername
        });

        if (alreadyVerified && alreadyVerified.status === 'pass') {
            sendAlert(
                bottoken, 
                tg_id, 
                `🔄 <b>ALREADY VERIFIED</b>\n━━━━━━━━━━━━\n🟢 Welcome Back\n⚡ Instant Session Restored`
            );

            // Re-verify updating timestamp in background
            logToDatabase(tg_id, botusername, deviceKey, ip, alreadyVerified.vpn, 'pass', 'Already Verified / Re-entry');

            return res.status(200).json({
                status: 'pass',
                message: 'Already Verified'
            });
        }

        /* 🔍 SECURITY CHECK 2: MULTI-ACCOUNT DETECTION */
        const multiAccount = await User.findOne({
            deviceKey,
            botUsername: botusername,
            tgId: { $ne: tg_id },
            status: 'pass' // Sirf pehle se passed users se match karega
        });

        if (multiAccount) {
            sendAlert(
                bottoken, 
                tg_id, 
                `🚫 <b>SECURITY ALERT</b>\n━━━━━━━━━━━━\n❌ <b>Multiple Account Detected</b>\n⚠️ Verification Access Denied`
            );

            // Save the failure reason to DB instantly
            logToDatabase(tg_id, botusername, deviceKey, ip, false, 'fail', 'Multiple Account Detected');

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
        sendAlert(
            bottoken,
            tg_id,
            `🎉 <b>VERIFIED SUCCESSFULLY</b>\n━━━━━━━━━━━━\n🟢 <b>Access Granted</b>\n⚡ Instant System Active\n📍 <b>IP:</b> ${ip}\n🛡️ <b>VPN:</b> ${ipData.vpn ? 'Yes' : 'No'}`
        );

        /* SAVE SUCCESSFUL USER TO DB (BACKGROUND) */
        logToDatabase(tg_id, botusername, deviceKey, ip, ipData.vpn, 'pass', 'Success');

        /* IMMEDIATE API RESPONSE */
        return res.status(200).json({
            status: 'pass',
            message: 'Verified Successfully'
        });

    } catch (err) {
        console.log("ERROR:", err);

        // Save server/system crash error to DB
        logToDatabase(current_tg_id, current_bot_user, deviceKey, ip, false, 'fail', `Crash Error: ${err.message}`);

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
                          
