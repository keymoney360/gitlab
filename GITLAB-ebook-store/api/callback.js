// api/mpesa-callback.js - FINAL FIXED: uses pending Purchase, not price-guessing
const { connect, User, Referral, Purchase } = require("./_db");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ResultCode: 1, ResultDesc: "Method not allowed" });
  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    if (callback.ResultCode !== 0) {
      // Mark pending as failed so frontend polling can show "Cancelled"
      if (Purchase) {
        await connect();
        await Purchase.updateOne(
          { checkoutRequestID: callback.CheckoutRequestID },
          { $set: { status: "failed", failReason: callback.ResultDesc } }
        );
      }
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const items = callback.CallbackMetadata?.Item || [];
    const get = (name) => { const it = items.find((i) => i.Name === name); return it ? it.Value : null; };
    const amount = Number(get("Amount"));
    const receipt = get("MpesaReceiptNumber");
    const phone254 = String(get("PhoneNumber") || "");
    const phone0 = phone254.startsWith("254") ? "0" + phone254.slice(3) : phone254;
    const checkoutId = callback.CheckoutRequestID;

    await connect();

    // 1. Find the pending purchase saved in /api/stk.js - this tells us WHICH book
    let pending = null;
    if (Purchase) {
      pending = await Purchase.findOne({ checkoutRequestID: checkoutId });
      if (pending) {
        pending.status = "paid";
        pending.receipt = receipt;
        pending.amount = amount;
        await pending.save();
      }
    }
    const bookName = pending?.productId || pending?.productName || (amount === 150 ? "forex-journal" : amount === 200 ? "forex-discipline" : `book-${amount}`);
    const bookTitle = pending?.productName || bookName;

    const user = await User.findOne({ $or: [{ phone: phone254 }, { phone: phone0 }] });

    // 2. Membership KSh 300 - keep your existing logic
    if (amount === 300 && user) {
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      user.isPaid = true;
      user.membershipPaid = true;
      user.membershipStatus = "active";
      user.membershipPaidAt = now;
      user.membershipExpiresAt = expires;
      user.lastMpesaReceipt = receipt;
      user.lastCheckoutRequestID = checkoutId;
      await user.save();

      if (user.referredBy) {
        const referrer = await User.findOne({ email: user.referredBy });
        if (referrer) {
          referrer.balance = (referrer.balance || 0) + 50;
          referrer.totalEarned = (referrer.totalEarned || 0) + 50;
          await referrer.save();
          await Referral.updateOne(
            { email: user.email, referrerEmail: user.referredBy },
            { $set: { status: "APPROVED", commission: 50 } },
            { upsert: true }
          );
        }
      } else if (user.referredByCode) {
        const referrer = await User.findOne({ $or: [{ referralCode: user.referredByCode }, { refCode: user.referredByCode }] });
        if (referrer) {
          referrer.balance = (referrer.balance || 0) + 50;
          referrer.totalEarned = (referrer.totalEarned || 0) + 50;
          await referrer.save();
          await Referral.updateOne(
            { email: user.email, referrerEmail: referrer.email },
            { $set: { status: "APPROVED", commission: 50 } },
            { upsert: true }
          );
        }
      }
    }
    // 3. Book purchase - FIXED: use real bookName, not price guess, and save even if no user
    else if (amount !== 300) {
      if (user) {
        if (!user.purchasedBooks) user.purchasedBooks = [];
        if (!user.purchasedBooks.includes(bookName)) user.purchasedBooks.push(bookName);
        user.lastMpesaReceipt = receipt;
        user.lastCheckoutRequestID = checkoutId;
        await user.save();
      }
      // Even without a user, Purchase record above is now "paid"
      // so /api/check-payment can confirm it for guest buyers
      if (pending && user) pending.userEmail = user.email;
      if (pending) await pending.save();
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Received" });
  }
};
