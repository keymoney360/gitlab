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

    const isAdmin = norm(decoded.email) === norm(ADMIN_EMAIL) || norm(u?.email) === norm(ADMIN_EMAIL);
    if (!isAdmin) {
      return res.status(403).json({ error: "Not admin", debug_dbEmail: u?.email || "(not found)", debug_tokenEmail: decoded.email || "(no email in token)" });
    }

    // ✅ READ PASSCODE FROM HEADER - THIS IS THE FIX
    const passcode = (req.headers["x-admin-passcode"] || req.query.passcode || req.body?.passcode || "").toString().trim();
    if (passcode !== "GITTS-Admin-2026") {
      return res.status(403).json({ error: "Wrong passcode. Try again." });
    }

    const action = req.query.action || req.body?.action || "overview";
    let withdrawals = (await kv.get("withdrawals")) || [];
    let books = (await kv.get("books")) || [];

    if (action === "approve" || action === "reject") {
      const id = req.query.id;
      const w = withdrawals.find(x => String(x._id) === String(id) || String(x.id) === String(id));
      if (!w) return res.status(404).json({ error: "Not found" });
      if (action === "approve") { w.status = "PAID"; }
      else { w.status = "REJECTED"; const member = users.find(x => String(x.id) === String(w.userId)); if (member) member.balance = (member.balance || 0) + (w.amount || 0); await kv.set("users", users); }
      await kv.set("withdrawals", withdrawals);
      return res.json({ ok: true });
    }

    if (action === "addBook") {
      const b = req.body || {};
      books.push({ id: Date.now().toString(), title: b.title, price: b.price, category: b.category, cover: b.cover, description: b.description, downloadUrl: b.downloadUrl, createdAt: new Date().toISOString() });
      await kv.set("books", books);
      return res.json({ ok: true });
    }

    // ✅ RETURN EXACT FIELDS admin.html EXPECTS
    const paidMembers = users.filter(x => x.registrationPaid).length;
    return res.json({ totalMembers: users.length, paidMembers, members: users, withdrawals, books });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
