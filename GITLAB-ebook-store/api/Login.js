const { connect, User, bcrypt, jwt } = require("./_db");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  await connect();
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "Account not found. Register first." });
  if (!(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Wrong password." });
  if (!user.registrationPaid) return res.status(400).json({ error: "Pay KSh 300 registration first. Check your phone for M-Pesa prompt." });
  const token = jwt.sign({ email: user.email, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { name: user.name, email: user.email, referralCode: user.referralCode, isAdmin: user.isAdmin } });
};
