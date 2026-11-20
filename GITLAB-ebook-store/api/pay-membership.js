const { connect, auth } = require("./_db");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    await connect();
    const me = auth(req);
    if (!me) return res.status(401).json({ error: "Login required - please Login again" });
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: "Phone required" });

    let cleanPhone = phone.replace(/\s/g, "");
    if (cleanPhone.startsWith("0")) cleanPhone = "254" + cleanPhone.slice(1);

    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const shortcode = process.env.MPESA_SHORTCODE || process.env.MPESA_PAYBILL;
    const passkey = process.env.MPESA_PASSKEY;

    if (!consumerKey || !consumerSecret || !shortcode || !passkey) {
      return res.status(500).json({ error: "M-Pesa NOT configured in Vercel. Add MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY in Vercel > Settings > Environment Variables" });
    }

    const callbackUrl = process.env.MPESA_CALLBACK_URL || "https://gitlab-sage.vercel.app/api/callback";
    const authStr = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const tokenRes = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: `Basic ${authStr}` }
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(500).json({ error: "M-Pesa auth failed - check Consumer Key/Secret" });
    const accessToken = tokenData.access_token;

    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      String(now.getMonth()+1).padStart(2,"0") +
      String(now.getDate()).padStart(2,"0") +
      String(now.getHours()).padStart(2,"0") +
      String(now.getMinutes()).padStart(2,"0") +
      String(now.getSeconds()).padStart(2,"0");
    const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");

    const stkRes = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: 300,
        PartyA: cleanPhone,
        PartyB: shortcode,
        PhoneNumber: cleanPhone,
        CallBackURL: callbackUrl,
        AccountReference: me.email,
        TransactionDesc: "GITLAB Membership 300"
      })
    });
    const stkData = await stkRes.json();
    if (stkData.ResponseCode !== "0") {
      return res.status(400).json({ error: stkData.ResponseDescription || "STK failed - check Shortcode/Passkey" });
    }
    return res.json({ success: true, checkoutId: stkData.CheckoutRequestID });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error: " + e.message });
  }
};
