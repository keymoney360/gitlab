const { connect, User, bcrypt, jwt } = require("./_db");

function makeCode(name) {
  const base = (name || "GIT").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3) || "GIT";
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return base + rand; // e.g. IANX7K9
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await connect();
    const { name, email, phone, password, referralCode } = req.body;
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPhone = String(phone || "").trim();
    if (!name || !cleanEmail || !cleanPhone || !password) return res.status(400).json({ error: "Fill all fields" });

    const exists = await User.findOne({ $or: [{ email: cleanEmail }, { phone: cleanPhone }] });
    if (exists) return res.status(400).json({ error: "Email or phone already registered. Login instead." });

    // Generate UNIQUE referralCode
    let myCode = makeCode(name);
    for (let i = 0; i < 5; i++) {
      const taken = await User.findOne({ referralCode: myCode });
      if (!taken) break;
      myCode = makeCode(name);
    }

    // Who referred me?
    let referredBy = null, referredByCode = null;
    if (referralCode) {
      const refUser = await User.findOne({ referralCode: String(referralCode).trim().toUpperCase() });
      if (refUser) { referredBy = refUser.email; referredByCode = refUser.referralCode; }
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name, email: cleanEmail, phone: cleanPhone,
      password: hash,
      referralCode: myCode,
      referredBy, referredByCode,
      isPaid: false, membershipPaid: false,
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "gitlab-secret", { expiresIn: "7d" });
    return res.json({ success: true, token, user: { name, email: cleanEmail, phone: cleanPhone, referralCode: myCode, isPaid: false } });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
