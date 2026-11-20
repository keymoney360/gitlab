const { connect, User } = require("./_db");

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    if (req.query.key !== "DELETEALL123") return res.status(403).json({ error: "Wrong key" });
    const keep = String(req.query.keep || "").trim().toLowerCase();
    if (!keep) return res.status(400).json({ error: "Add ?keep=youremail@gmail.com" });

    await connect();
    const result = await User.deleteMany({ email: { $ne: keep } });
    const remaining = await User.find({}, "email phone name");
    return res.json({ success: true, deleted: result.deletedCount, kept: keep, remaining });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
