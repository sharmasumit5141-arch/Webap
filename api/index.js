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
VPN CHECK PROMISE (SILENT BACKGROUND)
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
MAIN API (STRICT VERIFICATION LAYER)
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
        CRITICAL STEP 1: STRICT USER STATE LOOKUP
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

        /* ✅ CASE 2: ALREADY VERIFIED (Instant Restore) */
        if (user && user.status === "pass") {
            await sendAlert(bottoken, tg_id, `🔄 <b>ALREADY VERIFIED</b>\n🟢 Session Restored Securely.`);
            return res.json({ status: "pass", message: "Already Verified" });
        }

        /* =========================
        🔒 CRITICAL STEP 2: HARD DEVICE LOCK CHECK (AWAIT MANDATORY)
        ========================= */
        let conflict = null;
        try {
            // Strict Await lagaya taaki bypass karne ka rasta 100% band ho jaye
            conflict = await User.findOne({
                deviceKey: deviceKey,
                botUsername: botusername,
                tgId: { $ne: tg_id },
                status: "pass" 
            });
        } catch (err) {
            console.log("Conflict tracking error:", err.message);
        }

        /* ❌ CASE 3: MULTI-ACCOUNT FINGERPRINT MATCHED -> HARD BLOCK */
        if (conflict) {
            // Pehle database me fail status confirm write karenge, fir block karenge
            await saveUserLog(tg_id, botusername, deviceKey, ip, "fail", "Device already used");
            await sendAlert(bottoken, tg_id, `🚫 <b>ACCESS DENIED</b>\n❌ Multi-Account Device Key Matching.\n🆔 <b>ID:</b> <code>${tg_id}</code>\n🖥️ <b>FP:</b> <code>${browser_id}</code>`);
            
            return res.json({ 
                status: "fail", 
                message: "Device already used" 
            });
        }

        /* =========================
        🎉 CASE 4: FRESH SUCCESS GATEWAY DISPATCH
        ========================= */
        
        // 1. Data ko securely save aur alert ko push karenge parallel me
        await Promise.all([
            saveUserLog(tg_id, botusername, deviceKey, ip, "pass", ""),
            sendAlert(
                bottoken, 
                tg_id, 
                `🎉 <b>VERIFIED SUCCESS</b>\n━━━━━━━━━━━━\n🟢 Access Synchronized Securely.\n🆔 <b>ID:</b> <code>${tg_id}</code>\n🖥️ <b>FP:</b> <code>${browser_id}</code>\n📍 <b>IP:</b> ${ip}`
            )
        ]);

        // 2. Silent background VPN scanner hook
        triggerVpnCheck(ip, bottoken, tg_id);

        // 3. Send final success response to HTML Frontend
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
