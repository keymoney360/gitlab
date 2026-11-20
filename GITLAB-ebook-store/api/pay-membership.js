const { connect, User } = require("./_db");
const jwt = require("jsonwebtoken");
const axios = require("axios");

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const auth = req.headers.authorization || "";
    const token = auth.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Login again" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "gitlab-secret");
    await connect();
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });
    phone = String(phone).replace(/\s/g, "");
    if (phone.startsWith("0")) phone = "254" + phone.slice(1);
    if (phone.startsWith("+")) phone = phone.slice(1);

    // Check envs
    const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL } = process.env;
    if (!MPESA_CONSUMER_KEY || !MPESA_SHORTCODE || !MPESA_PASSKEY) {
      return res.status(500).json({ error: "M-Pesa env vars missing in Vercel. Check Settings > Environment Variables" });
    }

    // 1. Get Daraja token
    const authStr = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
    const tokenRes = await axios.get("https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", { headers: { Authorization: `Basic ${authStr}` } });
    const accessToken = tokenRes.data.access_token;

    // 2. STK Push
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString("base64");

    const stkRes = await axios.post("https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: 300,
      PartyA: phone,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: MPESA_CALLBACK_URL || "https://gitlab-sage.vercel.app/api/callback",
      AccountReference: "GITLAB300",
      TransactionDesc: "GITLAB Membership"
    }, { headers: { Authorization: `Bearer ${accessToken}` } });

    console.log("STK RESPONSE:", JSON.stringify(stkRes.data));
    if (stkRes.data.ResponseCode !== "0") {
      return res.status(400).json({ error: "Daraja rejected: " + (stkRes.data.ResponseDescription || JSON.stringify(stkRes.data)) });
    }
    return res.json({ success: true, CheckoutRequestID: stkRes.data.CheckoutRequestID, message: "STK sent to " + phone });
  } catch (e) {
    console.log("PAY ERROR:", e.response?.data || e.message);
    return res.status(500).json({ error: "Daraja error: " + JSON.stringify(e.response?.data || e.message) });
  }
};
