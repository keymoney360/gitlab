// api/stk.js - FIXED: accepts product / productId / productName + amount from frontend
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
  // This is safe because we validate amount below
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

  const storeNumber = String(process.env.MPESA_SHORTCODE || "1275105").trim();
  const tillNumber = String(process.env.MPESA_TILL_NUMBER || "1745713").trim();
  const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, MPESA_CALLBACK_URL } = process.env;

  const missing = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_PASSKEY", "MPESA_CALLBACK_URL"]
    .filter((key) => !process.env[key]);
  if (missing.length) {
    return res.status(500).json({ error: `Missing: ${missing.join(", ")}` });
  }

  try {
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
