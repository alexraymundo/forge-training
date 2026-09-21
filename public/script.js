const HOME_PLAN = {
  key: "forge",
  name: "FORGE Personalizado",
  amount: 500
};

const payModal = document.getElementById("payModal");
const payReference = document.getElementById("payReference");
const payPayerName = document.getElementById("payPayerName");
const payLast4 = document.getElementById("payLast4");
const payStatus = document.getElementById("payStatus");
const payDetails = document.getElementById("payDetails");
const paySuccess = document.getElementById("paySuccess");
const reportPayment = document.getElementById("reportPayment");
const copyPayReference = document.getElementById("copyPayReference");

let activeOrderId = "";
let activeReference = "";

function openPayModal() {
  payDetails.hidden = false;
  paySuccess.hidden = true;
  payStatus.textContent = "";
  payPayerName.value = "";
  payLast4.value = "";
  payModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closePayModal() {
  payModal.hidden = true;
  document.body.style.overflow = "";
}

document.querySelectorAll("[data-pay-close]").forEach(button => {
  button.addEventListener("click", closePayModal);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !payModal.hidden) closePayModal();
});

document.querySelectorAll(".transfer-btn").forEach(button => {
  button.addEventListener("click", async () => {
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "GENERANDO REFERENCIA...";

    try {
      const response = await fetch("/api/create-bank-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: HOME_PLAN.key })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo generar la referencia.");
      }

      activeOrderId = data.order_id;
      activeReference = data.reference;
      payReference.textContent = activeReference;
      openPayModal();
    } catch (error) {
      console.error(error);
      alert(error.message || "No pudimos iniciar el pago.");
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  });
});

document.querySelectorAll("[data-copy]").forEach(button => {
  button.addEventListener("click", async () => {
    const value = button.dataset.copy || "";
    try {
      await navigator.clipboard.writeText(value);
      const old = button.textContent;
      button.textContent = "Copiado";
      setTimeout(() => button.textContent = old, 1200);
    } catch (_) {}
  });
});

copyPayReference?.addEventListener("click", async () => {
  if (!activeReference) return;
  try {
    await navigator.clipboard.writeText(activeReference);
    const old = copyPayReference.textContent;
    copyPayReference.textContent = "Copiado";
    setTimeout(() => copyPayReference.textContent = old, 1200);
  } catch (_) {}
});

reportPayment?.addEventListener("click", async () => {
  const payerName = payPayerName.value.trim();
  const last4 = payLast4.value.trim();

  if (!payerName) {
    payStatus.textContent = "Escribe el nombre de quien realizó la transferencia.";
    return;
  }

  if (!/^\d{4}$/.test(last4)) {
    payStatus.textContent = "Escribe exactamente los últimos 4 dígitos de la cuenta.";
    return;
  }

  reportPayment.disabled = true;
  const old = reportPayment.textContent;
  reportPayment.textContent = "REPORTANDO...";
  payStatus.textContent = "";

  try {
    const response = await fetch("/api/report-transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: activeOrderId,
        payer_name: payerName,
        payer_last4: last4
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo reportar la transferencia.");
    }

    payDetails.hidden = true;
    paySuccess.hidden = false;
  } catch (error) {
    console.error(error);
    payStatus.textContent = error.message || "No pudimos reportar la transferencia.";
  } finally {
    reportPayment.disabled = false;
    reportPayment.textContent = old;
  }
});
