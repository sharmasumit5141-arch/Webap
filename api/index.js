// api/index.js

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
const mongoURI = "mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 8000
}).catch((err) => {
    console.log("❌ DB Initial Connection Blocked:", err.message);
});

mongoose.connection.on('connected', () => {
    console.log("💾 MongoDB Connected Successfully");
});

/* =========================
SCHEMA (FAIL + PASS TRACK)
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
    reason: String,
    createdAt: { type: Date, default: Date.now }
});

userSchema.index({ tgId: 1, botUsername: 1 }, { unique: true });

const User = mongoose.models.VerifiedUser || mongoose.model('VerifiedUser', userSchema);

/* =========================
SAFE TELEGRAM ALERT (NON-BLOCKING)
========================= */
function sendAlert(token, chatId, text) {
    // Fire and forget mechanism to avoid network blocking
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        })
    }).catch(() => {});
}

/* =========================
BACKGROUND DATA SAVER (NON-BLOCKING)
========================= */
function saveUserLog(tgId, botUsername, deviceKey, ip, status, reason) {
    User.updateOne(
        { tgId: tgId, botUsername: botUsername },
        {
            $set: {
                tgId,
                botUsername,
                deviceKey,
                ip,
                status,
                reason,
                createdAt: new Date()
            }
        },
        { upsert: true }
    ).catch((err) => {
        console.log("Background DB Sync Prevented Crash:", err.message);
    });
}

/* =========================
VPN CHECK SAFE (FAST)
========================= */
async function checkVPN(ip) {
    try {
        if (!ip || ip === "0.0.0.0" || ip === "UNKNOWN") return false;
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=proxy,hosting`);
        const data = await res.json();
        return Boolean(data.proxy || data.hosting);
    } catch {
        return false;
    }
}

/* =========================
MAIN API (NO CRASH SYSTEM)
========================= */
app.get('/api', async (req, res) => {
    try {
        // FIXED: Variabled extracted cleanly to avoid casing mismatch crash
        const { botusername, bottoken, tg_id, browser_id } = req.query;

        /* VALIDATION SAFE */
        if (!botusername || !bottoken || !tg_id || !browser_id) {
            return res.json({
                status: "fail",
                message: "Missing Parameters"
            });
        }

        /* IP SAFE RESOLUTION */
        let ip = "0.0.0.0";
        try {
            ip = req.clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress || "0.0.0.0";
            if (ip.includes(',')) {
                ip = ip.split(',')[0].trim(); // Proxy clean routing arrays split
            }
        } catch {}

        const deviceKey = `${ip}_${browser_id}`;

        /* 🔥 VPN SCAN STARTED IN PARALLEL BACKGROUND */
        const vpnPromise = checkVPN(ip);

        /* =========================
        FIND USER SAFE (FIXED VARIABLES MAPPING)
        ========================= */
        let user = null;
        try {
            user = await User.findOne({ tgId: tg_id, botUsername: botusername });
        } catch (dbErr) {
            console.log("DB lookup skipped, connection volatile:", dbErr.message);
        }

        /* ❌ BLOCK FAILED USERS */
        if (user && user.status === "fail") {
            return res.json({
                status: "fail",
                message: "❌ Permanently Blocked"
            });
        }

        /* ✅ ALREADY VERIFIED */
        if (user && user.status === "pass") {
            // Re-send alert background without blocking loop
            sendAlert(bottoken, tg_id, `🔄 <b>ALREADY VERIFIED</b>\n🟢 Session Restored Securely.`);
            return res.json({
                status: "pass",
                message: "Already Verified"
            });
        }

        /* =========================
        DEVICE BLOCK DETECTION (FIXED KEY)
        ========================= */
        let conflict = null;
        try {
            conflict = await User.findOne({
                deviceKey,
                botUsername: botusername,
                tgId: { $ne: tg_id },
                status: "pass" // Match only valid accounts to minimize false flags
            });
        } catch {}

        if (conflict) {
            // Database logger working independently async
            saveUserLog(tg_id, botusername, deviceKey, ip, "fail", "Device already used");
            
            sendAlert(bottoken, tg_id, "🚫 <b>ACCESS DENIED</b>\n❌ Multi-Account Device Key Matching.");

            return res.json({
                status: "fail",
                message: "Device already used"
            });
        }

        /* =========================
        EVALUATE PIPELINE RESULTS
        ========================= */
        const vpnDetected = await vpnPromise;
        if (vpnDetected) {
            sendAlert(bottoken, tg_id, "⚠️ <b>VPN DETECTED</b>\nRouting connection inside a proxy framework.");
        }

        /* =========================
        SUCCESS PROCESSING & DISPATCH
        ========================= */
        // DB save processes silently down the stack background pipeline
        saveUserLog(tg_id, botusername, deviceKey, ip, "pass", "");

        /* INSTANT RESPONSE ALERT */
        sendAlert(
            bottoken, 
            tg_id, 
            `🎉 <b>VERIFIED SUCCESS</b>\n━━━━━━━━━━━━\n🟢 Access Synchronized Securely.\n📍 <b>IP:</b> ${ip}`
        );

        return res.json({
            status: "pass",
            message: "Verified Successfully"
        });

    } catch (err) {
        console.log("CRASH INTERCEPTED OK:", err.message);

        // Fail-safe default response to stop loop hang or infinite busy message
        return res.json({
            status: "fail",
            message: "System busy. Reload your Gateway browser link."
        });
    }
});

/* =========================
EXPORT
========================= */
module.exports = app;
        
