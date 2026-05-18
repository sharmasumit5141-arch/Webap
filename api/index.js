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
SAFE TELEGRAM ALERT (NON-BLOCKING ASYNC THREAD)
========================= */
function sendAlert(token, chatId, text) {
    // Standard unawaited background dispatch
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
VPN CHECK & TELEGRAM DISPATCH (⚡ RUNS SILENTLY POST-RESPONSE)
========================= */
async function processBackgroundAnalytics(ip, bottoken, tg_id, statusType, browser_id) {
    try {
        // 1. Send the primary validation status alert first
        if (statusType === "pass") {
            sendAlert(
                bottoken, 
                tg_id, 
                `🎉 <b>VERIFIED SUCCESS</b>\n━━━━━━━━━━━━\n🟢 Access Synchronized Securely.\n🆔 <b>ID:</b> <code>${tg_id}</code>\n🖥️ <b>FP:</b> <code>${browser_id}</code>\n📍 <b>IP:</b> ${ip}`
            );
        } else if (statusType === "conflict") {
            sendAlert(bottoken, tg_id, `🚫 <b>ACCESS DENIED</b>\n❌ Multi-Account Device Key Matching.\n🆔 <b>ID:</b> <code>${tg_id}</code>`);
        }

        // 2. Perform VPN Scan seamlessly in parallel
        if (!ip || ip === "0.0.0.0" || ip === "UNKNOWN") return;
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=proxy,hosting`);
        const data = await res.json();
        
        if (data.proxy || data.hosting) {
            sendAlert(bottoken, tg_id, `⚠️ <b>VPN DETECTED</b>\nRouting connection inside a proxy framework for ID: <code>${tg_id}</code>`);
        }
    } catch {
        // Suppress any background execution anomaly safely
    }
}

/* =========================
MAIN API (LIGHTNING FAST ROUTE)
========================= */
app.get('/api', async (req, res) => {
    try {
        const { botusername, bottoken, tg_id, browser_id } = req.query;

        /* VALIDATION SAFE */
        if (!botusername || !bottoken || !tg_id || !browser_id) {
            return res.json({
                status: "fail",
                message: "Missing Parameters"
            });
        }

        /* IP RESOLUTION */
        let ip = "0.0.0.0";
        try {
            ip = req.clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress || "0.0.0.0";
            if (ip.includes(',')) {
                ip = ip.split(',')[0].trim();
            }
        } catch {}

        const deviceKey = `${browser_id}`;

        /* =========================
        FIND USER SAFE
        ========================= */
        let user = null;
        try {
            user = await User.findOne({ tgId: tg_id, botUsername: botusername });
        } catch (dbErr) {
            console.log("DB lookup skipped:", dbErr.message);
        }

        /* ❌ CASE 1: PERMANENTLY BLOCKED USERS (Instant Return) */
        if (user && user.status === "fail") {
            return res.json({
                status: "fail",
                message: "❌ Permanently Blocked"
            });
        }

        /* ✅ CASE 2: ALREADY VERIFIED (Instant Return + Background Alert) */
        if (user && user.status === "pass") {
            res.json({
                status: "pass",
                message: "Already Verified"
            });
            
            // Post-response trigger execution
            sendAlert(bottoken, tg_id, `🔄 <b>ALREADY VERIFIED</b>\n🟢 Session Restored Securely.`);
            return;
        }

        /* =========================
        STRICT DEVICE BLOCK DETECTION (FINGERPRINT BASED)
        ========================= */
        let conflict = null;
        try {
            conflict = await User.findOne({
                deviceKey,
                botUsername: botusername,
                tgId: { $ne: tg_id },
                status: "pass" 
            });
        } catch {}

        /* ❌ CASE 3: MULTI-ACCOUNT FINGERPRINT DETECTED */
        if (conflict) {
            // Immediate response back to frontend to render access denied screen
            res.json({
                status: "fail",
                message: "Device already used"
            });

            // Log entry and alerts handled by secondary async routine
            saveUserLog(tg_id, botusername, deviceKey, ip, "fail", "Device already used");
            processBackgroundAnalytics(ip, bottoken, tg_id, "conflict", browser_id);
            return;
        }

        /* =========================
        🎉 CASE 4: SUCCESS GATEWAY DISPATCH (IMMEDIATE)
        ========================= */
        
        // 1. Clear JSON Response returned instantly to the UI
        res.json({
            status: "pass",
            message: "Verified Successfully"
        });

        // 2. Heavy operations pushed completely to background stack execution
        saveUserLog(tg_id, botusername, deviceKey, ip, "pass", "");
        processBackgroundAnalytics(ip, bottoken, tg_id, "pass", browser_id);

    } catch (err) {
        console.log("CRASH INTERCEPTED OK:", err.message);

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
