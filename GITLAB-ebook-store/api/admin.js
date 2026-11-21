// api/admin.js - EMAIL ONLY, no passcode
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").trim();
const ADMIN_EMAIL = "kimaniangithua@gmail.com";

async function kvGet(key) {
  try {
    const r = await fetch(process.env.KV_REST_API_URL + "/get/" + key, {
      headers: { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN }
    });
    const j = await r.json();
    if (!j.result) return [];
    return typeof j.result === "string" ? JSON.parse(j.result) : j.result;
  } catch { return []; }
}
async function kvSet(key, val) {
  try {
    await fetch(process.env.KV_REST_API_URL + "/set/" + key, {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify(typeof val === "string" ? val : JSON.stringify(val))
    });
  } catch {}
}
function decodeJwt(token) {
  try {
    const part = token.split(".")[1];
    return JSON.parse(Buffer.from(part, "base64").toString("utf8"));
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "No token - please login again" });

    const decoded = decodeJwt(token);
    if (!decoded) return res.status(401).json({ error: "Bad token - please login again" });

    const users = await kvGet("users");
    const u = users.find(x => String(x.id) === String(decoded.id || decoded.userId));

    // EMAIL CHECK ONLY - like before
    const isAdmin = norm(decoded.email) === norm(ADMIN_EMAIL) || norm(u?.email) === norm(ADMIN_EMAIL);
    if (!isAdmin) {
      return res.status(403).json({ error: "Not admin", debug_dbEmail: u?.email || "(not found)", debug_tokenEmail: decoded.email || "(no email in token)" });
    }

    const action = req.query.action || req.body?.action || "overview";
    let withdrawals = await kvGet("withdrawals");
    let books = await kvGet("books");

    if (action === "approve" || action === "reject") {
      const id = req.query.id;
      const w = withdrawals.find(x => String(x._id) === String(id) || String(x.id) === String(id));
      if (!w) return res.status(404).json({ error: "Not found" });
      if (action === "approve") { w.status = "PAID"; }
      else {
        w.status = "REJECTED";
        const member = users.find(x => String(x.id) === String(w.userId));
        if (member) member.balance = (member.balance || 0) + (w.amount || 0);
        await kvSet("users", users);
      }
      await kvSet("withdrawals", withdrawals);
      return res.json({ ok: true });
    }

    if (action === "addBook") {
      const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      books.push({ id: Date.now().toString(), title: b.title, price: b.price, category: b.category, cover: b.cover, description: b.description, downloadUrl: b.downloadUrl, createdAt: new Date().toISOString() });
      await kvSet("books", books);
      return res.json({ ok: true });
    }

    const paidMembers = users.filter(x => x.registrationPaid).length;
    return res.json({ totalMembers: users.length, paidMembers, members: users, withdrawals, books });
  } catch (e) {
    return res.status(500).json({ error: "Server error: " + e.message });
  }
  }
