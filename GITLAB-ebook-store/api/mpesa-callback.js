// api/mpesa-callback.js - v5: Books -> purchasedBooks + Membership - FIXED
const { connect, User, Purchase } = require("./_db");

function normalizePhone(p) {
  let s = String(p || "").replace(/\s+/g, "").replace(/^\+/, "");
  if (s.startsWith("0")) s = "254" + s.slice(1);
  return s;
}

module.exports = async (req, res) => {
  if (req.method === "GET") return res.status(200).json({ ResultCode: 0, ResultDesc: "OK" });
  try {
    await connect();
    const stk = req.body?.Body?.stkCallback;
    if (!stk) return res.json({ ResultCode: 0, ResultDesc: "OK" });

    const code = Number(stk.ResultCode);
    const checkoutRequestID = stk.CheckoutRequestID || "";
    const resultDesc = stk.ResultDesc || "";
    const meta = stk.CallbackMetadata?.Item || [];
    const get = (n) => { const f = meta.find(x => x.Name === n); return f ? f.Value : null; };
    const receipt = get("MpesaReceiptNumber");
    const phoneRaw = String(get("PhoneNumber") || "");

    if (code !== 0) {
      if (checkoutRequestID) await Purchase.updateOne({ checkoutRequestID }, { status: "failed", failReason: resultDesc });
      return res.json({ ResultCode: 0, ResultDesc: "OK" });
    }

    // --- 1. Mark Purchase paid ---
    let purchase = null;
    if (checkoutRequestID) {
      purchase = await Purchase.findOne({ checkoutRequestID });
      if (purchase && purchase.status !== "paid") {
        purchase.status = "paid";
        purchase.receipt = receipt;
        purchase.paidAt = new Date();
        await purchase.save();
        console.log("✅ BOOK MARKED PAID:", purchase.productName);
      }
    }

    // --- 2. Find User (by email on Purchase, or by phone) ---
    const phone254 = normalizePhone(phoneRaw || purchase?.phone || "");
    const phone0 = phone254.startsWith("254") ? "0" + phone254.slice(3) : phone254;

    let user = null;
    if (purchase?.userEmail) user = await User.findOne({ email: purchase.userEmail });
    if (!user && phone254) user = await User.findOne({ phone: phone254 });
    if (!user && phone0) user = await User.findOne({ phone: phone0 });

    console.log("User found for purchase?", !!user, user ? user.email : "NO USER - phone:" + phone254);

    if (user && purchase) {
      // Save email onto Purchase for future lookups
      if (!purchase.userEmail) {
        purchase.userEmail = user.email;
        await purchase.save();
      }

      // --- 3. ADD BOOK TO COLLECTION ---
      const pid = String(purchase.productId || "");
      const isMembership = pid.toLowerCase().includes("member");
      if (!isMembership && pid) {
        if (!user.purchasedBooks) user.purchasedBooks = [];
        if (!user.purchasedBooks.includes(pid)) {
          user.purchasedBooks.push(pid);
          console.log("✅ ADDED TO COLLECTION:", pid, "for", user.email);
        } else {
          console.log("Already in collection:", pid);
        }
        // Also save by productName for dynamic books like "Fred Gross Stories"
        // Frontend can match by name if productId is generic "book"
        if (pid === "book" && purchase.productName) {
          const nameKey = "name:" + purchase.productName;
          if (!user.purchasedBooks.includes(nameKey)) user.purchasedBooks.push(nameKey);
        }
        await user.save();
      }

      // --- 4. FIXED: MARK USER AS PAID FOR ANY PAYMENT (book OR membership) ---
      // This is what Admin checks to show PAID
      if (!user.isPaid) {
        user.isPaid = true;
        user.lastMpesaReceipt = receipt;
        await user.save();
      }

      // Only membership gets 30-day expiry
      if (isMembership) {
        if (!user.membershipPaid) {
          user.membershipPaid = true;
          user.membershipStatus = "active";
          user.membershipExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await user.save();
        }
      }

      // Referral for BOTH book + membership (only once per user)
      if (!user.referralPaid) {
        user.referralPaid = true;
        await user.save();

        if (user.referredBy) {
          const l1 = await User.findOne({ email: user.referredBy });
          if (l1) {
            l1.balance = (l1.balance || 0) + 50;
            l1.totalEarned = (l1.totalEarned || 0) + 50;
            await l1.save();
            const db = require("mongoose").connection.db;
            await db.collection("referrals").insertOne({ referrerEmail: l1.email, referrerCode: l1.referralCode, referredEmail: user.email, referredName: user.name, level: 1, status: "APPROVED", commission: 50, createdAt: new Date() });
            if (l1.referredBy) {
              const l2 = await User.findOne({ email: l1.referredBy });
              if (l2) {
                l2.balance = (l2.balance || 0) + 30;
                l2.totalEarned = (l2.totalEarned || 0) + 30;
                await l2.save();
                await db.collection("referrals").insertOne({ referrerEmail: l2.email, referrerCode: l2.referralCode, referredEmail: user.email, referredName: user.name, level: 2, status: "APPROVED", commission: 30, createdAt: new Date() });
              }
            }
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
