const { MongoClient } = require("mongodb");
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_KEY = process.env.ADMIN_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const key = req.query.key || req.body?.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });

  const action = req.query.action || req.body?.action;
  let client;
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db("device_verify");

    // === Settings update ===
    if (action === "update_settings" && req.method === "POST") {
      const { bot_id, payout_api_url, payout_api_key, refer_amount,
              tax_percent, min_withdraw, max_withdraw } = req.body;
      await db.collection("settings").updateOne(
        { bot_id },
        { $set: { payout_api_url, payout_api_key, refer_amount: +refer_amount,
                  tax_percent: +tax_percent, min_withdraw: +min_withdraw,
                  max_withdraw: +max_withdraw } },
        { upsert: true }
      );
      return res.status(200).json({ status: "saved" });
    }

    // === Settings get ===
    if (action === "get_settings") {
      const bot_id = req.query.bot_id;
      const s = await db.collection("settings").findOne({ bot_id });
      return res.status(200).json(s || {});
    }

    // === All withdrawals ===
    if (action === "withdrawals") {
      const bot_id = req.query.bot_id;
      const list = await db.collection("withdrawals")
        .find({ bot_id }).sort({ created_at: -1 }).limit(200).toArray();
      const total = list.reduce((s, w) => s + (w.amount || 0), 0);
      return res.status(200).json({ list, total });
    }

    // === All users ===
    if (action === "users") {
      const bot_id = req.query.bot_id;
      const list = await db.collection("users")
        .find({ bot_id }).sort({ verified_at: -1 }).limit(200).toArray();
      return res.status(200).json({ list, count: list.length });
    }

    // === Refer log ===
    if (action === "refers") {
      const bot_id = req.query.bot_id;
      const list = await db.collection("refer_log")
        .find({ bot_id }).sort({ created_at: -1 }).limit(200).toArray();
      return res.status(200).json({ list });
    }

    return res.status(400).json({ error: "Invalid action" });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (client) await client.close();
  }
  }
