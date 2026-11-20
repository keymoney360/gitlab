// api/admin/withdraw/[id]/approve.js - LOCKED ADMIN ONLY
const { connect, User, auth } = require("../../../../_db");
const mongoose = require("mongoose");
const ADMIN_EMAILS = [
  "kimaniian githua@gmail.com",
  "kimaniangithua@gmail.com"
];
const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, "");
const isAdmin = (email) => ADMIN_EMAILS.map(norm).includes(norm(email));

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  const d = auth(req);
  if (!d) return res.status(401).json({ error: "Login again" });
  await connect();

  let u = null;
  if (d.id) { try { u = await User.findById(d.id); } catch {} }
  if (!u && d.email) u = await User.findOne({ email: d.email });
  if (!u || !isAdmin(u.email)) return res.status(403).json({ error: "Not admin" });

  const id = req.query.id;
  const db = mongoose.connection.db;
  const result = await db.collection("withdrawals").updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { $set: { status: "PAID", paidAt: new Date() } }
  );
  if (!result.matchedCount) return res.status(404).json({ error: "Withdrawal not found" });
  return res.json({ success: true });
};
