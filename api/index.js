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
SAFE TELEGRAM ALERT PROMISE
========================= */
function sendAlert(token, chatId, text) {
    // Return promise taaki process terminate hone se pehle hit secure ho jaye
    return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        })
    }).catch((err) => { console.log("Telegram Dispatch Error:", err.message); });
}

/* =========================
BACKGROUND DATA SAVER PROMISE
========================= */
function saveUserLog(tgId, botUsername, deviceKey, ip, status, reason) {
    return User.updateOne(
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
        console.log("Background DB Sync Error:", err.message);
    });
}

/* =========================
VPN CHECK PROMISE (FAST & ISOLATED)
========================= */
async function triggerVpnCheck(ip, bottoken, tg_id) {
    try {
        if (!ip || ip === "0.0.0.0" || ip === "UNKNOWN") return;
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=proxy,hosting`);
        const data = await res.json();
        if (data.proxy || data.hosting) {
            await sendAlert(bottoken, tg_id, `⚠️ <b>VPN DETECTED</b>\nRouting connection inside a proxy framework for ID: <code>${tg_id}</code>`);
        }
    } catch {}
}

/* =========================
MAIN API (PARALLEL NON-BLOCKING PIPELINE)
========================= */
app.get('/api', async (req, res) => {
    try {
        const { botusername, bottoken, tg_id, browser_id } = req.query;

        /* VALIDATION SAFE */
        if (!botusername || !bottoken || !tg_id || !browser_id) {
            return res.json({ status: "fail", message: "Missing Parameters" });
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

        /* ❌ CASE 1: PERMANENTLY BLOCKED USERS */
        if (user && user.status === "fail") {
            return res.json({ status: "fail", message: "❌ Permanently Blocked" });
        }

        /* ✅ CASE 2: ALREADY VERIFIED */
        if (user && user.status === "pass") {
            // Wait only for telegram message confirmation to avoid thread cut
            await sendAlert(bottoken, tg_id, `🔄 <b>ALREADY VERIFIED</b>\n🟢 Session Restored Securely.`);
            return res.json({ status: "pass", message: "Already Verified" });
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
            // Wait for DB log and Telegram block message in parallel before shutting down request
            await Promise.all([
                saveUserLog(tg_id, botusername, deviceKey, ip, "fail", "Device already used"),
                sendAlert(bottoken, tg_id, `🚫 <b>ACCESS DENIED</b>\n❌ Multi-Account Device Key Matching.\n🆔 <b>ID:</b> <code>${tg_id}</code>`)
            ]);

            return res.json({ status: "fail", message: "Device already used" });
        }

        /* =========================
        🎉 CASE 4: SUCCESS GATEWAY DISPATCH (PARALLEL ACTION)
        ========================= */
        
        // Dono heavy tasks ko ek saath parallel me execute karenge (Saves 50% process time)
        await Promise.all([
            saveUserLog(tg_id, botusername, deviceKey, ip, "pass", ""),
            sendAlert(
                bottoken, 
                tg_id, 
                `🎉 <b>VERIFIED SUCCESS</b>\n━━━━━━━━━━━━\n🟢 Access Synchronized Securely.\n🆔 <b>ID:</b> <code>${tg_id}</code>\n🖥️ <b>FP:</b> <code>${browser_id}</code>\n📍 <b>IP:</b> ${ip}`
            )
        ]);

        // VPN dynamic function fires silently just before sending the response
        triggerVpnCheck(ip, bottoken, tg_id);

        // Instant response back to UI to load the pass screen
        return res.json({
            status: "pass",
            message: "Verified Successfully"
        });

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
            
