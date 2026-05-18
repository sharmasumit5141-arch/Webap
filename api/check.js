const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const mongouri = "mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

if (mongoose.connection.readystate === 0) {
    mongoose.connect(mongouri, { serverselectiontimeoutms: 5000 }).catch(err => {
        console.log("db connection error:", err.message);
    });
}

const userschema = new mongoose.Schema({
    tgid: String,
    botusername: String,
    status: String
});

const user = mongoose.models.verifieduser || mongoose.model('verifieduser', userschema);

app.get('/api/check', async (req, res) => {
    try {
        const { botusername, tg_id } = req.query;

        if (!botusername || !tg_id) {
            return res.json({ status: "error", message: "missing botusername or tg_id" });
        }

        const userrecord = await user.findOne({ tgid: tg_id, botusername: botusername });

        if (!userrecord) {
            return res.json({ status: "pending" });
        }

        return res.json({ status: userrecord.status });

    } catch (err) {
        return res.json({ status: "error", message: "database busy" });
    }
});

module.exports = app;
