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
    serverSelectionTimeoutMS: 10000
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
TELEGRAM ALERT
========================= */

async function sendAlert(token, chatId, text){
    try{
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text
            })
        });
    }catch(e){
        console.log("⚠ Telegram Error:", e.message);
    }
}

/* =========================
VPN CHECK
========================= */

async function checkIP(ip){
    try{
        const response = await fetch(
            `http://ip-api.com/json/${ip}?fields=proxy,hosting`
        );
        const data = await response.json();

        return {
            vpn: data.proxy || data.hosting || false
        };

    }catch(e){
        console.log("IP Check Error:", e.message);
        return { vpn: false };
    }
}

/* =========================
MAIN API
========================= */

app.get('/api', async (req, res) => {

try{

    const { botusername, bottoken, tg_id, browser_id } = req.query;

    if(!botusername || !bottoken || !tg_id || !browser_id){
        return res.status(400).json({
            status: 'fail',
            message: '⚠️ Missing Parameters'
        });
    }

    const ip =
        req.clientIp ||
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        "UNKNOWN_IP";

    const finalDeviceKey = `${ip}_${browser_id}`;

    const ipData = await checkIP(ip);

    /* VPN ALERT */
    if(ipData.vpn){
        sendAlert(bottoken, tg_id, "⚠️ VPN DETECTED");
    }

    /* MULTI ACCOUNT CHECK */
    const multiAccountCheck = await User.findOne({
        deviceKey: finalDeviceKey,
        botUsername: botusername,
        tgId: { $ne: tg_id }
    });

    if(multiAccountCheck){
        sendAlert(bottoken, tg_id, "🚫 MULTIPLE ACCOUNT DETECTED");

        return res.status(200).json({
            status: 'fail',
            message: '🚫 Multiple Accounts Detected'
        });
    }

    /* ALREADY VERIFIED */
    const alreadyVerified = await User.findOne({
        tgId: tg_id,
        botUsername: botusername
    });

    if(alreadyVerified){
        return res.status(200).json({
            status: 'pass',
            message: '✅ Already Verified'
        });
    }

    /* SAVE USER */
    try{
        await User.updateOne(
            { tgId: tg_id, botUsername: botusername },
            {
                $set: {
                    tgId: tg_id,
                    botUsername: botusername,
                    deviceKey: finalDeviceKey,
                    ip: ip,
                    vpn: ipData.vpn,
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );

    }catch(saveErr){

        console.log("Save Error:", saveErr);

        // 🔥 DIRECT FAIL
        return res.status(200).json({
            status: 'fail',
            message: '❌ Verification Failed'
        });
    }

    /* SUCCESS ALERT */
    sendAlert(
        bottoken,
        tg_id,
`🎉 USER VERIFIED SUCCESSFULLY`
    );

    return res.status(200).json({
        status: 'pass',
        message: '🎉 User Verified Successfully'
    });

}catch(err){

    console.log("❌ ERROR:", err);

    // 🔥 DIRECT FAIL (NO RETRY MESSAGE)
    return res.status(200).json({
        status: 'fail',
        message: '❌ Verification Failed'
    });
}

});

/* =========================
EXPORT
========================= */

module.exports = app;
