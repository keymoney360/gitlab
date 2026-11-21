// api/admin.js - MongoDB Atlas + Email Only (NO KV, NO passcode)
import { MongoClient } from "mongodb";

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").trim();
const ADMIN_EMAIL = "kimaniangithua@gmail.com";

let cachedClient = null;
async function getDb() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI missing in Vercel Env Vars");
  if (cachedClient) return cachedClient.db(process.env.MONGODB_DB || "gitts");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client.db(process.env.MONGODB_DB || "gitts");
}

function decodeJwt(token) {
  try {
    const part = token.split(".")[1];
    return JSON.parse(Buffer.from(part, "base64").toString("utf8"));
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "No token - please login again" });

    const decoded = decodeJwt(token);
    if (!decoded) return res.status(401).json({ error: "Bad token - please login again" });

    const db = await getDb();
    const usersCol = db.collection("users");
    const wdCol = db.collection("withdrawals");
    const booksCol = db.collection("books");

    const users = await usersCol.find({}).toArray();
    const u = users.find(x => String(x._id) === String(decoded.id || decoded.userId) || String(x.id) === String(decoded.id || decoded.userId));

    // EMAIL CHECK ONLY
    const isAdmin = norm(decoded.email) === norm(ADMIN_EMAIL) || norm(u?.email) === norm(ADMIN_EMAIL);
    if (!isAdmin) {
      return res.status(403).json({ error: "Not admin", debug_dbEmail: u?.email || "(not found in Mongo)", debug_tokenEmail: decoded.email || "(no email in token)" });
    }

    const action = req.query.action || req.body?.action || "overview";
    let withdrawals = await wdCol.find({}).toArray();
    let books = await booksCol.find({}).toArray();

    // Fix _id for frontend
    withdrawals = withdrawals.map(w => ({ ...w, _id: String(w._id), id: String(w._id) }));
    const members = users.map(m => ({ ...m, _id: String(m._id), id: String(m._id) }));

    if (action === "approve" || action === "reject") {
      const id = req.query.id;
      const { ObjectId } = await import("mongodb");
      const w = await wdCol.findOne({ _id: new ObjectId(id) });
      if (!w) return res.status(404).json({ error: "Not found" });
      if (action === "approve") {
        await wdCol.updateOne({ _id: new ObjectId(id) }, { $set: { status: "PAID" } });
      } else {
        await wdCol.updateOne({ _id: new ObjectId(id) }, { $set: { status: "REJECTED" } });
        await usersCol.updateOne({ _id: w.userId }, { $inc: { balance: w.amount || 0 } });
      }
      return res.json({ ok: true });
    }

    if (action === "addBook") {
      const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      await booksCol.insertOne({ title: b.title, price: b.price, category: b.category, cover: b.cover, description: b.description, downloadUrl: b.downloadUrl, createdAt: new Date() });
      return res.json({ ok: true });
    }

    const paidMembers = users.filter(x => x.registrationPaid).length;
    return res.json({ totalMembers: users.length, paidMembers, members, withdrawals, books });
  } catch (e) {
    return res.status(500).json({ error: "Server error: " + e.message });
  }
        }
