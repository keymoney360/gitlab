// api/admin/withdraw/[id]/reject.js - refunds balance
const { connect, User, auth } = require("../../../_db");
const mongoose = require("mongoose");
const ADMIN_EMAILS = ["kimaniiangithua@gmail.com"];

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const d = auth(req);
  if (!d) return res.status(401).json({ error: "Login again" });
  await connect();
  let u = null;
  if (d.id) { try { u = await User.findById(d.id); } catch {} }
  if (!u && d.email) u = await User.findOne({ email: d.email });
  if (!u || !ADMIN_EMAILS.includes(u.email)) return res.status(403).json({ error: "Not admin" });

  const id = req.query.id;
  const db = mongoose.connection.db;
  const wd = await db.collection("withdrawals").findOne({ _id: new mongoose.Types.ObjectId(id) });
  if (!wd) return res.status(404).json({ error: "Not found" });
  if (wd.status !== "PENDING") return res.status(400).json({ error: "Already " + wd.status });

  await db.collection("withdrawals").updateOne({ _id: wd._id }, { $set: { status: "REJECTED" } });
  // Refund: give money back to user
  const userEmail = wd.userEmail || wd.email;
  if (userEmail) {
    await User.updateOne({ email: userEmail }, { $inc: { balance: wd.amount } });
  }
  return res.json({ success: true });
};
