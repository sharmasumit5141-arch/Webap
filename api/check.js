const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const mongouri = "mongodb+srv://meena:uniokesugcoms@cluster0.i2uggah.mongodb.net/verifydb?retryWrites=true&w=majority";

if (mongoose.connection.readyState === 0) {
    mongoose.connect(mongouri, { serverSelectionTimeoutMS: 5000 }).catch(err => {
        console.log("db connection error:", err.message);
    });
}

// Yahan hum pehle se bani collection ka schema exact reference de rahe hain
const userSchema = new mongoose.Schema({
    tgId: String,
    botUsername: String,
    status: String
});

// Agar main file mein 'VerifiedUser' naam tha, toh yahan exact wahi point karna hoga
const User = mongoose.models.VerifiedUser || mongoose.model('VerifiedUser', userSchema);

app.get('/api/check', async (req, res) => {
    try {
        // URL se dono parameters small letters mein nikalenge
        const botusername = req.query.botusername;
        const tg_id = req.query.tg_id;

        if (!botusername || !tg_id) {
            return res.json({ status: "error", message: "missing botusername or tg_id" });
        }

        // Database ke andar jo fields hain (tgId, botUsername) unke hisab se search hoga
        const userrecord = await User.findOne({ tgId: tg_id, botUsername: botusername });

        if (!userrecord) {
            return res.json({ status: "pending" });
        }

        return res.json({ status: userrecord.status });

    } catch (err) {
        // Agar abhi bhi koi dikkat aati hai toh yeh exact error batayega na ki sirf database busy
        return res.json({ status: "error", message: err.message });
    }
});

module.exports = app;
