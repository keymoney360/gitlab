// api/books.js - GET all books from MongoDB for client website
const { MongoClient } = require("mongodb");

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error("MONGODB_URI not set in Vercel Env Variables");

  const client = new MongoClient(uri);
  await client.connect();
  // Use DB name from URI, or fallback to 'gitlab' / 'test'
  const dbName = process.env.MONGODB_DB || new URL(uri).pathname.replace("/", "") || "gitlab";
  const db = client.db(dbName);

  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

module.exports = async (req, res) => {
  // Allow CORS + GET only
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { db } = await connectToDatabase();
    // Your collection is called "books" - from your MongoDB screenshot
    const books = await db.collection("books").find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json(books);
  } catch (e) {
    console.error("GET /api/books failed:", e);
    return res.status(500).json({ error: "Failed to load books: " + e.message });
  }
};
