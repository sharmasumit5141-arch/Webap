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

    const refers = await db.collection("refer_log")
      .find({ referrer: tg_id, bot_id })
      .sort({ created_at: -1 })
      .toArray();

    return res.status(200).json({
      total: refers.length,
      list: refers.map(r => ({
        referred: r.referred,
        amount: r.amount,
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (client) await client.close();
  }
}
