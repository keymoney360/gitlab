const { connect, User, Referral } = require("./_db");

module.exports = async (req, res) => {
  // Daraja always expects 200 quickly
  try {
    await connect();
    const stk = req.body?.Body?.stkCallback;
    console.log("Callback received:", JSON.stringify(req.body));

    if (!stk || stk.ResultCode !== 0) {
      console.log("Payment failed / cancelled:", stk?.ResultDesc);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    // Find phone + amount from callback metadata
    const meta = stk.CallbackMetadata?.Item || [];
    const getMeta = (name) => meta.find(i => i.Name === name)?.Value;
    const phone = String(getMeta("PhoneNumber") || "");
    const amount = Number(getMeta("Amount") || 0);
    const receipt = getMeta("MpesaReceiptNumber") || "";

    console.log(`Payment success: ${phone} paid ${amount} receipt ${receipt}`);

    // CASE 1: REGISTRATION - KSh 300
    if (amount === 300) {
      // Find user by phone - most recent pending user with this phone
      const newUser = await User.findOne({ phone, registrationPaid: false }).sort({ createdAt: -1 });
      if (!newUser) { console.log("No pending user for phone", phone); return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" }); }
      if (newUser.registrationPaid) return res.status(200).json({ ResultCode: 0, ResultDesc: "Already paid" });

      newUser.registrationPaid = true;
      await newUser.save();
      console.log(`Activated ${newUser.email}`);

      // Level 1: +50
      if (newUser.referredBy) {
        const l1 = await User.findOne({ email: newUser.referredBy });
        if (l1) {
          l1.balance += 50; l1.totalEarned += 50; await l1.save();
          await Referral.create({ referrerEmail: l1.email, referredEmail: newUser.email, referredName: newUser.name, level: 1, commission: 50, paid: true });
          console.log(`L1 +50 to ${l1.email}`);
          // Level 2: +30
          if (l1.referredBy) {
            const l2 = await User.findOne({ email: l1.referredBy });
            if (l2) {
              l2.balance += 30; l2.totalEarned += 30; await l2.save();
              await Referral.create({ referrerEmail: l2.email, referredEmail: newUser.email, referredName: newUser.name, level: 2, commission: 30, paid: true });
              console.log(`L2 +30 to ${l2.email}`);
            }
          }
        }
      }
    }

    // CASE 2: BOOK - 150 / 200 - just log it for now, books are delivered via admin
    if (amount === 150 || amount === 200) {
      console.log(`Book payment ${amount} from ${phone} - handle delivery manually or add BookPurchase logic`);
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (e) {
    console.error("Callback error", e);
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
};
