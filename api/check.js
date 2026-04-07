const { MongoClient } = require("mongodb");
const MONGO_URI = process.env.MONGO_URI;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { device_id, tg_id, tg_name, bot_id, ref } = req.body;
  if (!device_id || !tg_id || !bot_id) return res.status(400).json({ error: "Missing fields" });

  let client;
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db("device_verify");
    const devices = db.collection("devices");
    const users = db.collection("users");

    // Same device check
    const existing = await devices.findOne({ device_id, bot_id });
    if (existing) {
      if (existing.tg_id === tg_id) return res.status(200).json({ status: "already_mine" });
      else return res.status(200).json({ status: "failed" });
    }

    // New device — save karo
    await devices.insertOne({
      device_id, tg_id, tg_name: tg_name || "User",
      bot_id, created_at: new Date()
    });

    // User create karo agar nahi hai
    const userExists = await users.findOne({ tg_id, bot_id });
    if (!userExists) {
      await users.insertOne({
        tg_id, tg_name: tg_name || "User",
        bot_id, balance: 0,
        referrer: ref || null,
        verified_at: new Date()
      });
    }

    // Referrer ko refer amount do
    if (ref && ref !== tg_id) {
      const settings = await db.collection("settings").findOne({ bot_id });
      const referAmount = settings?.refer_amount || 0;
      if (referAmount > 0) {
        await users.updateOne(
          { tg_id: ref, bot_id },
          { $inc: { balance: referAmount } }
        );
        await db.collection("refer_log").insertOne({
          referrer: ref, referred: tg_id,
          amount: referAmount, bot_id,
          created_at: new Date()
        });
      }
    }

    return res.status(200).json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (client) await client.close();
  }
          }
