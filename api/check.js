const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const mongoURI = "mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

if (mongoose.connection.readyState === 0) {
    mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 }).catch(err => {
        console.log("DB Connection Error:", err.message);
    });
}

const userSchema = new mongoose.Schema({
    tgId: String,
    botUsername: String,
    status: String
});

const User = mongoose.models.VerifiedUser || mongoose.model('VerifiedUser', userSchema);

// 🎯 MAIN POINT
app.get('/api/check', async (req, res) => {
    try {
        const { botusername, tg_id } = req.query;

        if (!botusername || !tg_id) {
            return res.json({ status: "error", message: "Missing botusername or tg_id" });
        }

        const userRecord = await User.findOne({ tgId: tg_id, botUsername: botusername });

        if (!userRecord) {
            return res.json({ status: "pending" });
        }

        return res.json({ status: userRecord.status });

    } catch (err) {
        return res.json({ status: "error", message: "Database busy." });
    }
});

// Vercel ke liye yeh export hona zaroori hai
module.exports = app;
