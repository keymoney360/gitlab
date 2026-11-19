const PRODUCTS = {
  "forex-journal": { name: "Forex Trading Journal", amount: 150 },
  "forex-discipline": { name: "Forex Discipline Journal", amount: 200 }
};

// Daraja expects EAT (UTC+3), Vercel servers run on UTC
// Without this, your password is 3 hours wrong
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

// Always convert 0704577216, +254704577216, 254704577216 -> 254704577216
function normalizePhone(phone) {
  let p = String(phone || "").replace(/\s+/g, "").replace(/^\+/, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("2540")) p = "254" + p.slice(4); // fix 2540704... bug
  return p;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { productId, phone: rawPhone } = req.body || {};
  const product = PRODUCTS[productId];
  if (!product) {
    return res.status(400).json({ error: "Please select a valid product." });
  }

  const phone = normalizePhone(rawPhone);
  if (!/^2547\d{8}$/.test(phone)) {
    return res.status(400).json({ error: "Enter a valid Kenyan mobile number. Example: 0704577216" });
  }

  const {
    MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET,
    MPESA_SHORTCODE,
    MPESA_PASSKEY,
    MPESA_CALLBACK_URL,
    MPESA_TRANSACTION_TYPE // optional: set in Vercel if you ever switch to Paybill
  } = process.env;

  const missing = [
    "MPESA_CONSUMER_KEY",
    "MPESA_CONSUMER_SECRET",
    "MPESA_SHORTCODE",
    "MPESA_PASSKEY",
    "MPESA_CALLBACK_URL",
  ].filter((key) => !process.env[key]);

  if (missing.length) {
    return res.status(500).json({ error: `M-Pesa configuration is incomplete. Missing: ${missing.join(", ")}` });
  }

  try {
    // 1. Get Token - PRODUCTION URL
    const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
    const tokenResponse = await fetch(
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Daraja token error", tokenData);
      return res.status(502).json({ error: "M-Pesa authentication failed. Check your production API credentials." });
    }

    // 2. Build STK Payload
    const timestamp = getTimestamp();
    const shortcode = String(MPESA_SHORTCODE).trim();
    const password = base64(`${shortcode}${MPESA_PASSKEY}${timestamp}`);

    // For Till 1275105 = CustomerBuyGoodsOnline
    // For Paybill = CustomerPayBillOnline
    // Set MPESA_TRANSACTION_TYPE in Vercel if you want to override
    const transactionType = MPESA_TRANSACTION_TYPE || "CustomerBuyGoodsOnline";

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: product.amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: "GITLAB",
      TransactionDesc: product.name.slice(0, 20),
    };

    console.log("STK Request:", {
      BusinessShortCode: shortcode,
      TransactionType: transactionType,
      Amount: product.amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      Timestamp: timestamp,
    });

    // 3. Send STK Push - PRODUCTION URL
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
      console.error("Daraja STK error", stkData);
      return res.status(502).json({
        error: stkData.errorMessage || stkData.ResponseDescription || "Safaricom rejected the STK request.",
        daraja: stkData, // now frontend can see real reason
      });
    }

    return res.status(200).json({
      success: true,
      checkoutRequestID: stkData.CheckoutRequestID,
      message: `STK Push sent for KSh ${product.amount}. Check ${phone} and enter your M-Pesa PIN to complete payment.`,
    });
  } catch (error) {
    console.error("STK initiation error", error);
    return res.status(500).json({ error: "Unable to contact M-Pesa. Please try again." });
  }
};
