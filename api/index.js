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

const mongoURI =
"mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

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

const User =
mongoose.models.VerifiedUser ||
mongoose.model('VerifiedUser', userSchema);

/* =========================
FAST TELEGRAM ALERT (NO WAIT)
========================= */

function sendAlert(token, chatId, text){

    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            disable_notification: false
        })
    }).catch(() => {});
}

/* =========================
VPN CHECK (FAST)
========================= */

async function checkIP(ip){
    try{
        const res = await fetch(
            `http://ip-api.com/json/${ip}?fields=proxy,hosting`
        );
        const data = await res.json();

        return {
            vpn: data.proxy || data.hosting || false
        };

    }catch(e){
        return { vpn: false };
    }
}

/* =========================
MAIN API (ULTRA FAST)
========================= */

app.get('/api', async (req, res) => {

try{

    const { botusername, bottoken, tg_id, browser_id } = req.query;

    if(!botusername || !bottoken || !tg_id || !browser_id){
        return res.status(200).json({
            status: 'fail',
            message: 'Missing Parameters'
        });
    }

    /* IP */
    const ip =
        req.clientIp ||
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        "UNKNOWN";

    const deviceKey = `${ip}_${browser_id}`;

    /* 🔥 VPN CHECK PARALLEL */
    const ipPromise = checkIP(ip);

    /* DB CHECK */
    const alreadyVerified = await User.findOne({
        tgId: tg_id,
        botUsername: botusername
    });

    if(alreadyVerified){
        return res.status(200).json({
            status: 'pass',
            message: 'Already Verified'
        });
    }

    const multiAccount = await User.findOne({
        deviceKey,
        botUsername: botusername,
        tgId: { $ne: tg_id }
    });

    if(multiAccount){
        sendAlert(bottoken, tg_id, "🚫 MULTIPLE ACCOUNT DETECTED");

        return res.status(200).json({
            status: 'fail',
            message: 'Multiple Account Detected'
        });
    }

    const ipData = await ipPromise;

    if(ipData.vpn){
        sendAlert(bottoken, tg_id, "⚠️ VPN DETECTED");
    }

    /* SAVE USER (NON BLOCKING) */
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
    ).catch(() => {});

    /* 🔥 INSTANT SUCCESS ALERT */
    sendAlert(
        bottoken,
        tg_id,
`🎉 VERIFIED SUCCESS
━━━━━━━━━━━━
🟢 Access Granted
⚡ Instant System Active`
    );

    /* RESPONSE FAST */
    return res.status(200).json({
        status: 'pass',
        message: 'Verified Successfully'
    });

}catch(err){

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
