// api/mpesa-callback.js - v3 MERGED: Handles BOTH Books (Purchase) + Membership (User)
const { connect, User, Purchase } = require("./_db");

module.exports = async (req, res) => {
  console.log("=== MPESA CALLBACK HIT ===", req.method);

  if (req.method === "GET") {
    return res.status(200).json({ ResultCode: 0, ResultDesc: "OK" });
  }

  try {
    await connect();
    const stk = req.body?.Body?.stkCallback;
    console.log("Callback body:", JSON.stringify(req.body || {}).slice(0, 2000));

    if (!stk) return res.json({ ResultCode: 0, ResultDesc: "OK" });

    const code = Number(stk.ResultCode);
    const checkoutRequestID = stk.CheckoutRequestID || "";
    const resultDesc = stk.ResultDesc || "";

    const meta = stk.CallbackMetadata?.Item || [];
    const get = (n) => { const f = meta.find(x => x.Name === n); return f ? f.Value : null; };
    const receipt = get("MpesaReceiptNumber");
    const phoneRaw = String(get("PhoneNumber") || "");
    const amount = get("Amount");

    console.log("Parsed:", { checkoutRequestID, code, receipt, phoneRaw, amount });

    if (code !== 0) {
      // FAILED / CANCELLED - mark Purchase as failed if we can find it
      if (checkoutRequestID && Purchase) {
        try {
          await Purchase.updateOne({ checkoutRequestID }, { status: "failed", failReason: resultDesc });
          console.log("Marked Purchase FAILED:", checkoutRequestID);
        } catch (e) { console.log("Failed-mark error:", e.message); }
      }
      return res.json({ ResultCode: 0, ResultDesc: "OK" });
    }

    // ===== 1. BOOKS: Update Purchase by CheckoutRequestID =====
    let purchase = null;
    if (checkoutRequestID && Purchase) {
      try {
        purchase = await Purchase.findOne({ checkoutRequestID });
        console.log("Purchase found?", !!purchase, purchase ? { productName: purchase.productName, status: purchase.status } : "");
        if (purchase && purchase.status !== "paid") {
          purchase.status = "paid";
          purchase.receipt = receipt;
          purchase.paidAt = new Date();
          await purchase.save();
          console.log("✅ BOOK MARKED PAID:", purchase.productName, receipt);
        }
      } catch (e) { console.log("Purchase update error:", e.message); }
    }

    // Use phone from Purchase if callback metadata has no phone
    const phone = phoneRaw || (purchase ? String(purchase.phone || "") : "");

    // ===== 2. MEMBERSHIP: Your original logic - keep it =====
    // Only run membership logic if this was a membership payment
    // We detect it: Purchase productId contains "member" OR no Purchase at all (old membership flow)
    const isMembershipPayment = (purchase && purchase.productId && String(purchase.productId).toLowerCase().includes("member")) || !purchase;

    if (isMembershipPayment && phone) {
      // Find payer by phone - try both formats
      let user = await User.findOne({ phone });
      if (!user) {
        const local = "0" + phone.slice(3);
        user = await User.findOne({ phone: local });
      }
      if (user) {
        if (!(user.isPaid && user.membershipPaid)) {
          user.isPaid = true;
          user.membershipPaid = true;
          user.membershipStatus = "active";
          user.lastMpesaReceipt = receipt;
          user.membershipExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await user.save();
          console.log("✅ MEMBERSHIP ACTIVATED for", user.email || user.phone);

          // --- PAY REFERRALS ---
          if (user.referredBy) {
            const l1 = await User.findOne({ email: user.referredBy });
            if (l1) {
              l1.balance = (l1.balance || 0) + 50;
              l1.totalEarned = (l1.totalEarned || 0) + 50;
              await l1.save();

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
        } else {
          console.log("Membership already paid, skipping");
        }
      } else {
        console.log("User not found for membership, phone:", phone);
      }
    } else {
      console.log("Book payment - skipping membership logic");
    }

    return res.json({ ResultCode: 0, ResultDesc: "OK" });
  } catch (e) {
    console.error("callback error", e);
    return res.json({ ResultCode: 0, ResultDesc: "OK" });
  }
};
