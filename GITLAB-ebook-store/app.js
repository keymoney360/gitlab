// GITLAB - app.js - Join / Login / Pay 300 / Books
document.getElementById("year").textContent = new Date().getFullYear();

// --- Auto-fill referral code from URL ?ref=XXXX ---
const urlParams = new URLSearchParams(window.location.search);
const refFromUrl = urlParams.get("ref");
if (refFromUrl) {
  setTimeout(() => {
    const el = document.getElementById("regRef");
    if (el) el.value = refFromUrl;
  }, 500);
}

// --- Auth Modal ---
function openAuth(mode) {
  document.getElementById("authModal").classList.add("open");
  switchAuth(mode || "register");
}
function closeAuth() {
  document.getElementById("authModal").classList.remove("open");
}
function switchAuth(mode) {
  document.getElementById("regForm").style.display = mode === "register" ? "block" : "none";
  document.getElementById("logForm").style.display = mode === "login" ? "block" : "none";
  document.getElementById("forgotForm").style.display = mode === "forgot" ? "block" : "none";
  document.getElementById("payForm").style.display = mode === "pay" ? "block" : "none";
  document.getElementById("authTitle").textContent =
    mode === "login" ? "Welcome Back" :
    mode === "forgot" ? "Reset Password" :
    mode === "pay" ? "Pay KSh 300" : "Join GITLAB";
  document.getElementById("authSub").textContent =
    mode === "login" ? "Login to access your dashboard." :
    mode === "forgot" ? "Enter email to get reset code." :
    mode === "pay" ? "Activate your membership." :
    "Create account, then pay KSh 300 via M-Pesa.";
  hideAlert();
}
function showAlert(msg) {
  const a = document.getElementById("authAlert");
  a.style.display = "block";
  a.textContent = msg;
}
function hideAlert() {
  const a = document.getElementById("authAlert");
  if (a) a.style.display = "none";
}

// Close modal on outside click
document.getElementById("authModal")?.addEventListener("click", (e) => {
  if (e.target.id === "authModal") closeAuth();
});

// --- REGISTER ---
async function doRegister() {
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim().toLowerCase();
  const phone = document.getElementById("regPhone").value.trim();
  const password = document.getElementById("regPass").value;
  const referralCode = document.getElementById("regRef").value.trim().toUpperCase();

  if (!name || !email || !phone || !password) return showAlert("Fill all fields.");
  if (password.length < 6) return showAlert("Password must be at least 6 characters.");
  if (!/^[0-9]{10}$/.test(phone.replace(/\s/g, "")) && !/^254[0-9]{9}$/.test(phone)) {
    // allow 071... or 25471...
    if (phone.length < 10) return showAlert("Enter valid phone e.g. 0712345678");
  }

  showAlert("Creating account...");
  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, password, referralCode: referralCode || undefined })
    });
    const data = await safejson(res);
    if (!res.ok) throw new Error(data.error || "Registration failed");

    // Save phone for pay step
    document.getElementById("payPhone").value = phone;
    // Save temp token if returned
    if (data.token) localStorage.setItem("gitts_token", data.token);
    switchAuth("pay");
    showAlert("Account created! Now pay KSh 300 to activate.");
  } catch (e) { showAlert(e.message); }
}

// --- PAY 300 ---
async function safeJson(res) {
  const text = await res.text();
  if (!text) throw new Error("Server returned empty response (Vercel crash / timeout) - Check Vercel > Logs > pay-membership");
  try { return JSON.parse(text); }
  catch { throw new Error("Server returned non-JSON (" + res.status + "): " + text.slice(0, 200)); }
}

async function doPay300() {
  let phone = document.getElementById("payPhone").value.trim();
  if (!phone) return showAlert("Enter M-Pesa number.");
  if (phone.startsWith("0")) phone = "254" + phone.slice(1);
  if (phone.length !== 12) return showAlert("Enter valid number e.g. 0712345678");

  const token = localStorage.getItem("gitts_token");
  if (!token || token === "null") {
    showAlert("Session expired - Login again, then Pay.");
    setTimeout(() => switchAuth("login"), 1000);
    return;
  }

  showAlert("Sending M-Pesa prompt to " + phone + "... Check your phone.");
  try {
    const res = await fetch("/api/pay-membership", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ phone })
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "STK failed");
    showAlert("STK sent! Enter M-Pesa PIN on your phone, then click Login below.");
    setTimeout(() => switchAuth("login"), 2000);
  } catch (e) { showAlert("Server error: " + e.message); }
}

// --- LOGIN ---
async function doLogin() {
  const email = document.getElementById("logEmail").value.trim().toLowerCase();
  const password = document.getElementById("logPass").value;
  if (!email || !password) return showAlert("Enter email and password.");
  showAlert("Logging in...");
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    localStorage.setItem("gitts_token", data.token);
    localStorage.setItem("gitts_user", JSON.stringify(data.user));
    window.location.href = "/dashboard.html";
  } catch (e) { showAlert(e.message); }
}

// --- FORGOT / RESET ---
async function doForgot() {
  const email = document.getElementById("forgotEmail").value.trim().toLowerCase();
  if (!email) return showAlert("Enter your email.");
  showAlert("Sending code...");
  try {
    const res = await fetch("/api/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    showAlert("Code sent! Check email. For testing, code is: " + (data.code || "check email"));
  } catch (e) { showAlert(e.message); }
}
async function doReset() {
  const email = document.getElementById("forgotEmail").value.trim().toLowerCase();
  const code = document.getElementById("forgotCode").value.trim();
  const newPassword = document.getElementById("forgotNewPass").value;
  if (!email || !code || !newPassword) return showAlert("Fill all reset fields.");
  showAlert("Resetting...");
  try {
    const res = await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Reset failed");
    showAlert("Password reset! Login now.");
    setTimeout(() => switchAuth("login"), 1000);
  } catch (e) { showAlert(e.message); }
}

// --- BOOK CHECKOUT (Old Buy Now buttons) ---
const PRODUCTS = {
  "forex-journal": { name: "Forex Trading Journal", price: 150 },
  "forex-discipline": { name: "Forex Discipline Journal", price: 200 }
};
let currentProduct = null;

document.querySelectorAll(".buy-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    currentProduct = btn.dataset.product;
    const p = PRODUCTS[currentProduct];
    if (!p) return;
    document.getElementById("modalProduct").textContent = `${p.name} — KSh ${p.price}`;
    document.getElementById("checkoutModal").classList.add("open");
    document.getElementById("checkoutModal").setAttribute("aria-hidden", "false");
  });
});
document.getElementById("closeModal")?.addEventListener("click", () => {
  document.getElementById("checkoutModal").classList.remove("open");
});
document.getElementById("checkoutModal")?.addEventListener("click", (e) => {
  if (e.target.id === "checkoutModal") e.target.classList.remove("open");
});

document.getElementById("payButton")?.addEventListener("click", async () => {
  const status = document.getElementById("checkoutStatus");
  let phone = document.getElementById("phone").value.trim();
  if (!phone || phone.length !== 9) {
    status.textContent = "Enter 9 digits e.g. 712345678";
    status.className = "checkout-status error";
    return;
  }
  phone = "254" + phone;
  const p = PRODUCTS[currentProduct];
  status.textContent = "Sending M-Pesa prompt...";
  status.className = "checkout-status";
  try {
    const res = await fetch("/api/stk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, amount: p.price, product: currentProduct })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "STK failed");
    status.textContent = "STK sent! Enter PIN on your phone to complete.";
    status.className = "checkout-status success";
  } catch (e) {
    status.textContent = e.message;
    status.className = "checkout-status error";
  }
});

// --- If already logged in, show Dashboard link in header ---
const existingToken = localStorage.getItem("gitts_token");
if (existingToken) {
  // keep user on homepage but change Join button to Dashboard
  const joinBtns = document.querySelectorAll(".join-btn");
  joinBtns.forEach(b => {
    b.textContent = "My Dashboard →";
    b.onclick = () => window.location.href = "/dashboard.html";
  });
}
