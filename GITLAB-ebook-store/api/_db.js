const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null };

async function connect() {
  if (cached.conn) return cached.conn;
  cached.conn = await mongoose.connect(process.env.MONGODB_URI);
  return cached.conn;
}

const UserSchema = new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: String,
  phone: String, referralCode: String, referredBy: String,
  registrationPaid: { type: Boolean, default: false },
  balance: { type: Number, default: 0 }, totalEarned: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false },
  resetCode: String, resetExpiry: Date,
}, { timestamps: true });

const ReferralSchema = new mongoose.Schema({
  referrerEmail: String, referredEmail: String, referredName: String,
  level: Number, commission: Number, paid: { type: Boolean, default: false }
}, { timestamps: true });

const WithdrawalSchema = new mongoose.Schema({
  userEmail: String, userName: String, amount: Number, phone: String,
  status: { type: String, default: "PENDING" }
}, { timestamps: true });

const BookSchema = new mongoose.Schema({
  title: String, price: Number, category: String, cover: String,
  description: String, downloadUrl: String, productId: String
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Referral = mongoose.models.Referral || mongoose.model("Referral", ReferralSchema);
const Withdrawal = mongoose.models.Withdrawal || mongoose.model("Withdrawal", WithdrawalSchema);
const Book = mongoose.models.Book || mongoose.model("Book", BookSchema);

function makeCode(name) {
  return (name.split(" ")[0].toUpperCase().replace(/[^A-Z]/g, "") + Math.floor(100 + Math.random()*900));
}
function auth(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  try { return jwt.verify(h.slice(7), process.env.JWT_SECRET); } catch { return null; }
}
module.exports = { connect, User, Referral, Withdrawal, Book, bcrypt, jwt, makeCode, auth };
