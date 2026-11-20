const { connect, User } = require("./_db");

module.exports = async (req, res) => {
  try {
    await connect();
    const body = req.body || {};
    const stk = body?.Body?.stkCallback;
    if (!stk) return res.json({ ResultCode: 0, ResultDesc: "Accepted" });

    const checkoutId = stk.CheckoutRequestID;
    const resultCode = stk.ResultCode;

    if (resultCode === 0) {
      // Find user by last checkout? We stored email in AccountReference
      // Safaricom doesn't return AccountReference in callback, so we use metadata
      // Simplest: activate the most recent unpaid user with this phone
      const meta = {};
      (stk.CallbackMetadata?.Item || []).forEach(i => { meta[i.Name] = i.Value; });
      const phone = meta.PhoneNumber ? String(meta.PhoneNumber) : null;

      let user = null;
      if (phone) {
        let p = phone;
        if (p.startsWith("254")) p = "0" + p.slice(3);
        user = await User.findOne({ phone: p });
        if (!user) user = await User.findOne({ phone: phone });
      }
      if (user) {
        user.isActive = true;
        user.isPaid = true;
        user.membershipPaidAt = new Date();
        user.mpesaReceipt = meta.MpesaReceiptNumber || "";
        await user.save();
        console.log("Activated:", user.email);
      }
    }
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (e) {
    console.error(e);
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
};
