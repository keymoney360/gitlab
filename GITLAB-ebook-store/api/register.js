const { connect, User, bcrypt, makeCode } = require("./_db");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  await connect();
  const { name, email, password, phone, referralCode } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: "Invalid details" });
  if (await User.findOne({ email })) return res.status(400).json({ error: "Email already registered. Login instead." });
  const hash = await bcrypt.hash(password, 10);
  let referredBy = null;
  if (referralCode) {
    const ref = await User.findOne({ referralCode: referralCode.toUpperCase() });
    if (ref) referredBy = ref.email;
  }
  const user = await User.create({
    name, email, password: hash, phone,
    referralCode: makeCode(name), referredBy, registrationPaid: false
  });
  res.json({ success: true, user: { name: user.name, email: user.email } });
};
