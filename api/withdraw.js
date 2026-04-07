const { MongoClient } = require("mongodb");
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_KEY = process.env.ADMIN_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  // GET: User withdrawal request
  // POST: Admin approve kare (ADMIN_KEY se)

  const { tg_id, paytm, amount, bot_id } = req.method === "POST"
    ? req.body : req.query;

  if (!tg_id || !paytm || !amount || !bot_id)
    return res.status(400).json({ error: "Missing fields" });

  let client;
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db("device_verify");
    const users = db.collection("users");
    const settings = await db.collection("settings").findOne({ bot_id });

    const minW = settings?.min_withdraw || 50;
    const maxW = settings?.max_withdraw || 10000;
    const tax = settings?.tax_percent || 0;
    const apiUrl = settings?.payout_api_url;
    const apiKey = settings?.payout_api_key;

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < minW) return res.status(400).json({ error: `Minimum withdrawal ₹${minW} hai` });
    if (amt > maxW) return res.status(400).json({ error: `Maximum withdrawal ₹${maxW} hai` });

    const user = await users.findOne({ tg_id, bot_id });
    if (!user) return res.status(404).json({ error: "User nahi mila" });
    if (user.balance < amt) return res.status(400).json({ error: "Insufficient balance" });

    const taxAmount = parseFloat((amt * tax / 100).toFixed(2));
    const finalAmount = parseFloat((amt - taxAmount).toFixed(2));

    // Payout API call
    if (!apiUrl || !apiKey) return res.status(500).json({ error: "Payout API configure nahi hai" });

    const payoutUrl = apiUrl
      .replace("{key}", apiKey)
      .replace("{number}", paytm)
      .replace("{amount}", finalAmount)
      .replace("{comment}", "payout");

    const payoutRes = await fetch(payoutUrl);
    const payoutData = await payoutRes.json();

    if (payoutData.status === "success" || payoutData.STATUS === "SUCCESS") {
      await users.updateOne({ tg_id, bot_id }, { $inc: { balance: -amt } });
      await db.collection("withdrawals").insertOne({
        tg_id, tg_name: user.tg_name,
        paytm, amount: amt,
        tax: taxAmount, final_amount: finalAmount,
        bot_id, status: "success",
        created_at: new Date()
      });
      return res.status(200).json({ status: "success", final_amount: finalAmount, tax: taxAmount });
    } else {
      return res.status(200).json({ status: "failed", error: "Payout failed", detail: payoutData });
    }
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (client) await client.close();
  }
}
