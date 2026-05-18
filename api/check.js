const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

/* =========================
DB SAFE CONNECT (Usi Main Database Se Connect)
========================= */
const mongoURI = "mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

// Agar pehle se connected nahi hai toh connect karega
if (mongoose.connection.readyState === 0) {
    mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 }).catch(err => {
        console.log("DB Connection Error in Checker:", err.message);
    });
}

/* =========================
SCHEMA REFERENCE (Usi Main Point/Collection Par)
========================= */
const userSchema = new mongoose.Schema({
    tgId: String,
    botUsername: String,
    status: String
});

// Usi 'VerifiedUser' collection ko hit karega jahan data save ho raha hai
const User = mongoose.models.VerifiedUser || mongoose.model('VerifiedUser', userSchema);

/* =========================
🔄 BOT STATUS CHECKER POINT
========================= */
// URL Format: URL/api/check?botusername=Nexo_bot&tg_id=123456789
app.get('/api/check', async (req, res) => {
    try {
        const { botusername, tg_id } = req.query;

        // Validation
        if (!botusername || !tg_id) {
            return res.json({ status: "error", message: "Missing botusername or tg_id" });
        }

        // Direct Point Par Search (Main Database Collection)
        const userRecord = await User.findOne({ tgId: tg_id, botUsername: botusername });

        // 1. Agar entry nahi mili -> Matlab user pending hai
        if (!userRecord) {
            return res.json({ status: "pending" });
        }

        // 2. Agar entry mil gayi -> Jo bhi status save hai (pass/fail) wahi bhej do
        return res.json({ status: userRecord.status });

    } catch (err) {
        console.log("Checker Error:", err.message);
        return res.json({ status: "error", message: "Database busy." });
    }
});

module.exports = app;
