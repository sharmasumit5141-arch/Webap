const { MongoClient } = require("mongodb");
const MONGO_URI = process.env.MONGO_URI;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { bot_id } = req.query;
  if (!bot_id) return res.status(400).json({ error: "Missing bot_id" });

  let client;
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db("device_verify");
    const settings = await db.collection("settings").findOne({ bot_id });

    return res.status(200).json({
      min_withdraw: settings?.min_withdraw || 50,
      max_withdraw: settings?.max_withdraw || 5000,
      tax_percent: settings?.tax_percent || 0,
      refer_amount: settings?.refer_amount || 0,
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (client) await client.close();
  }
}
