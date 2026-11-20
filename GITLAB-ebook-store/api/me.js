const { connect, User, auth } = require("./_db");
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const d = auth(req); if (!d) return res.status(401).json({ error: "Login again" });
  await connect();
  const u = await User.findById(d.id);
  if (!u) return res.status(404).json({ error: "User not found" });
  return res.json({ user: { name: u.name, email: u.email, phone: u.phone, referralCode: u.referralCode, isPaid: u.isPaid, membershipPaid: u.membershipPaid } });
};
