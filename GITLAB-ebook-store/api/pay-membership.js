// api/pay-membership.js - FIXED: EAT timestamp + correct callback + Sandbox/Prod switch
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

    const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL, MPESA_ENV } = process.env;
    if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) return res.status(500).json({ error: "Vercel missing MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET" });
    if (!MPESA_SHORTCODE || !MPESA_PASSKEY) return res.status(500).json({ error: "Vercel missing MPESA_SHORTCODE / MPESA_PASSKEY" });

    // FIX 2: Default to mpesa-callback, NOT callback
    const callback = MPESA_CALLBACK_URL || "https://gitlab-sage.vercel.app/api/mpesa-callback";

    // FIX 3: Sandbox vs Production URL
    // Set MPESA_ENV=sandbox in Vercel if you are using Sandbox keys, else production
    const isSandbox = (MPESA_ENV || "production").toLowerCase() === "sandbox";
    const baseUrl = isSandbox ? "https://sandbox.safaricom.co.ke" : "https://api.safaricom.co.ke";
    console.log("MPESA ENV:", isSandbox ? "sandbox" : "production", "Shortcode:", MPESA_SHORTCODE);

    // 1. Daraja token
    const authStr = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
    const tokenRes = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: "Basic " + authStr }
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      console.log("DARAJA TOKEN FAIL:", tokenData);
      return res.status(500).json({ error: "Daraja login failed. Keys and URL don't match. If keys are Sandbox, set MPESA_ENV=sandbox in Vercel. Details: " + JSON.stringify(tokenData) });
    }
    const accessToken = tokenData.access_token;

    // FIX 1: EAT timestamp (Kenya time, UTC+3) - THIS FIXES 2002
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString("base64");

    const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
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
