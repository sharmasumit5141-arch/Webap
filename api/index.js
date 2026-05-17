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
   MONGODB
========================= */
const mongoURI =
"mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 10000
});

mongoose.connection.on('connected', () => {
    console.log("💾 MongoDB Connected");
});

/* =========================
   MODEL
========================= */
const userSchema = new mongoose.Schema({
    tgId: String,
    botUsername: String,
    deviceKey: String,
    ip: String,
    vpn: Boolean,
    createdAt: { type: Date, default: Date.now }
});

userSchema.index({ tgId: 1, botUsername: 1 }, { unique: true });

const User =
mongoose.models.VerifiedUser ||
mongoose.model('VerifiedUser', userSchema);

/* =========================
   ALERT (ADMIN SAFE)
========================= */
const ADMIN_CHAT_ID = "YOUR_ADMIN_CHAT_ID"; // 👈 CHANGE THIS

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
        console.log("Telegram error:", e.message);
    }
}

/* =========================
   IP CHECK (SAFE)
========================= */
async function checkIP(ip) {
    try {
        const res = await fetch(
            `http://ip-api.com/json/${ip}?fields=proxy,hosting,isp,country`
        );
        const data = await res.json();

        return {
            vpn: Boolean(data.proxy || data.hosting),
            isp: data.isp || "UNKNOWN",
            country: data.country || "UNKNOWN"
        };
    } catch {
        return {
            vpn: false,
            isp: "UNKNOWN",
            country: "UNKNOWN"
        };
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
                status: 'fail',
                message: '⚠️ Missing parameters'
            });
        }

        const ip =
            req.clientIp ||
            req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress ||
            "0.0.0.0";

        const deviceKey = `${ip}_${browser_id}`;

        /* =========================
           VPN CHECK (NO HARD BLOCK)
        ========================= */
        const ipData = await checkIP(ip);

        // ⚠️ VPN detected → warning only (NO fake fail)
        let vpnFlag = ipData.vpn || false;

        /* =========================
           MULTI DEVICE CHECK
        ========================= */
        const deviceConflict = await User.findOne({
            deviceKey,
            botUsername,
            tgId: { $ne: tg_id }
        });

        if (deviceConflict) {
            return res.json({
                status: 'fail',
                message: '🚫 Device already used'
            });
        }

        /* =========================
           ALREADY VERIFIED
        ========================= */
        const existing = await User.findOne({
            tgId: tg_id,
            botUsername
        });

        if (existing) {
            return res.json({
                status: 'pass',
                message: '✅ Already Verified'
            });
        }

        /* =========================
           SAVE USER (SAFE UPSERT)
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
                        vpn: vpnFlag,
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );
        } catch (e) {
            console.log("DB error:", e.message);
        }

        /* =========================
           ALERT ONLY ADMIN (FIXED)
        ========================= */
        try {
            await sendAlert(
                bottoken,
                ADMIN_CHAT_ID,
                `🎉 VERIFIED USER\n\nID: ${tg_id}\nBOT: @${botusername}\nVPN: ${vpnFlag ? "YES" : "NO"}`
            );
        } catch {}

        /* =========================
           RESPONSE SUCCESS
        ========================= */
        return res.json({
            status: 'pass',
            message: vpnFlag
                ? '⚠️ Verified (VPN detected but allowed)'
                : '🎉 User Verified Successfully'
        });

    } catch (err) {

        console.log("ERROR:", err.message);

        return res.json({
            status: 'fail',
            message: '⚠️ Please try again'
        });
    }
});

module.exports = app;
