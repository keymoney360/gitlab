const { connect, User } = require("./_db");
module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    await connect();
    const { email } = req.body || {};
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ error: "No account with this email" });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetCode = code;
    user.resetExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    // For now return code for testing - later send via email
    return res.json({ success: true, code });
  } catch (e) { return res.status(500).json({ error: "Server error: " + e.message }); }
};
