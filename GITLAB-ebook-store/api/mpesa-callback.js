const { connect, User } = require("./_db");

module.exports = async (req, res) => {
  try {
    await connect();
    const stk = req.body?.Body?.stkCallback;
    if (!stk) return res.json({ ResultCode: 0, ResultDesc: "OK" });

    const code = stk.ResultCode;
    const meta = stk.CallbackMetadata?.Item || [];
    const get = (n) => { const f = meta.find(x => x.Name === n); return f ? f.Value : null; };
    const receipt = get("MpesaReceiptNumber");
    const phone = String(get("PhoneNumber") || "");
    const amount = get("Amount");

    if (code !== 0) return res.json({ ResultCode: 0, ResultDesc: "OK" });

    // Find payer by phone - try both formats
    let user = await User.findOne({ phone });
    if (!user) {
      const local = "0" + phone.slice(3);
      user = await User.findOne({ phone: local });
    }
    if (!user) return res.json({ ResultCode: 0, ResultDesc: "OK" });

    // If already paid, don't pay commission twice
    if (user.isPaid && user.membershipPaid) {
      return res.json({ ResultCode: 0, ResultDesc: "OK" });
    }

    user.isPaid = true;
    user.membershipPaid = true;
    user.membershipStatus = "active";
    user.lastMpesaReceipt = receipt;
    user.membershipExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();

    // --- PAY REFERRALS ---
    if (user.referredBy) {
      // Level 1 = 50
      const l1 = await User.findOne({ email: user.referredBy });
      if (l1) {
        l1.balance = (l1.balance || 0) + 50;
        l1.totalEarned = (l1.totalEarned || 0) + 50;
        await l1.save();

        // Create referral record so dashboard shows it
        const db = require("mongoose").connection.db;
        await db.collection("referrals").insertOne({
          referrerEmail: l1.email,
          referrerCode: l1.referralCode,
          referredEmail: user.email,
          referredName: user.name,
          level: 1,
          status: "APPROVED",
          commission: 50,
          createdAt: new Date()
        });

        // Level 2 = 30 - the person who referred YOUR referrer
        if (l1.referredBy) {
          const l2 = await User.findOne({ email: l1.referredBy });
          if (l2) {
            l2.balance = (l2.balance || 0) + 30;
            l2.totalEarned = (l2.totalEarned || 0) + 30;
            await l2.save();

            await db.collection("referrals").insertOne({
              referrerEmail: l2.email,
              referrerCode: l2.referralCode,
              referredEmail: user.email,
              referredName: user.name,
              level: 2,
              status: "APPROVED",
              commission: 30,
              createdAt: new Date()
            });
          }
        }
      }
    }

    return res.json({ ResultCode: 0, ResultDesc: "OK" });
  } catch (e) {
    console.error("callback error", e);
    return res.json({ ResultCode: 0, ResultDesc: "OK" });
  }
};
