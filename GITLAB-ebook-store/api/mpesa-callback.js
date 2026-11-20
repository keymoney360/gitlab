// api/mpesa-callback.js - FIXED: Actually activates membership on ResultCode 0
const { connect, User } = require("./_db");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ResultCode: 1, ResultDesc: "Method not allowed" });
  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) {
      console.warn("Unrecognized M-Pesa callback payload");
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const checkoutRequestID = callback.CheckoutRequestID;
    const resultCode = callback.ResultCode;
    const resultDesc = callback.ResultDesc;

    console.log("M-Pesa callback", JSON.stringify({ checkoutRequestID, resultCode, resultDesc }));

    // Payment failed / cancelled - do nothing, just ack
    if (resultCode !== 0) {
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    // Extract metadata: Amount, MpesaReceiptNumber, PhoneNumber
    const items = callback.CallbackMetadata?.Item || [];
    const get = (name) => {
      const it = items.find((i) => i.Name === name);
      return it ? it.Value : null;
    };

    const amount = Number(get("Amount"));
    const receipt = get("MpesaReceiptNumber");
    const phone254 = String(get("PhoneNumber") || ""); // e.g. 254704577216
    const phone0 = phone254.startsWith("254") ? "0" + phone254.slice(3) : phone254;

    console.log("CALLBACK SUCCESS:", { amount, receipt, phone254, phone0, checkoutRequestID });

    await connect();

    // Find user by phone - try both formats: 254... and 07...
    const user = await User.findOne({
      $or: [
        { phone: phone254 }, { phone: phone0 },
        { phoneNumber: phone254 }, { phoneNumber: phone0 },
        { mobile: phone254 }, { mobile: phone0 },
      ]
    });

    if (!user) {
      console.log("CALLBACK: No user found for phone", phone254, phone0);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted - user not found" });
    }

    // KSh 300 = Membership, KSh 150 / 200 = Book
    if (amount === 300) {
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
      user.isMember = true;
      user.membershipStatus = "active";
      user.membershipPaidAt = now;
      user.membershipExpiresAt = expires;
      user.lastMpesaReceipt = receipt;
      user.lastCheckoutRequestID = checkoutRequestID;
      await user.save();
      console.log("CALLBACK: ACTIVATED membership for", user._id, user.phone, "receipt", receipt);
    } else {
      // Book purchase - add to library / purchases
      user.purchasedBooks = user.purchasedBooks || [];
      if (!user.purchasedBooks.includes(amount)) user.purchasedBooks.push(amount);
      user.lastMpesaReceipt = receipt;
      await user.save();
      console.log("CALLBACK: Book purchase recorded for", user._id, "amount", amount);
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("Callback processing error", error);
    // Always return 200 to Safaricom, else it will retry forever
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Received" });
  }
};
