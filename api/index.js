// api/index.js

const express = require('express');
const fetch = require('node-fetch');
const requestIp = require('request-ip');
const mongoose = require('mongoose');

const app = express();

app.use(express.json());
app.use(requestIp.mw());

/* =========================
   DB CONNECT
========================= */
const mongoURI =
"mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 8000
}).catch(()=>{});

mongoose.connection.on('connected', () => {
    console.log("💾 MongoDB Connected");
});

/* =========================
   SCHEMA (WITH STATUS)
========================= */
const userSchema = new mongoose.Schema({
    tgId: String,
    botUsername: String,
    deviceKey: String,
    ip: String,

    status: {
        type: String,
        enum: ["pending", "failed", "verified"],
        default: "pending"
    },

    lastTry: Date,
    createdAt: { type: Date, default: Date.now }
});

userSchema.index({ tgId: 1, botUsername: 1 }, { unique: true });

const User =
mongoose.models.User || mongoose.model('User', userSchema);

/* =========================
   MAIN API
========================= */
app.get('/api', async (req, res) => {

    try {

        const { botusername, bottoken, tg_id, browser_id } = req.query;

        if (!botusername || !bottoken || !tg_id || !browser_id) {
            return res.json({
                status: 'fail',
                message: 'Missing parameters'
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
        let user = await User.findOne({ tgId: tg_id, botUsername });

        /* =========================
           IF FIRST TIME → CREATE FAIL ENTRY FIRST
        ========================= */
        if (!user) {
            user = await User.create({
                tgId: tg_id,
                botUsername,
                deviceKey,
                ip,
                status: "failed",
                lastTry: new Date()
            });
        } else {
            // retry update (important)
            user.deviceKey = deviceKey;
            user.ip = ip;
            user.lastTry = new Date();
        }

        /* =========================
           SIMULATED VERIFICATION LOGIC
        ========================= */

        const isSuccess = true; // <- yaha apna real logic lagana

        if (!isSuccess) {

            user.status = "failed";
            await user.save();

            return res.json({
                status: 'fail',
                message: '❌ Verification Failed, try again'
            });
        }

        /* =========================
           SUCCESS UPDATE (OVERWRITE FAIL → VERIFIED)
        ========================= */
        user.status = "verified";
        await user.save();

        return res.json({
            status: 'pass',
            message: '🎉 Verified Successfully'
        });

    } catch (err) {

        console.log(err);

        return res.json({
            status: 'fail',
            message: '❌ Server Error'
        });
    }
});

module.exports = app;
