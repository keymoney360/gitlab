// api/stk.js - v10: Hardcoded callback + fixMyBooks built-in (no new file needed)
const PRODUCTS = {
  "forex-journal": { name: "Forex Trading Journal", amount: 150 },
  "forex-discipline": { name: "Forex Discipline Journal", amount: 200 }
};

// Daraja wants EAT (UTC+3), Vercel runs on UTC
function getTimestamp() {
  const eat = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const Y = eat.getUTCFullYear();
  const M = String(eat.getUTCMonth() + 1).padStart(2, "0");
  const D = String(eat.getUTCDate()).padStart(2, "0");
  const h = String(eat.getUTCHours()).padStart(2, "0");
  const m = String(eat.getUTCMinutes()).padStart(2, "0");
  const s = String(eat.getUTCSeconds()).padStart(2, "0");
  return `${Y}${M}${D}${h}${m}${s}`;
}

function base64(value) {
  return Buffer.from(value).toString("base64");
}

// 0704577216, +254704577216, 254704577216 -> 254704577216
function normalizePhone(phone) {
  let p = String(phone || "").replace(/\s+/g, "").replace(/^\+/, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("2540")) p = "254" + p.slice(4);
  return p;
}

module.exports = async (req, res) => {
  // GET = Check payment status + Fix old purchases
  if (req.method === "GET") {
    // FIX-MY-BOOKS: GET /api/stk?fixMyBooks=1 (with login token)
    // Copies all your PAID Purchases into purchasedBooks so Collection shows them
    if (req.query.fixMyBooks === "1") {
      try {
        const { connect, User, Purchase, auth } = require("./_db");
        await connect();
        const decoded = auth(req);
        if (!decoded) return res.status(401).json({ error: "Login first" });
        const user = await User.findOne({ email: decoded.email });
        if (!user) return res.status(404).json({ error: "User not found" });

        const norm = (p) => {
          let s = String(p || "").replace(/\s+/g, "").replace(/^\+/, "");
          if (s.startsWith("0")) s = "254" + s.slice(1);
          return s;
        };
        const phone254 = norm(user.phone || "");
        const phone0 = phone254 ? "0" + phone254.slice(3) : "";

        const paid = await Purchase.find({
          status: "paid",
          $or: [
            { userEmail: user.email },
            { phone: phone254 },
            { phone: phone0 },
            { phone: user.phone },
          ]
        });

        if (!user.purchasedBooks) user.purchasedBooks = [];
        for (const p of paid) {
          const pid = String(p.productId || "");
          if (pid && !user.purchasedBooks.includes(pid)) user.purchasedBooks.push(pid);
          if (pid === "book" && p.productName) {
            const nameKey = "name:" + p.productName;
            if (!user.purchasedBooks.includes(nameKey)) user.purchasedBooks.push(nameKey);
          }
          if (!p.userEmail) { p.userEmail = user.email; await p.save(); }
        }
        await user.save();
        return res.json({ success: true, fixed: paid.length, purchasedBooks: user.purchasedBooks });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    const id = req.query.checkoutRequestID || req.query.id;
    if (!id) return res.status(400).json({ paid: false });
    try {
      const { connect, Purchase } = require("./_db");
      await connect();
      const p = await Purchase.findOne({ checkoutRequestID: id });
      if (!p) return res.status(200).json({ paid: false, waiting: true });
      if (p.status === "paid") return res.status(200).json({ paid: true, amount: p.amount, receipt: p.receipt, productName: p.productName, productId: p.productId });
      if (p.status === "failed") return res.status(200).json({ paid: false, failed: true, reason: p.failReason });
      return res.status(200).json({ paid: false, waiting: true });
    } catch (e) { return res.status(200).json({ paid: false, waiting: true }); }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const body = req.body || {};
  const productId = body.productId || body.product || body.id || "";
  const rawPhone = body.phone;
  const frontendAmount = Number(body.amount || body.price || 0);
  const frontendName = body.productName || body.name || body.title || "";

  let product = PRODUCTS[productId];
  if (!product && frontendAmount > 0 && frontendName) {
    product = { name: frontendName, amount: frontendAmount };
  }
  if (!product || !product.amount || product.amount <= 0) {
    return res.status(400).json({ error: "Please select a valid product." });
  }
  if (product.amount < 10 || product.amount > 5000) {
    return res.status(400).json({ error: "Invalid amount for this product." });
  }

  const phone = normalizePhone(rawPhone);
  if (!/^2547\d{8}$/.test(phone)) {
    return res.status(400).json({ error: "Enter a valid Kenyan mobile number. Example: 0704577216" });
  }

  const storeNumber = String(process.env.MPESA_SHORTCODE || "1275105").trim();
  const tillNumber = String(process.env.MPESA_TILL_NUMBER || "1745713").trim();
  const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY } = process.env;
  const CALLBACK_URL = "https://gitlab-sage.vercel.app/api/mpesa-callback";

  const missing = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_PASSKEY"]
    .filter((key) => !process.env[key]);
  if (missing.length) {
    return res.status(500).json({ error: `Missing: ${missing.join(", ")}` });
  }

  try {
    const authHeader = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
    const tokenResponse = await fetch(
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${authHeader}` } }
    );
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Daraja token error", tokenData);
      return res.status(502).json({ error: "M-Pesa authentication failed. Check production keys." });
    }

    const timestamp = getTimestamp();
    const password = base64(`${storeNumber}${MPESA_PASSKEY}${timestamp}`);

    const payload = {
      BusinessShortCode: storeNumber,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerBuyGoodsOnline",
      Amount: product.amount,
      PartyA: phone,
      PartyB: tillNumber,
      PhoneNumber: phone,
      CallBackURL: CALLBACK_URL,
      AccountReference: "GITLAB",
      TransactionDesc: product.name.slice(0, 20),
    };

    console.log("STK Request:", {
      BusinessShortCode: storeNumber,
      PartyB: tillNumber,
      PartyA: phone,
      Amount: product.amount,
      Product: product.name,
      ProductId: productId,
      CallBackURL: CALLBACK_URL,
    });

    const stkResponse = await fetch(
      "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const stkData = await stkResponse.json();
    console.log("Daraja STK Response:", stkData);

    if (!stkResponse.ok || stkData.ResponseCode !== "0") {
      return res.status(502).json({
        error: stkData.errorMessage || stkData.ResponseDescription || "Safaricom rejected the STK request.",
        daraja: stkData,
      });
    }

    // Save pending purchase - ALSO save userEmail if frontend sent it / token
    try {
      const { connect, Purchase, auth } = require("./_db");
      await connect();
      let userEmail = body.userEmail || body.email || "";
      try {
        const decoded = auth(req);
        if (decoded && decoded.email) userEmail = decoded.email;
      } catch {}
      await Purchase.create({
        checkoutRequestID: stkData.CheckoutRequestID,
        phone,
        productId: productId || "book",
        productName: product.name,
        amount: product.amount,
        status: "pending",
        userEmail: userEmail || undefined,
      });
    } catch (e) { console.log("Pending save failed, continuing:", e.message); }

    return res.status(200).json({
      success: true,
      checkoutRequestID: stkData.CheckoutRequestID,
      message: `STK Push sent for KSh ${product.amount}. Check ${phone} and enter your M-Pesa PIN.`,
    });
  } catch (error) {
    console.error("STK initiation error", error);
    return res.status(500).json({ error: "Unable to contact M-Pesa. Please try again." });
  }
};
