const { connect, User, Withdrawal, auth } = require("./_db");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  await connect();
  const me = auth(req);
  if (!me) return res.status(401).json({ error: "Login required" });
  const { amount, phone } = req.body;
  if (!amount || amount < 50) return res.status(400).json({ error: "Minimum withdrawal is KSh 50" });
  const user = await User.findOne({ email: me.email });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.balance < amount) return res.status(400).json({ error: "Insufficient balance" });
  user.balance -= amount;
  await user.save();
  await Withdrawal.create({ userEmail: user.email, userName: user.name, amount, phone });
  res.json({ success: true });
};
