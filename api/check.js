const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

/* =========================
DB CONNECT (Same as index.js)
========================= */
const mongoURI = "mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

// Agar mongoose pehle se connected nahi hai toh hi connect karega
if (mongoose.connection.readyState === 0) {
    mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 8000
    }).catch((err) => {
        console.log("❌ DB Checker Connection Blocked:", err.message);
    });
}

/* =========================
SCHEMA & MODEL (Same as index.js)
========================= */
const userSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botUsername: { type: String, required: true },
    deviceKey: { type: String, required: true },
    ip: String,
    status: { type: String, enum: ["pass", "fail"], default: "pass" },
    reason: String,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.VerifiedUser || mongoose.model('VerifiedUser', userSchema);

/* =========================
🤖 MAIN CHECK ROUTE
========================= */
app.get('/api/check', async (req, res) => {
    try {
        // Query parameters ko nikalna (botusername aur tg_id small letters mein hi rahenge URL ke liye)
        const { botusername, tg_id } = req.query;

        if (!botusername || !tg_id) {
            return res.json({ status: "fail", message: "Missing Parameters" });
        }

        // Database mein same fields (tgId, botUsername) par find chalana
        const user = await User.findOne({ tgId: tg_id, botUsername: botusername });

        // CASE 1: Agar user database mein nahi mila -> Matlab pending hai
        if (!user) {
            return res.json({ status: "pending" });
        }

        // CASE 2 & 3: Agar user mil gaya -> Jo bhi status hai ("pass" ya "fail") direct return karo
        return res.json({ status: user.status });

    } catch (err) {
        console.log("CHECK_API_CRASH:", err.message);
        return res.json({ status: "fail", message: "System busy. Try again." });
    }
});

module.exports = app;
