// api/books.js - GET all books from MongoDB using Mongoose
const mongoose = require("mongoose");

// Re-use same Book model if it already exists (avoids OverwriteModelError)
const Book = mongoose.models.Book || mongoose.model("Book", new mongoose.Schema({
  title: String,
  price: Number,
  category: String,
  description: String,
  cover: String,
  coverImage: String,
  image: String,
  downloadUrl: String,
  fileUrl: String,
  pdfUrl: String,
}, { strict: false, timestamps: true }), "books");

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error("MONGODB_URI not set in Vercel Env Variables");
  await mongoose.connect(uri);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await connectDB();
    const books = await Book.find({}).sort({ createdAt: -1 }).lean();
    return res.status(200).json(books);
  } catch (e) {
    console.error("GET /api/books failed:", e);
    return res.status(500).json({ error: "Failed to load books: " + e.message });
  }
};
