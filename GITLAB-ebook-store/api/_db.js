// api/_db.js - FINAL: With membership fields + Purchase so callback can save
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
    }).then(m => m);
  }
  cached.conn = await cached.promise;
  // AUTO-FIX: Drop bad indexes that block new users
  try { await mongoose.connection.collection("users").dropIndex("phone_1"); } catch {}
  try { await mongoose.connection.collection("users").dropIndex("refCode_1"); } catch {}
  // Do NOT drop referralCode_1 anymore - we NEED it unique now
  return cached.conn;
}

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  password: String,
  // THIS is the ONE referral code field - unique, used everywhere
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: String, // stores referrer's EMAIL
  referredByCode: String, // stores referrer's CODE

  // --- MEMBERSHIP / PAYMENT FIELDS ---
  // These are the fields the callback sets - DO NOT rename them
  isPaid: { type: Boolean, default: false },
  membershipPaid: { type: Boolean, default: false },
  membershipStatus: { type: String, default: "inactive" }, // "inactive" | "active"
  membershipPaidAt: Date,
  membershipExpiresAt: Date,
  lastMpesaReceipt: String,
  lastCheckoutRequestID: String,
  purchasedBooks: { type: [String], default: [] }, // e.g. ["forex-journal", "forex-discipline"]

  balance: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  resetCode: String,
  resetExpiry: Date,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model("User", UserSchema);

const ReferralSchema = new mongoose.Schema({
  referrerEmail: String,
  name: String,
  email: String,
  level: Number,
  commission: Number,
  status: { type: String, default: "PENDING" },
  createdAt: { type: Date, default: Date.now }
});
const Referral = mongoose.models.Referral || mongoose.model("Referral", ReferralSchema);

const WithdrawalSchema = new mongoose.Schema({
  userEmail: String,
  userName: String,
  amount: Number,
  phone: String,
  status: { type: String, default: "PENDING" },
  createdAt: { type: Date, default: Date.now }
});
const Withdrawal = mongoose.models.Withdrawal || mongoose.model("Withdrawal", WithdrawalSchema);

const BookSchema = new mongoose.Schema({
  name: String,
  price: Number,
  status: String,
  downloadUrl: String,
  userEmail: String,
  createdAt: { type: Date, default: Date.now }
});
const Book = mongoose.models.Book || mongoose.model("Book", BookSchema);

// --- PURCHASE: Tracks every STK push so callback + frontend polling know which book was paid ---
const PurchaseSchema = new mongoose.Schema({
  checkoutRequestID: String,
  phone: String,
  productId: String,
  productName: String,
  amount: Number,
  receipt: String,
  status: { type: String, default: "pending" }, // pending | paid | failed
  failReason: String,
  userEmail: String,
}, { timestamps: true });
const Purchase = mongoose.models.Purchase || mongoose.model("Purchase", PurchaseSchema);

function auth(req) {
  try {
    const h = req.headers.authorization || "";
    const token = h.replace("Bearer ", "");
    if (!token) return null;
    return jwt.verify(token, process.env.JWT_SECRET || "gitlab-secret");
  } catch { return null; }
}

module.exports = { connect, User, Referral, Withdrawal, Book, Purchase, bcrypt, jwt, auth };
