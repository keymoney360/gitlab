const { connect, User, Referral, bcrypt, jwt } = require("./_db");

function makeCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    await connect();
    const { name, email, phone, password, referralCode } = req.body || {};
    if (!name || !email || !phone || !password) return res.status(400).json({ error: "Fill all fields" });
    if (password.length < 6) return res.status(400).json({ error: "Password min 6" });

    const lowerEmail = email.toLowerCase();

    // FIX: If email already exists, just login them and go to Pay - no more duplicate error
    const exists = await User.findOne({ email: lowerEmail });
    if (exists) {
      const ok = await bcrypt.compare(password, exists.password);
      if (!ok) return res.status(400).json({ error: "Email already exists with different password. Use Login / Forgot Password." });
      const token = jwt.sign({ email: exists.email }, process.env.JWT_SECRET || "gitlab-secret", { expiresIn: "7d" });
      return res.json({ success: true, token, user: { name: exists.name, email: exists.email, referralCode: exists.referralCode }, alreadyExists: true });
    }

    // Also check phone - if phone exists, tell them to login with that email
    const phoneExists = await User.findOne({ phone });
    if (phoneExists) {
      return res.status(400).json({ error: `This phone is already used for ${phoneExists.email}. Please Login with that email.` });
    }

    const hashed = await bcrypt.hash(password, 10);
    const myCode = makeCode();

    const user = await User.create({
      name, email: lowerEmail, phone, password: hashed,
      referralCode: myCode,
      referredBy: referralCode ? referralCode.toUpperCase() : null,
      isPaid: false, balance: 0, totalEarned: 0
    });

    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) {
        await Referral.create({ referrerEmail: referrer.email, name: user.name, email: user.email, level: 1, commission: 50, status: "PENDING" });
        if (referrer.referredBy) {
          const l2 = await User.findOne({ referralCode: referrer.referredBy });
          if (l2) await Referral.create({ referrerEmail: l2.email, name: user.name, email: user.email, level: 2, commission: 30, status: "PENDING" });
        }
      }
    }

    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET || "gitlab-secret", { expiresIn: "7d" });
    return res.json({ success: true, token, user: { name: user.name, email: user.email, referralCode: myCode } });
  } catch (e) {
    console.error(e);
    if (e.code === 11000) {
      return res.status(400).json({ error: "Account already exists. Click 'Already have account? Login' below and login." });
    }
    return res.status(500).json({ error: "Server error: " + e.message });
  }
};
