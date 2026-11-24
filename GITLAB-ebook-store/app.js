// GITLAB - app.js - v6 - FINAL FIXED
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

async function safeJson(res) {
  const text = await res.text();
  if (!text) throw new Error("Server returned empty response - Check Vercel > Logs");
  try { return JSON.parse(text); }
  catch { throw new Error("Server returned non-JSON (" + res.status + "): " + text.slice(0, 200)); }
}

function applyReferralFromUrl() {
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref) {
    const clean = ref.trim().toUpperCase();
    localStorage.setItem("gitlab_invite_ref", clean);
    const el = document.getElementById("regRef");
    if (el) el.value = clean;
    const banner = document.getElementById("inviteBanner");
    if (banner) { banner.style.display = "block"; banner.textContent = "You were invited! Referral code " + clean + " applied ✓"; }
    return clean;
  }
  const saved = localStorage.getItem("gitlab_invite_ref");
  if (saved) {
    const el = document.getElementById("regRef");
    if (el && !el.value) el.value = saved;
  }
  return saved;
}
applyReferralFromUrl();

function openAuth(mode) { document.getElementById("authModal").classList.add("open"); switchAuth(mode || "register"); setTimeout(applyReferralFromUrl, 100); }
function closeAuth() { document.getElementById("authModal").classList.remove("open"); }
function switchAuth(mode) {
  document.getElementById("regForm").style.display = mode === "register" ? "block" : "none";
  document.getElementById("logForm").style.display = mode === "login" ? "block" : "none";
  document.getElementById("forgotForm").style.display = mode === "forgot" ? "block" : "none";
  document.getElementById("payForm").style.display = mode === "pay" ? "block" : "none";
  document.getElementById("authTitle").textContent = mode === "login" ? "Welcome Back" : mode === "forgot" ? "Reset Password" : mode === "pay" ? "Pay KSh 300" : "Join GITLAB";
  document.getElementById("authSub").textContent = mode === "login" ? "Login to access your dashboard." : mode === "forgot" ? "Enter email to get reset code." : mode === "pay" ? "Activate your membership." : "Create account, then pay KSh 300 via M-Pesa.";
  hideAlert();
  if (mode === "register") setTimeout(applyReferralFromUrl, 100);
}
function showAlert(msg) { const a = document.getElementById("authAlert"); a.style.display = "block"; a.textContent = msg; }
function hideAlert() { const a = document.getElementById("authAlert"); if (a) a.style.display = "none"; }
document.getElementById("authModal")?.addEventListener("click", (e) => { if (e.target.id === "authModal") closeAuth(); });

async function doRegister() {
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim().toLowerCase();
  const phone = document.getElementById("regPhone").value.trim();
  const password = document.getElementById("regPass").value;
  const referralCode = (document.getElementById("regRef").value.trim().toUpperCase() || localStorage.getItem("gitlab_invite_ref") || "").toUpperCase();
  if (!name || !email || !phone || !password) return showAlert("Fill all fields.");
  if (password.length < 6) return showAlert("Password must be at least 6 characters.");
  const cleanPhone = phone.replace(/[\s+]/g, "");
  if (!/^(0[0-9]{9}|254[0-9]{9})$/.test(cleanPhone)) return showAlert("Enter valid phone e.g. 0712345678");
  showAlert("Creating account...");
  try {
    const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, phone, password, referralCode: referralCode || undefined }) });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Registration failed");
    document.getElementById("payPhone").value = phone;
    if (data.token) localStorage.setItem("gitts_token", data.token);
    if (data.user) localStorage.setItem("gitts_user", JSON.stringify(data.user));
    switchAuth("pay");
    showAlert("Account created! Now pay KSh 300 to activate. Do NOT login until you pay.");
  } catch (e) { showAlert(e.message); }
}

let payPollTimer = null;
async function doPay300() {
  let phone = document.getElementById("payPhone").value.trim().replace(/[\s+]/g, "");
  if (!phone) return showAlert("Enter M-Pesa number.");
  if (phone.startsWith("0")) phone = "254" + phone.slice(1);
  if (phone.length !== 12 || !phone.startsWith("254")) return showAlert("Enter valid number e.g. 0712345678");
  const token = localStorage.getItem("gitts_token");
  if (!token || token === "null") { showAlert("Session expired - Login again, then Pay."); setTimeout(() => switchAuth("login"), 1000); return; }
  showAlert("Sending M-Pesa prompt to " + phone + "... Check your phone.");
  try {
    const res = await fetch("/api/pay-membership", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ phone }) });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "STK failed");
    showAlert("STK SENT to " + phone + ". Enter your M-Pesa PIN now. Waiting for confirmation... (do not close this)");
    startPayPolling();
  } catch (e) { showAlert("STK FAILED: " + e.message + " - No prompt was sent. Check Daraja keys / Shortcode / Callback in Vercel."); }
}
function startPayPolling() {
  if (payPollTimer) clearInterval(payPollTimer);
  let tries = 0;
  payPollTimer = setInterval(async () => {
    tries++;
    const token = localStorage.getItem("gitts_token");
    try {
      const res = await fetch("/api/me", { headers: { "Authorization": "Bearer " + token } });
      const data = await safeJson(res);
      if (data.user && (data.user.isPaid || data.user.membershipPaid)) {
        clearInterval(payPollTimer);
        showAlert("Payment CONFIRMED! Redirecting to Dashboard...");
        setTimeout(() => window.location.href = "/dashboard.html", 1000);
        return;
      }
      if (tries % 6 === 0) showAlert("Still waiting for M-Pesa confirmation... " + tries * 5 + "s.");
      if (tries > 24) { clearInterval(payPollTimer); showAlert("Still not confirmed after 2 mins. If you entered PIN and got SMS, click Login to check again."); }
    } catch {}
  }, 5000);
}

async function doLogin() {
  const email = document.getElementById("logEmail").value.trim().toLowerCase();
  const password = document.getElementById("logPass").value;
  if (!email || !password) return showAlert("Enter email and password.");
  showAlert("Logging in...");
  try {
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Login failed");
    localStorage.setItem("gitts_token", data.token);
    localStorage.setItem("gitts_user", JSON.stringify(data.user));
    if (!data.user.isPaid && !data.user.membershipPaid) {
      showAlert("Login OK, but payment NOT confirmed yet. Pay KSh 300 to activate.");
      document.getElementById("payPhone").value = data.user.phone || "";
      setTimeout(() => switchAuth("pay"), 800);
      return;
    }
    window.location.href = "/dashboard.html";
  } catch (e) { showAlert(e.message); }
}

async function doForgot() {
  const email = document.getElementById("forgotEmail").value.trim().toLowerCase();
  if (!email) return showAlert("Enter your email.");
  showAlert("Sending code...");
  try {
    const res = await fetch("/api/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const data = await safeJson(res);
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
    const res = await fetch("/api/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, newPassword }) });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Reset failed");
    showAlert("Password reset! Login now.");
    setTimeout(() => switchAuth("login"), 1000);
  } catch (e) { showAlert(e.message); }
}

// --- BOOKS ---
let PRODUCTS = {};
let ALL_BOOKS = [];
let currentProduct = null;
let selectedProduct = null;

async function loadProducts() {
  try {
    const res = await fetch("/api/books");
    const data = await safeJson(res);
    const books = Array.isArray(data) ? data : (data.books || data.data || []);
    if (!books.length) throw new Error("No books from API");
    ALL_BOOKS = books;
    PRODUCTS = {};
    books.forEach(b => {
      const key = String(b._id || b.id);
      if (!key) return;
      PRODUCTS[key] = { name: b.title, price: b.price, _id: key, title: b.title };
    });
    renderBookCards(books);
  } catch (e) {
    console.log("Books API failed, using fallback:", e.message);
    PRODUCTS = { "forex-journal": { name: "Forex Trading Journal", price: 150 }, "forex-discipline": { name: "Forex Discipline Journal", price: 200 } };
    attachBuyButtons();
  }
}

function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function renderBookCards(books) {
  const container = document.getElementById("dynamicBooks");
  if (!container) { attachBuyButtons(); return; }
  const staticGrid = document.querySelector(".product-grid");
  if (staticGrid) staticGrid.style.display = "none";
  const countEl = document.querySelector(".catalog-count b");
  if (countEl) countEl.textContent = String(books.length).padStart(2, "0");
  container.innerHTML = `<div class="product-grid">` + books.map(b => {
    const id = String(b._id || b.id);
    const coverClass = b.cover || "cover-one";
    const shortTitle = escapeHtml(b.title || "");
    const cat = escapeHtml(b.category || "E-BOOK");
    return `<article class="product-card" data-book-id="${escapeHtml(id)}"><div class="cover ${escapeHtml(coverClass)}"><div class="cover-top">GITLAB LIBRARY <span>${cat}</span></div><div class="cover-symbol">📚</div><div class="cover-title">${shortTitle}</div><div class="cover-bottom">DIGITAL KNOWLEDGE</div></div><div class="product-info"><div class="product-meta"><span class="pill">${cat}</span><span class="pages">PDF · DIGITAL</span></div><h3>${shortTitle}</h3><p>${escapeHtml(b.description || "")}</p><div class="product-buy"><strong>KSh ${b.price}</strong><button class="buy-btn" data-product="${escapeHtml(id)}" data-name="${escapeHtml(b.title)}" data-price="${b.price}">Buy now <span>→</span></button></div></div></article>`;
  }).join("") + `</div>`;
  attachBuyButtons();
}

// FIXED v6: reads name/price from button OR from card, never 0
function attachBuyButtons() {
  document.querySelectorAll(".buy-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      const id = String(btn.dataset.product || "");
      const card = btn.closest(".product-card");
      const titleFromCard = card?.querySelector("h3")?.textContent?.trim();
      const priceFromCard = card?.querySelector(".product-buy strong")?.textContent?.replace(/[^0-9]/g, "");
      const name = btn.dataset.name || (PRODUCTS[id] && PRODUCTS[id].name) || titleFromCard || "Book";
      const price = Number(btn.dataset.price || (PRODUCTS[id] && PRODUCTS[id].price) || priceFromCard || 0);
      currentProduct = id;
      selectedProduct = { _id: id, name: name, title: name, price: price };
      const modal = document.getElementById("checkoutModal");
      if (modal) { modal.dataset.product = id; modal.dataset.name = name; modal.dataset.price = String(price); }
      const modalProduct = document.getElementById("modalProduct");
      if (modalProduct) modalProduct.textContent = `${name} — KSh ${price}`;
      if (modal) { modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); }
    });
  });
}

document.getElementById("closeModal")?.addEventListener("click", () => { document.getElementById("checkoutModal").classList.remove("open"); document.getElementById("checkoutModal").setAttribute("aria-hidden", "true"); });
document.getElementById("checkoutModal")?.addEventListener("click", (e) => { if (e.target.id === "checkoutModal") { e.target.classList.remove("open"); e.target.setAttribute("aria-hidden", "true"); } });

document.getElementById("payButton")?.addEventListener("click", async () => {
  const status = document.getElementById("checkoutStatus");
  let phone = document.getElementById("phone").value.trim().replace(/[\s+]/g, "");
  if (!/^[0-9]{9}$/.test(phone) && !/^254[0-9]{9}$/.test(phone)) { status.textContent = "Enter 9 digits e.g. 712345678"; status.className = "checkout-status error"; return; }
  if (phone.length === 9) phone = "254" + phone;

  let p = selectedProduct;
  const modal = document.getElementById("checkoutModal");
  const modalText = document.getElementById("modalProduct")?.textContent || "";
  const priceMatch = modalText.match(/KSh\s*(\d+)/);
  const namePart = modalText.split("—")[0]?.trim();
  if ((!p || !p.price) && priceMatch) {
    p = { _id: (modal && modal.dataset.product) || currentProduct || "book", name: namePart || (modal && modal.dataset.name) || "Book", title: namePart || "Book", price: Number(priceMatch[1]) };
    selectedProduct = p; currentProduct = p._id;
  }
  if ((!p || !p.price) && modal && modal.dataset.product) {
    p = { _id: modal.dataset.product, name: modal.dataset.name, title: modal.dataset.name, price: Number(modal.dataset.price) };
    selectedProduct = p;
  }
  if (!p || !p.price || p.price <= 0) { status.textContent = "Please select a valid product."; status.className = "checkout-status error"; return; }

  status.textContent = "Sending M-Pesa prompt...";
  status.className = "checkout-status";
  try {
    const res = await fetch("/api/stk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, amount: p.price, product: p._id, productName: p.name }) });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "STK failed");
    status.textContent = "STK sent! Enter PIN on your phone to complete.";
    status.className = "checkout-status success";
  } catch (e) { status.textContent = e.message; status.className = "checkout-status error"; }
});

loadProducts();

const existingToken = localStorage.getItem("gitts_token");
if (existingToken) {
  const joinBtns = document.querySelectorAll(".join-btn");
  joinBtns.forEach(b => { b.textContent = "My Dashboard →"; b.onclick = () => window.location.href = "/dashboard.html"; });
      }
