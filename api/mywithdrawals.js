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

    const withdrawals = await db.collection("withdrawals")
      .find({ tg_id, bot_id })
      .sort({ created_at: -1 })
      .toArray();

    return res.status(200).json({
      total: withdrawals.length,
      withdrawals: withdrawals.map(w => ({
        paytm: w.paytm,
        amount: w.amount,
        tax: w.tax,
        final_amount: w.final_amount,
        status: w.status,
        created_at: w.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (client) await client.close();
  }
}
