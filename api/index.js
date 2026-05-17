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
   ROOT CHECK
========================= */

app.get('/', (req, res) => {

    res.send("🚀 API Running");

});

/* =========================
   MONGODB
========================= */

const mongoURI =
"mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

/* CONNECT */

mongoose.connect(mongoURI, {

    serverSelectionTimeoutMS: 10000

});

/* EVENTS */

mongoose.connection.on('connected', () => {

    console.log("💾 MongoDB Connected");

});

mongoose.connection.on('error', (err) => {

    console.log("❌ MongoDB Error:", err);

});

/* =========================
   DATABASE SCHEMA
========================= */

const userSchema = new mongoose.Schema({

    tgId: {

        type: String,
        required: true

    },

    botUsername: {

        type: String,
        required: true

    },

    deviceKey: {

        type: String,
        required: true

    },

    ip: {

        type: String

    },

    createdAt: {

        type: Date,
        default: Date.now

    }

});

/* SAME USER SAME BOT BLOCK */

userSchema.index(

    {
        tgId: 1,
        botUsername: 1
    },

    {
        unique: true
    }

);

const User =
mongoose.models.VerifiedUser ||
mongoose.model('VerifiedUser', userSchema);

/* =========================
   TELEGRAM ALERT
========================= */

async function sendAlert(token, chatId, text){

    try{

        const url =
        `https://api.telegram.org/bot${token}/sendMessage`;

        await fetch(url, {

            method: 'POST',

            headers: {
                'Content-Type': 'application/json'
            },

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
   MAIN API
========================= */

app.get('/api', async (req, res) => {

    try{

        const {

            botusername,
            bottoken,
            tg_id,
            browser_id,
            name

        } = req.query;

        /* VALIDATE */

        if(

            !botusername ||
            !bottoken ||
            !tg_id ||
            !browser_id

        ){

            return res.status(400).json({

                status: 'fail',
                message: 'Parameters Missing'

            });
        }

        /* USER IP */

        const ip =
        req.clientIp ||
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        "UNKNOWN_IP";

        /* DEVICE KEY */

        const finalDeviceKey =
        `${ip}_${browser_id}`;

        /* =========================
           MULTI ACCOUNT CHECK
           SAME DEVICE + SAME BOT
        ========================= */

        const multiAccountCheck =
        await User.findOne({

            deviceKey: finalDeviceKey,

            botUsername: botusername,

            tgId: {
                $ne: tg_id
            }

        });

        if(multiAccountCheck){

            try{

                await sendAlert(

                    bottoken,

                    tg_id,

`⚠️ Multi Account Detected

👤 User: ${name}
🆔 ID: ${tg_id}

Same device already used on this bot!`

                );

            }catch(e){}

            return res.status(403).json({

                status: 'fail',
                message: 'Multi-account detected on this bot'

            });
        }

        /* =========================
           ALREADY VERIFIED
        ========================= */

        const alreadyVerified =
        await User.findOne({

            tgId: tg_id,

            botUsername: botusername

        });

        if(alreadyVerified){

            return res.status(200).json({

                status: 'pass',
                message: 'Already verified'

            });
        }

        /* =========================
           SAVE USER SAFE MODE
        ========================= */

        try{

            await User.updateOne(

                {

                    tgId: tg_id,
                    botUsername: botusername

                },

                {

                    $set: {

                        tgId: tg_id,

                        botUsername: botusername,

                        deviceKey: finalDeviceKey,

                        ip: ip,

                        createdAt: new Date()

                    }

                },

                {

                    upsert: true

                }

            );

        }catch(saveErr){

            console.log("Save Safe Error:", saveErr);

            return res.status(200).json({

                status: 'pass',

                message: 'Already processed safely'

            });
        }

        /* =========================
           SUCCESS ALERT
        ========================= */

        try{

            await sendAlert(

                bottoken,

                tg_id,

`✅ Verified Successfully

👤 Name: ${name}
🆔 ID: ${tg_id}
🤖 Bot: @${botusername}
🌐 IP: ${ip}`

            );

        }catch(e){}

        /* SUCCESS */

        return res.status(200).json({

            status: 'pass',
            message: 'Verification Successful'

        });

    }catch(err){

        console.log("❌ FULL ERROR:", err);

        return res.status(200).json({

            status: 'fail',

            message: err.message || 'Internal Error'

        });
    }
});

/* =========================
   EXPORT
========================= */

module.exports = app;
