const { connect, User, bcrypt } = require("./_db");
module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    await connect();
    const { email, code, newPassword } = req.body || {};
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.resetCode !== code) return res.status(400).json({ error: "Invalid code" });
    if (new Date() > user.resetExpiry) return res.status(400).json({ error: "Code expired" });
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetCode = null; user.resetExpiry = null;
    await user.save();
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: "Server error: " + e.message }); }
};
