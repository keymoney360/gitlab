const products = {
  "forex-journal": { name: "Forex Trading Journal", price: 150 },
  "forex-discipline": { name: "Forex Discipline Journal", price: 200 }
};
const modal = document.getElementById("checkoutModal");
const phone = document.getElementById("phone");
const statusBox = document.getElementById("checkoutStatus");
const payButton = document.getElementById("payButton");
let selectedProduct = null;

document.getElementById("year").textContent = new Date().getFullYear();
document.querySelectorAll(".buy-btn").forEach(button => {
  button.addEventListener("click", () => {
    selectedProduct = products[button.dataset.product];
    document.getElementById("modalProduct").textContent = `${selectedProduct.name} · KSh ${selectedProduct.price}`;
    phone.value = "";
    statusBox.textContent = "";
    statusBox.className = "checkout-status";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    phone.focus();
  });
});
function closeModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}
document.getElementById("closeModal").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

payButton.addEventListener("click", async () => {
  const digits = phone.value.replace(/\D/g, "");
  if (!selectedProduct) return;
  if (!/^7\d{8}$/.test(digits)) {
    statusBox.textContent = "Enter a valid Kenyan Safaricom number, e.g. 712345678.";
    statusBox.className = "checkout-status error";
    return;
  }
  payButton.disabled = true;
  payButton.textContent = "Sending request…";
  statusBox.textContent = "Please wait while we contact M-Pesa.";
  statusBox.className = "checkout-status";
  try {
    const response = await fetch("/api/stk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: Object.keys(products).find(k => products[k] === selectedProduct), phone: `254${digits}` })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not start M-Pesa payment.");
    statusBox.textContent = data.message || "STK Push sent. Check your phone and enter your M-Pesa PIN to complete payment.";
    statusBox.className = "checkout-status success";
  } catch (error) {
    statusBox.textContent = error.message;
    statusBox.className = "checkout-status error";
  } finally {
    payButton.disabled = false;
    payButton.innerHTML = 'Send M-Pesa prompt <span>→</span>';
  }
});
