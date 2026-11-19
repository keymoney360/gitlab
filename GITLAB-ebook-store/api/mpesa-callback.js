// Safaricom sends the final payment result to this public HTTPS endpoint.
// This starter callback acknowledges the notification and logs its contents.
// Before accepting live customer orders, connect this callback to a database
// and use the ResultCode to mark an order as PAID or FAILED.
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ResultCode: 1, ResultDesc: "Method not allowed" });
  try {
    const callback = req.body?.Body?.stkCallback;
    if (callback) {
      console.log("M-Pesa callback", JSON.stringify({
        checkoutRequestID: callback.CheckoutRequestID,
        resultCode: callback.ResultCode,
        resultDesc: callback.ResultDesc,
        metadata: callback.CallbackMetadata?.Item || []
      }));
    } else {
      console.warn("Unrecognized M-Pesa callback payload");
    }
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("Callback processing error", error);
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Received" });
  }
};
