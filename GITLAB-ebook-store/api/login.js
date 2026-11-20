// api/login.js - FIXED: Token now has id + email so me.js can find you
const { connect, User, bcrypt, jwt } = require("./_db");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    await connect();
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Enter email and password" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ error: "No account with this email. Please Join first." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Wrong password. Try Forgot Password." });

    // FIXED: Include id + userId + email - me.js needs id
    const token = jwt.sign(
      { id: user._id, userId: user._id, email: user.email },
      process.env.JWT_SECRET || "gitlab-secret",
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        referralCode: user.referralCode || user.refCode || null,
        isPaid: user.isPaid,
        membershipPaid: user.membershipPaid,
        membershipStatus: user.membershipStatus,
        balance: user.balance,
        totalEarned: user.totalEarned
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error: " + e.message });
  }
};
