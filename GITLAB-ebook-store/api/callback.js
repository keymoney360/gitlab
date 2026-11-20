// api/mpesa-callback.js - FINAL: Activates payer + pays referrer
const { connect, User, Referral } = require("./_db");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ResultCode: 1, ResultDesc: "Method not allowed" });
  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    if (callback.ResultCode !== 0) return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

    const items = callback.CallbackMetadata?.Item || [];
    const get = (name) => { const it = items.find((i) => i.Name === name); return it ? it.Value : null; };
    const amount = Number(get("Amount"));
    const receipt = get("MpesaReceiptNumber");
    const phone254 = String(get("PhoneNumber") || "");
    const phone0 = phone254.startsWith("254") ? "0" + phone254.slice(3) : phone254;

    await connect();
    const user = await User.findOne({ $or: [{ phone: phone254 }, { phone: phone0 }] });
    if (!user) return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted - user not found" });

    if (amount === 300) {
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      user.isPaid = true;
      user.membershipPaid = true;
      user.membershipStatus = "active";
      user.membershipPaidAt = now;
      user.membershipExpiresAt = expires;
      user.lastMpesaReceipt = receipt;
      user.lastCheckoutRequestID = callback.CheckoutRequestID;
      await user.save();

      // --- PAY REFERRER ---
      // Friend was referred by you? Pay you commission
      if (user.referredBy) {
        const referrer = await User.findOne({ email: user.referredBy });
        if (referrer) {
          const commission = 50; // <-- Change this to your commission for KSh 300 membership
          referrer.balance = (referrer.balance || 0) + commission;
          referrer.totalEarned = (referrer.totalEarned || 0) + commission;
          await referrer.save();
          console.log("COMMISSION: Paid", commission, "to", referrer.email, "for", user.email);

          // Mark referral as APPROVED so dashboard shows it
          await Referral.updateOne(
            { email: user.email, referrerEmail: user.referredBy },
            { $set: { status: "APPROVED", commission: commission } },
            { upsert: true }
          );
        }
      }
      // Also support referredByCode if referredBy email is empty
      else if (user.referredByCode) {
        const referrer = await User.findOne({ $or: [{ referralCode: user.referredByCode }, { refCode: user.referredByCode }] });
        if (referrer) {
          const commission = 50;
          referrer.balance = (referrer.balance || 0) + commission;
          referrer.totalEarned = (referrer.totalEarned || 0) + commission;
          await referrer.save();
          await Referral.updateOne(
            { email: user.email, referrerEmail: referrer.email },
            { $set: { status: "APPROVED", commission: commission } },
            { upsert: true }
          );
        }
      }
    } else {
      // Book purchase - no commission
      const bookName = amount === 150 ? "forex-journal" : amount === 200 ? "forex-discipline" : `book-${amount}`;
      if (!user.purchasedBooks) user.purchasedBooks = [];
      if (!user.purchasedBooks.includes(bookName)) user.purchasedBooks.push(bookName);
      user.lastMpesaReceipt = receipt;
      await user.save();
    }
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Received" });
  }
};
