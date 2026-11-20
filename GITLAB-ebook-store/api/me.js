// api/me.js - FIXED: Finds user by id OR userId OR _id OR email
const { connect, User, auth } = require("./_db");

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const d = auth(req);
  if (!d) return res.status(401).json({ error: "Login again" });

  await connect();

  // Token could have been signed as { id } OR { userId } OR { _id } - try all
  const tokenId = d.id || d._id || d.userId || d.user_id;
  let u = null;

  if (tokenId) {
    try { u = await User.findById(tokenId); } catch {}
  }
  // Fallback: find by email in token - this always works
  if (!u && d.email) {
    u = await User.findOne({ email: d.email });
  }

  if (!u) return res.status(404).json({ error: "User not found" });

  return res.json({
    user: {
      name: u.name,
      email: u.email,
      phone: u.phone,
      // Atlas has refCode, new code uses referralCode - return whichever exists
      referralCode: u.referralCode || u.refCode || null,
      isPaid: u.isPaid,
      membershipPaid: u.membershipPaid,
      membershipStatus: u.membershipStatus,
      membershipExpiresAt: u.membershipExpiresAt,
      balance: u.balance,
      totalEarned: u.totalEarned,
      purchasedBooks: u.purchasedBooks || [],
    }
  });
};
