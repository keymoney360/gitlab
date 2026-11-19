const PRODUCTS = {
  "forex-journal": { name: "Forex Trading Journal", amount: 150 },
  "forex-discipline": { name: "Forex Discipline Journal", amount: 200 }
};

function getTimestamp() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") + String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0") + String(d.getSeconds()).padStart(2, "0");
}
function base64(value) { return Buffer.from(value).toString("base64"); }

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const { productId, phone } = req.body || {};
  const product = PRODUCTS[productId];
  if (!product) return res.status(400).json({ error: "Please select a valid product." });
  if (!/^2547\d{8}$/.test(String(phone || ""))) {
    return res.status(400).json({ error: "Enter a valid Kenyan mobile number." });
  }

  const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL } = process.env;
  const missing = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY", "MPESA_CALLBACK_URL"]
    .filter(key => !process.env[key]);
  if (missing.length) return res.status(500).json({ error: `M-Pesa configuration is incomplete. Missing: ${missing.join(", ")}` });

  try {
    const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
    const tokenResponse = await fetch("https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: `Basic ${auth}` }
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Daraja token error", tokenData);
      return res.status(502).json({ error: "M-Pesa authentication failed. Check your production API credentials." });
    }

    const timestamp = getTimestamp();
    const shortcode = MPESA_SHORTCODE;
    const password = base64(`${shortcode}${MPESA_PASSKEY}${timestamp}`);
    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerBuyGoodsOnline",
      Amount: product.amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: "GITLAB",
      TransactionDesc: product.name.slice(0, 20)
    };

    const stkResponse = await fetch("https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const stkData = await stkResponse.json();
    if (!stkResponse.ok || stkData.ResponseCode !== "0") {
      console.error("Daraja STK error", stkData);
      return res.status(502).json({ error: stkData.errorMessage || stkData.ResponseDescription || "Safaricom rejected the STK request. Check your shortcode, passkey and transaction type." });
    }
    return res.status(200).json({
      success: true,
      checkoutRequestID: stkData.CheckoutRequestID,
      message: `STK Push sent for KSh ${product.amount}. Check ${phone} and enter your M-Pesa PIN to complete payment.`
    });
  } catch (error) {
    console.error("STK initiation error", error);
    return res.status(500).json({ error: "Unable to contact M-Pesa. Please try again." });
  }
};
