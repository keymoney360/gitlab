// api/pay-membership.js - NO axios, uses native fetch
const { connect, User, jwt } = require("./_db");

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const authH = req.headers.authorization || "";
    const token = authH.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Login again - no token" });

    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET || "gitlab-secret"); }
    catch { return res.status(401).json({ error: "Session expired - Login again" }); }

    await connect();

    let { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: "Phone required" });
    phone = String(phone).replace(/[\s+]/g, "");
    if (phone.startsWith("0")) phone = "254" + phone.slice(1);
    if (phone.length !== 12) return res.status(400).json({ error: "Enter valid phone e.g. 0712345678" });

    const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL } = process.env;
    if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) return res.status(500).json({ error: "Vercel missing MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET. Go to Vercel > Settings > Environment Variables" });
    if (!MPESA_SHORTCODE || !MPESA_PASSKEY) return res.status(500).json({ error: "Vercel missing MPESA_SHORTCODE / MPESA_PASSKEY" });

    const callback = MPESA_CALLBACK_URL || "https://gitlab-sage.vercel.app/api/callback";

    // 1. Daraja token
    const authStr = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
    const tokenRes = await fetch("https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: "Basic " + authStr }
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      console.log("DARAJA TOKEN FAIL:", tokenData);
      return res.status(500).json({ error: "Daraja login failed. Wrong Consumer Key/Secret or you are using SANDBOX keys on PRODUCTION URL. Check Daraja Portal. Details: " + JSON.stringify(tokenData) });
    }
    const accessToken = tokenData.access_token;

    // 2. STK Push
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString("base64");

    const stkRes = await fetch("https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
      body: JSON.stringify({
        BusinessShortCode: MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerBuyGoodsOnline",
        Amount: 300,
        PartyA: phone,
        PartyB: MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: callback,
        AccountReference: "GITLAB300",
        TransactionDesc: "GITLAB Membership"
      })
    });
    const stkData = await stkRes.json().catch(() => ({}));
    console.log("STK RESPONSE:", JSON.stringify(stkData));

    if (stkData.ResponseCode !== "0") {
      return res.status(400).json({ error: "Daraja rejected STK: " + (stkData.ResponseDescription || stkData.errorMessage || JSON.stringify(stkData)) });
    }

    return res.json({ success: true, CheckoutRequestID: stkData.CheckoutRequestID, message: "STK sent to " + phone });
  } catch (e) {
    console.log("PAY-MEMBERSHIP CRASH:", e.message, e.stack);
    return res.status(500).json({ error: "Server crash: " + e.message });
  }
};
