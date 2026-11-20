// api/pay-membership.js - FIXED: Store in BusinessShortCode, Till in PartyB (same as books)
const { connect, User, jwt } = require("./_db");

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

    // SAME AS BOOKS - Store + Till, NOT one number
    const storeNumber = String(process.env.MPESA_SHORTCODE || "1275105").trim();
    const tillNumber = String(process.env.MPESA_TILL_NUMBER || "1745713").trim();
    const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, MPESA_CALLBACK_URL } = process.env;
    if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET || !MPESA_PASSKEY) {
      return res.status(500).json({ error: "Vercel missing MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET / MPESA_PASSKEY" });
    }
    const callback = MPESA_CALLBACK_URL || "https://gitlab-sage.vercel.app/api/mpesa-callback";

    // 1. Token - PRODUCTION
    const authStr = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
    const tokenRes = await fetch("https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: "Basic " + authStr }
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      console.log("DARAJA TOKEN FAIL:", tokenData);
      return res.status(500).json({ error: "Daraja login failed. Details: " + JSON.stringify(tokenData) });
    }

    // 2. STK - Store in BusinessShortCode, Till in PartyB
    const timestamp = getTimestamp();
    const password = Buffer.from(`${storeNumber}${MPESA_PASSKEY}${timestamp}`).toString("base64");

    const stkRes = await fetch("https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenData.access_token },
      body: JSON.stringify({
        BusinessShortCode: storeNumber, // 1275105 - STORE
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerBuyGoodsOnline",
        Amount: 300,
        PartyA: phone,
        PartyB: tillNumber, // 1745713 - TILL
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
    console.log("PAY-MEMBERSHIP CRASH:", e.message);
    return res.status(500).json({ error: "Server crash: " + e.message });
  }
};
