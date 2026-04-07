const { MongoClient } = require("mongodb");
const MONGO_URI = process.env.MONGO_URI;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { tg_id, bot_id } = req.query;
  if (!tg_id || !bot_id) return res.status(400).json({ error: "Missing fields" });

  let client;
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db("device_verify");
    const user = await db.collection("users").findOne({ tg_id, bot_id });
    if (!user) return res.status(404).json({ error: "User nahi mila" });

    return res.status(200).json({
      tg_id: user.tg_id,
      tg_name: user.tg_name,
      balance: user.balance || 0,
      referrer: user.referrer || null,
      verified_at: user.verified_at,
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (client) await client.close();
  }
}
