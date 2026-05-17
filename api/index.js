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

    res.json({
        status: "API Working"
    });

});

/* =========================
   MONGODB
========================= */

const mongoURI =
"mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {

    serverSelectionTimeoutMS: 5000

})
.then(() => {

    console.log("💾 MongoDB Connected");

})
.catch((err) => {

    console.log("❌ Mongo Error:", err.message);

});

/* =========================
   DATABASE
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
        required: true,
        unique: true

    },

    ip: {

        type: String

    },

    createdAt: {

        type: Date,
        default: Date.now

    }

});

/* One Verify Per Bot */

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

        /* Validate */

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

        /* IP */

        const ip =
        req.clientIp ||
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        "UNKNOWN_IP";

        /* Device Key */

        const finalDeviceKey =
        `${ip}_${browser_id}`;

        /* =========================
           MULTI ACCOUNT CHECK
        ========================= */

        const multiAccountCheck =
        await User.findOne({

            deviceKey: finalDeviceKey,

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

Same device already used!`

                );

            }catch(e){}

            return res.status(403).json({

                status: 'fail',
                message: 'Multi-account detected'

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

            try{

                await sendAlert(

                    bottoken,

                    tg_id,

`❌ Already Verified

🤖 Bot: @${botusername}

You are already registered.`

                );

            }catch(e){}

            return res.status(400).json({

                status: 'fail',
                message: 'Already registered on this bot'

            });
        }

        /* =========================
           SAVE USER
        ========================= */

        const newUser = new User({

            tgId: tg_id,

            botUsername: botusername,

            deviceKey: finalDeviceKey,

            ip: ip

        });

        await newUser.save();

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

        return res.status(200).json({

            status: 'pass',
            message: 'Verification Successful'

        });

    }catch(err){

        console.log("❌ Verify Error:", err);

        return res.status(500).json({

            status: 'fail',
            message: err.message || 'Internal Server Error'

        });
    }
});

/* =========================
   EXPORT
========================= */

module.exports = app;
