// api/mpesa-callback.js - FINAL: Activates membership on ResultCode 0
// Matches GITLAB schema: isPaid + membershipPaid
const { connect, User } = require("./_db");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ResultCode: 1, ResultDesc: "Method not allowed" });
  }

  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) {
      console.warn("Unrecognized M-Pesa callback payload", JSON.stringify(req.body));
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const checkoutRequestID = callback.CheckoutRequestID;
    const resultCode = callback.ResultCode;
    const resultDesc = callback.ResultDesc;

    console.log("M-Pesa callback", JSON.stringify({ checkoutRequestID, resultCode, resultDesc }));

    // Payment failed / cancelled / wrong PIN - do NOT activate
    if (resultCode !== 0) {
      console.log("CALLBACK: Payment NOT successful, skipping activation. Code:", resultCode);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    // Extract metadata from Safaricom
    const items = callback.CallbackMetadata?.Item || [];
    const get = (name) => {
      const it = items.find((i) => i.Name === name);
      return it ? it.Value : null;
    };

    const amount = Number(get("Amount"));
    const receipt = get("MpesaReceiptNumber");
    const phone254 = String(get("PhoneNumber") || ""); // e.g. 254704577216
    const phone0 = phone254.startsWith("254") ? "0" + phone254.slice(3) : phone254; // e.g. 0704577216

    console.log("CALLBACK SUCCESS:", { amount, receipt, phone254, phone0, checkoutRequestID });

    await connect();

    // Find user by phone - try both formats
    const user = await User.findOne({
      $or: [{ phone: phone254 }, { phone: phone0 }]
    });

    if (!user) {
      console.log("CALLBACK: No user found for phone", phone254, phone0);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted - user not found" });
    }

    // KSh 300 = Membership
    if (amount === 300) {
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

      // YOUR REAL FIELDS from _db.js - set BOTH
      user.isPaid = true;
      user.membershipPaid = true;
      user.membershipStatus = "active";
      user.membershipPaidAt = now;
      user.membershipExpiresAt = expires;
      user.lastMpesaReceipt = receipt;
      user.lastCheckoutRequestID = checkoutRequestID;

      await user.save();
      console.log("CALLBACK: ACTIVATED membership for", user.email, user.phone, "receipt", receipt);
    } else {
      // Book purchase - 150 = forex-journal, 200 = forex-discipline
      const bookName = amount === 150 ? "forex-journal" : amount === 200 ? "forex-discipline" : `book-${amount}`;
      if (!user.purchasedBooks) user.purchasedBooks = [];
      if (!user.purchasedBooks.includes(bookName)) user.purchasedBooks.push(bookName);
      user.lastMpesaReceipt = receipt;
      user.lastCheckoutRequestID = checkoutRequestID;
      await user.save();
      console.log("CALLBACK: Book purchase recorded for", user.email, bookName, "amount", amount);
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("Callback processing error", error);
    // Always return 200 to Safaricom, else it will retry forever
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Received" });
  }
};
