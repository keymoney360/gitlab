const { connect, auth } = require("./_db");

async function safeJson(res, label) {
  const text = await res.text();
  if (!text) throw new Error(label + " returned EMPTY response (status " + res.status + ") - Check MPESA keys / environment");
  try { return JSON.parse(text); }
  catch { throw new Error(label + " returned non-JSON (status " + res.status + "): " + text.slice(0, 300)); }
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    await connect();
    const me = auth(req);
    if (!me) return res.status(401).json({ error: "Login required" });
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: "Phone required" });

    let cleanPhone = String(phone).replace(/\s/g, "");
    if (cleanPhone.startsWith("0")) cleanPhone = "254" + cleanPhone.slice(1);
    if (cleanPhone.startsWith("+")) cleanPhone = cleanPhone.slice(1);

    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const shortcode = process.env.MPESA_SHORTCODE || process.env.MPESA_PAYBILL;
    const passkey = process.env.MPESA_PASSKEY;

    if (!consumerKey || !consumerSecret || !shortcode || !passkey) {
      return res.status(500).json({ error: "M-Pesa NOT configured in Vercel. Missing: " + (!consumerKey ? "KEY " : "") + (!consumerSecret ? "SECRET " : "") + (!shortcode ? "SHORTCODE " : "") + (!passkey ? "PASSKEY" : "") });
    }

    const authStr = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const tokenRes = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: `Basic ${authStr}` }
    });
    const tokenData = await safeJson(tokenRes, "Safaricom OAuth");
    if (!tokenData.access_token) return res.status(500).json({ error: "M-Pesa auth failed - Safaricom says: " + JSON.stringify(tokenData) });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const timestamp = now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");

    const stkRes = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: 300,
        PartyA: cleanPhone,
        PartyB: shortcode,
        PhoneNumber: cleanPhone,
        CallBackURL: "https://gitlab-sage.vercel.app/api/callback",
        AccountReference: me.email,
        TransactionDesc: "GITLAB Membership 300"
      })
    });
    const stkData = await safeJson(stkRes, "Safaricom STK");
    if (stkData.ResponseCode !== "0") {
      return res.status(400).json({ error: stkData.ResponseDescription || "STK failed: " + JSON.stringify(stkData) });
    }
    return res.json({ success: true, checkoutId: stkData.CheckoutRequestID });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error: " + e.message });
  }
};
