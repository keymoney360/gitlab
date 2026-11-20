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
  return cached.conn;
}

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  password: String,
  referralCode: { type: String, unique: true },
  referredBy: String,
  isPaid: { type: Boolean, default: false },
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

function auth(req) {
  try {
    const h = req.headers.authorization || "";
    const token = h.replace("Bearer ", "");
    if (!token) return null;
    return jwt.verify(token, process.env.JWT_SECRET || "gitlab-secret");
  } catch { return null; }
}

module.exports = { connect, User, Referral, Withdrawal, Book, bcrypt, jwt, auth };
