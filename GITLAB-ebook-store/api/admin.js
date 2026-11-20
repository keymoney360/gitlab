// api/admin.js - ALL ADMIN IN 1 FUNCTION + PASSCODE LOCK
const { connect, User, auth } = require("./_db");
const mongoose = require("mongoose");

const ADMIN_EMAILS = ["kimaniangithua@gmail.com"];
const ADMIN_PASSCODE = "GITTS-Admin-2026";

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
  if (!u) return res.status(404).json({ error: "User not found" });

  // LOCK 1: Must be admin email
  if (!isAdmin(u.email)) {
    return res.status(403).json({ error: "Not admin" });
  }

  // LOCK 2: Must have correct passcode
    const passcode = String(req.headers["x-admin-passcode"] || req.query.passcode || req.body?.passcode || "").trim();
  
 if (passcode !== ADMIN_PASSCODE) {
    return res.status(403).json({ error: "Wrong admin passcode" });
  }

  const db = mongoose.connection.db;
  const action = req.query.action || "overview";

  // GET OVERVIEW
  if (action === "overview") {
    const totalMembers = await User.countDocuments({});
    const paidMembers = await User.countDocuments({ $or: [{ isPaid: true }, { membershipPaid: true }] });
    const members = await User.find({}).sort({ createdAt: -1 }).lean();
    let withdrawals = [];
    try { withdrawals = await db.collection("withdrawals").find({}).sort({ createdAt: -1 }).limit(100).toArray(); } catch {}
    const cleanMembers = members.map(m => ({
      name: m.name, email: m.email, phone: m.phone,
      referredBy: m.referredBy || "-", registrationPaid: !!(m.isPaid || m.membershipPaid),
      balance: m.balance || 0, createdAt: m.createdAt || m._id.getTimestamp()
    }));
    const cleanWd = withdrawals.map(w => ({
      _id: String(w._id), userName: w.userName || w.name || "Member",
      userEmail: w.userEmail || w.email || "", amount: w.amount, phone: w.phone,
      status: w.status || "PENDING", createdAt: w.createdAt || w._id.getTimestamp()
    }));
    return res.json({ totalMembers, paidMembers, members: cleanMembers, withdrawals: cleanWd });
  }

  // APPROVE WITHDRAWAL
  if (action === "approve") {
    const id = req.query.id;
    const result = await db.collection("withdrawals").updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { status: "PAID", paidAt: new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true });
  }

  // REJECT + REFUND
  if (action === "reject") {
    const id = req.query.id;
    const wd = await db.collection("withdrawals").findOne({ _id: new mongoose.Types.ObjectId(id) });
    if (!wd) return res.status(404).json({ error: "Not found" });
    if (wd.status !== "PENDING") return res.status(400).json({ error: "Already " + wd.status });
    await db.collection("withdrawals").updateOne({ _id: wd._id }, { $set: { status: "REJECTED" } });
    const userEmail = wd.userEmail || wd.email;
    if (userEmail) await User.updateOne({ email: userEmail }, { $inc: { balance: wd.amount } });
    return res.json({ success: true });
  }

  // ADD BOOK
  if (action === "addBook") {
    const { title, price, category, cover, description, downloadUrl } = req.body || {};
    if (!title || !price) return res.status(400).json({ error: "Enter title and price" });
    await db.collection("books").insertOne({ title, price, category, cover, description, downloadUrl, createdAt: new Date() });
    return res.json({ success: true });
  }

  return res.status(400).json({ error: "Unknown action" });
};
