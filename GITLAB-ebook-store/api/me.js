const { connect, User, Referral, Withdrawal, Book } = require("./_db");
module.exports = async (req, res) => {
  await connect();
  const { auth } = require("./_db");
  const me = auth(req);
  if (!me) return res.status(401).json({ error: "Login required" });
  const user = await User.findOne({ email: me.email });
  const referrals = await Referral.find({ referrerEmail: me.email }).sort({ createdAt: -1 });
  const withdrawals = await Withdrawal.find({ userEmail: me.email }).sort({ createdAt: -1 });
  // Books owned - for now return all books, filter later by purchase
  const books = await Book.find().sort({ createdAt: -1 });
  res.json({
    user: { name: user.name, email: user.email, referralCode: user.referralCode, balance: user.balance, totalEarned: user.totalEarned, registrationPaid: user.registrationPaid },
    referrals: referrals.map(r => ({ name: r.referredName, email: r.referredEmail, level: r.level, status: r.paid ? "PAID" : "PENDING", commission: r.commission, createdAt: r.createdAt })),
    withdrawals: withdrawals.map(w => ({ amount: w.amount, phone: w.phone, status: w.status, createdAt: w.createdAt })),
    books: books.map(b => ({ name: b.title, price: b.price, status: "OWNED", downloadUrl: b.downloadUrl }))
  });
};
