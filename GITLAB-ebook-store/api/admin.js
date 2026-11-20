import { kv } from "@vercel/kv";
import jwt from "jsonwebtoken";

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").trim();
const ADMIN_EMAIL = "kimaniangithua@gmail.com";

export default async function handler(req, res) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "No token" });

    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: "Bad token" }); }

    const users = (await kv.get("users")) || [];
    const u = users.find(x => String(x.id) === String(decoded.id || decoded.userId));

    const tokenEmail = norm(decoded.email);
    const dbEmail = norm(u?.email);
    const isAdmin = tokenEmail === norm(ADMIN_EMAIL) || dbEmail === norm(ADMIN_EMAIL);

    if (!isAdmin) {
      return res.status(403).json({ 
        error: "Not admin", 
        debug_tokenEmail: decoded.email || "(no email in token)",
        debug_dbEmail: u?.email || "(user not found)",
        debug_id: decoded.id || decoded.userId
      });
    }

    const passcode = (req.query.passcode || req.body?.passcode || "").trim();
    if (passcode !== "GITTS-Admin-2026") {
      return res.status(403).json({ error: "Wrong passcode. Try again." });
    }

    const action = req.query.action || req.body?.action || "overview";
    const investments = (await kv.get("investments")) || [];
    const transactions = (await kv.get("transactions")) || [];

    if (action === "overview") {
      return res.json({ users: users.length, investments: investments.length, transactions: transactions.length, usersList: users });
    }
    return res.json({ users, investments, transactions });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
