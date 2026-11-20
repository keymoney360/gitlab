// api/me.js - FIXED: returns referrals + withdrawals + books
const { connect, User, auth } = require("./_db");
const mongoose = require("mongoose");

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const d = auth(req);
  if (!d) return res.status(401).json({ error: "Login again" });

  await connect();

  const tokenId = d.id || d._id || d.userId || d.user_id;
  let u = null;
  if (tokenId) {
    try { u = await User.findById(tokenId); } catch {}
  }
  if (!u && d.email) {
    u = await User.findOne({ email: d.email });
  }
  if (!u) return res.status(404).json({ error: "User not found" });

  // --- REFERRALS: Level 1 = users who have me as referredBy ---
  const l1Users = await User.find({ 
    $or: [
      { referredBy: u.email },
      { referredByCode: u.referralCode || u.refCode }
    ]
  }).sort({ createdAt: -1 }).lean();

  let referrals = l1Users.map(x => ({
    name: x.name,
    email: x.email,
    level: 1,
    status: x.isPaid || x.membershipPaid ? "APPROVED" : "PENDING",
    commission: x.isPaid || x.membershipPaid ? 50 : 0,
    createdAt: x.createdAt || x._id.getTimestamp()
  }));

  // --- Level 2 = users referred by my Level 1 users ---
  if (l1Users.length) {
    const l1Emails = l1Users.map(x => x.email);
    const l1Codes = l1Users.map(x => x.referralCode || x.refCode).filter(Boolean);
    const l2Users = await User.find({
      $or: [
        { referredBy: { $in: l1Emails } },
        { referredByCode: { $in: l1Codes } }
      ]
    }).sort({ createdAt: -1 }).lean();
    referrals = referrals.concat(l2Users.map(x => ({
      name: x.name,
      email: x.email,
      level: 2,
      status: x.isPaid || x.membershipPaid ? "APPROVED" : "PENDING",
      commission: x.isPaid || x.membershipPaid ? 30 : 0,
      createdAt: x.createdAt || x._id.getTimestamp()
    })));
  }

  // --- Withdrawals + Books (if collections exist, don't crash if not) ---
  let withdrawals = [];
  let books = [];
  try {
    const db = mongoose.connection.db;
    withdrawals = await db.collection("withdrawals").find({ 
      $or: [{ email: u.email }, { userId: String(u._id) }, { userEmail: u.email }] 
    }).sort({ createdAt: -1 }).limit(20).toArray();
    // books: try purchasedBooks on user first
    books = u.purchasedBooks || [];
  } catch {}

  return res.json({
    user: {
      name: u.name,
      email: u.email,
      phone: u.phone,
      referralCode: u.referralCode || u.refCode || null,
      isPaid: u.isPaid,
      membershipPaid: u.membershipPaid,
      membershipStatus: u.membershipStatus,
      membershipExpiresAt: u.membershipExpiresAt,
      balance: u.balance,
      totalEarned: u.totalEarned,
      purchasedBooks: u.purchasedBooks || [],
    },
    referrals,
    withdrawals,
    books
  });
};
