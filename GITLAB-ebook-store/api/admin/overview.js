// api/admin/overview.js
const { connect, User, auth } = require("../_db");
const mongoose = require("mongoose");

const ADMIN_EMAILS = ["kimaniian githua@gmail.com"]; // <-- YOUR admin email, exact as in Atlas

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const d = auth(req);
  if (!d) return res.status(401).json({ error: "Login again" });
  await connect();

  let u = null;
  if (d.id) { try { u = await User.findById(d.id); } catch {} }
  if (!u && d.email) u = await User.findOne({ email: d.email });
  if (!u) return res.status(404).json({ error: "User not found" });

  // Only admin can see this page
  if (!ADMIN_EMAILS.includes(u.email)) {
    return res.status(403).json({ error: "Not admin" });
  }

  const totalMembers = await User.countDocuments({});
  const paidMembers = await User.countDocuments({ $or: [{ isPaid: true }, { membershipPaid: true }] });
  const members = await User.find({}).sort({ createdAt: -1 }).lean();
  const db = mongoose.connection.db;
  let withdrawals = [];
  try { withdrawals = await db.collection("withdrawals").find({}).sort({ createdAt: -1 }).limit(100).toArray(); } catch {}

  // Normalize for admin.html - it expects userName, userEmail, registrationPaid
  const cleanMembers = members.map(m => ({
    name: m.name, email: m.email, phone: m.phone,
    referredBy: m.referredBy || "-",
    registrationPaid: !!(m.isPaid || m.membershipPaid),
    balance: m.balance || 0,
    createdAt: m.createdAt || m._id.getTimestamp()
  }));

  const cleanWd = withdrawals.map(w => ({
    _id: String(w._id),
    userName: w.userName || w.name || "Member",
    userEmail: w.userEmail || w.email || "",
    amount: w.amount,
    phone: w.phone,
    status: w.status || "PENDING",
    createdAt: w.createdAt || w._id.getTimestamp()
  }));

  return res.json({ totalMembers, paidMembers, members: cleanMembers, withdrawals: cleanWd });
};
