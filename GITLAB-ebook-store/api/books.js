// api/books.js - FIXED: GET all books OR GET my purchased books with downloadUrl
const mongoose = require("mongoose");

// Book model - strict:false so NO field is ever deleted
const Book = mongoose.models.Book || mongoose.model("Book", new mongoose.Schema({
  title: String,
  name: String,
  price: Number,
  amount: Number,
  category: String,
  description: String,
  cover: String,
  coverImage: String,
  image: String,
  downloadUrl: String,
  downloadLink: String,
  fileUrl: String,
  pdfUrl: String,
  url: String,
}, { strict: false, timestamps: true }), "books");

// User model - for purchasedBooks lookup
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String,
  email: String,
  purchasedBooks: [String],
  isPaid: Boolean,
}, { strict: false }), "users");

// Purchase model - fallback if purchasedBooks is empty
const Purchase = mongoose.models.Purchase || mongoose.model("Purchase", new mongoose.Schema({
  checkoutRequestID: String,
  phone: String,
  productId: String,
  productName: String,
  amount: Number,
  receipt: String,
  status: String,
  userEmail: String,
}, { strict: false, timestamps: true }), "purchases");

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error("MONGODB_URI not set in Vercel Env Variables");
  await mongoose.connect(uri);
}

// Helper: turn Drive preview link into direct download link
function toDownload(link) {
  if (!link) return "";
  const m = String(link).match(/\/d\/([^\/\?]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  if (link.includes("drive.google.com") && link.includes("id=")) {
    return link.replace(/\/view.*$/, "").replace("open?", "uc?export=download&");
  }
  return link;
}

function cleanBook(b) {
  const title = b.title || b.name || b.productName || "Fred Gross Stories";
  const price = b.price ?? b.amount ?? 0;
  const raw = b.downloadUrl || b.downloadLink || b.fileUrl || b.pdfUrl || b.url || "";
  const downloadUrl = toDownload(raw);
  return {
    _id: b._id, id: b._id,
    title, name: title, bookTitle: title, productName: title,
    price, amount: price,
    category: b.category || "",
    description: b.description || "",
    cover: b.cover || b.coverImage || b.image || "",
    coverImage: b.cover || b.coverImage || b.image || "",
    downloadUrl, downloadLink: downloadUrl, fileUrl: downloadUrl, pdfUrl: downloadUrl, url: downloadUrl,
    createdAt: b.createdAt,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await connectDB();

    // === MY BOOKS MODE: ?email=... or ?mine=1 ===
    // This is what Dashboard / My Books must call
    if (req.query.email || req.query.mine === "1") {
      const email = String(req.query.email || "").trim().toLowerCase();
      if (!email) return res.status(200).json({ success: true, books: [] });
      const user = await User.findOne({ email }).lean();
      if (!user) return res.status(200).json({ success: true, books: [] });

      const ids = (user.purchasedBooks || []).filter(id => /^[a-f0-9]{24}$/i.test(String(id)));
      let docs = ids.length ? await Book.find({ _id: { $in: ids } }).lean() : [];

      // Fallback: if purchasedBooks is empty, check paid Purchases
      if (!docs.length) {
        const paid = await Purchase.find({ userEmail: email, status: "paid" }).lean();
        for (const p of paid) {
          if (p.productId && /^[a-f0-9]{24}$/i.test(String(p.productId))) {
            const b = await Book.findById(p.productId).lean();
            if (b && !docs.find(x => String(x._id) === String(b._id))) docs.push(b);
          }
        }
      }

      const out = docs.map(b => ({ ...cleanBook(b), status: "paid", paid: true }));
      return res.status(200).json({ success: true, books: out });
    }

    // === SHOP MODE: all books (normal store) ===
    const books = await Book.find({}).sort({ createdAt: -1 }).lean();
    return res.status(200).json(books.map(cleanBook));
  } catch (e) {
    console.error("GET /api/books failed:", e);
    return res.status(500).json({ error: "Failed to load books: " + e.message });
  }
};
