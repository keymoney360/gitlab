// api/stk.js - v8 FIXED: POST = send STK, GET = check payment (no new file needed)
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
  // GET = Check payment status - frontend polls this
  // Frontend will call: GET /api/stk?checkoutRequestID=xxxx
  if (req.method === "GET") {
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

  // FIX: accept ALL names frontend might send
  const body = req.body || {};
  const productId = body.productId || body.product || body.id || "";
  const rawPhone = body.phone;
  const frontendAmount = Number(body.amount || body.price || 0);
  const frontendName = body.productName || body.name || body.title || "";

  // 1. Try known static books first (trusted price)
  let product = PRODUCTS[productId];

  // 2. If not a static book, use frontend name + amount (dynamic books like Father Brown)
  if (!product && frontendAmount > 0 && frontendName) {
    product = { name: frontendName, amount: frontendAmount };
  }

  // 3. If still nothing, reject
  if (!product || !product.amount || product.amount <= 0) {
    return res.status(400).json({ error: "Please select a valid product." });
  }

  // Safety: don't let anyone charge KSh 1 or KSh 1,000,000 by editing JS
  if (product.amount < 10 || product.amount > 5000) {
    return res.status(400).json({ error: "Invalid amount for this product." });
  }

  const phone = normalizePhone(rawPhone);
  if (!/^2547\d{8}$/.test(phone)) {
    return res.status(400).json({ error: "Enter a valid Kenyan mobile number. Example: 0704577216" });
  }

  // YOUR NUMBERS - Store 1275105, Till 1745713
  const storeNumber = String(process.env.MPESA_SHORTCODE || "1275105").trim();
  const tillNumber = String(process.env.MPESA_TILL_NUMBER || "1745713").trim();
  const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, MPESA_CALLBACK_URL } = process.env;

  const missing = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_PASSKEY", "MPESA_CALLBACK_URL"]
    .filter((key) => !process.env[key]);
  if (missing.length) {
    return res.status(500).json({ error: `Missing: ${missing.join(", ")}` });
  }

  try {
    // 1. Token - PRODUCTION
    const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
    const tokenResponse = await fetch(
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Daraja token error", tokenData);
      return res.status(502).json({ error: "M-Pesa authentication failed. Check production keys." });
    }

    // 2. STK Payload - Store in BusinessShortCode, Till in PartyB
    const timestamp = getTimestamp();
    const password = base64(`${storeNumber}${MPESA_PASSKEY}${timestamp}`);

    const payload = {
      BusinessShortCode: storeNumber, // 1275105 - STORE
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerBuyGoodsOnline", // Till
      Amount: product.amount,
      PartyA: phone, // 254704577216 - Customer
      PartyB: tillNumber, // 1745713 - TILL
      PhoneNumber: phone,
      CallBackURL: MPESA_CALLBACK_URL,
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
    });

    // 3. Send STK - PRODUCTION
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

    // 4. Save pending purchase so callback knows WHICH book this was
    try {
      const { connect, Purchase } = require("./_db");
      await connect();
      await Purchase.create({
        checkoutRequestID: stkData.CheckoutRequestID,
        phone,
        productId: productId || "book",
        productName: product.name,
        amount: product.amount,
        status: "pending",
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
