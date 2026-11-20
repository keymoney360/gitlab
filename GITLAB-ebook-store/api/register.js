const { connect, User, Referral, bcrypt, jwt } = require("./_db");

function makeCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    await connect();
    // FIX 1: Drop old phone unique index - fixes E11000 forever
    try { await User.collection.dropIndex("phone_1"); } catch {}
    const { name, email, phone, password, referralCode } = req.body || {};
    if (!name || !email || !phone || !password) return res.status(400).json({ error: "Fill all fields" });
    if (password.length < 6) return res.status(400).json({ error: "Password min 6" });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ error: "Email already registered. Login instead." });

    const hashed = await bcrypt.hash(password, 10);
    const myCode = makeCode();

    const user = await User.create({
      name, email: email.toLowerCase(), phone, password: hashed,
      referralCode: myCode,
      referredBy: referralCode ? referralCode.toUpperCase() : null,
      isPaid: false, balance: 0, totalEarned: 0
    });

    // Save referral record for later commission (when they pay 300)
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) {
        await Referral.create({
          referrerEmail: referrer.email,
          name: user.name, email: user.email,
          level: 1, commission: 50, status: "PENDING"
        });
        // Level 2 - who referred the referrer?
        if (referrer.referredBy) {
          const l2 = await User.findOne({ referralCode: referrer.referredBy });
          if (l2) {
            await Referral.create({
              referrerEmail: l2.email,
              name: user.name, email: user.email,
              level: 2, commission: 30, status: "PENDING"
            });
          }
        }
      }
    }

    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET || "gitlab-secret", { expiresIn: "7d" });
    return res.json({ success: true, token, user: { name: user.name, email: user.email, referralCode: myCode } });
  } catch (e) {
    console.error(e);
    // FIX 2: Friendly message instead of ugly E11000
    if (e.code === 11000) {
      return res.status(400).json({ error: "This phone/email already exists. Please Login instead." });
    }
    return res.status(500).json({ error: "Server error: " + e.message });
  }
};
