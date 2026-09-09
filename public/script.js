const form = document.getElementById("forgeForm");
const result = document.getElementById("aiResult");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");
const resultTags = document.getElementById("resultTags");

const goalNames = {
  musculo: "Hipertrofia",
  fuerza: "Fuerza",
  grasa: "Definición",
  gluteo: "Glúteo y pierna",
  general: "Condición general"
};

const equipmentNames = {
  gym: "Gimnasio completo",
  casa: "Entrenamiento en casa",
  basico: "Equipo básico"
};

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const goal = document.getElementById("goal").value;
  const level = document.getElementById("level").value;
  const days = Number(document.getElementById("days").value);
  const equipment = document.getElementById("equipment").value;

  let split = "";
  if (days <= 2) split = "Full body";
  else if (days === 3) split = goal === "gluteo" ? "Inferior / superior / inferior" : "Full body de 3 días";
  else if (days === 4) split = goal === "gluteo" ? "2 días pierna + 2 superior" : "Upper / Lower";
  else if (days === 5) split = goal === "gluteo" ? "3 días pierna + 2 superior" : "Torso / pierna con día de especialización";
  else split = "División de 6 días con volumen distribuido";

  let focus = "";
  if (goal === "musculo") focus = "volumen progresivo y selección estable de ejercicios";
  if (goal === "fuerza") focus = "movimientos principales, progresión de cargas y técnica";
  if (goal === "grasa") focus = "entrenamiento de fuerza con densidad bien controlada";
  if (goal === "gluteo") focus = "frecuencia alta de tren inferior con énfasis en glúteo";
  if (goal === "general") focus = "fuerza general, capacidad de trabajo y adherencia";

  resultTitle.textContent = `${goalNames[goal]} · ${days} días`;
  resultText.textContent =
    `Una estructura tipo ${split} puede encajar bien con tu perfil ${level}. ` +
    `El programa debería priorizar ${focus} y adaptarse a ${equipmentNames[equipment].toLowerCase()}.`;

  resultTags.innerHTML = [
    goalNames[goal],
    `${days} días`,
    level.charAt(0).toUpperCase() + level.slice(1),
    equipmentNames[equipment]
  ].map(tag => `<span>${tag}</span>`).join("");

  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
});



// ------------------------------
// FORGE CLIENT QUESTIONNAIRE
// ------------------------------
const questionnaire = document.getElementById("clientQuestionnaire");
const panels = [...document.querySelectorAll(".q-panel")];
const stepIndicators = [...document.querySelectorAll(".q-step-indicator")];
const prevQuestion = document.getElementById("prevQuestion");
const nextQuestion = document.getElementById("nextQuestion");
const finishQuestionnaire = document.getElementById("finishQuestionnaire");
const questionnaireError = document.getElementById("questionnaireError");
const profileSummary = document.getElementById("profileSummary");
const questionnaireSuccess = document.getElementById("questionnaireSuccess");
const progressRing = document.getElementById("progressRing");
const progressPercent = document.getElementById("progressPercent");
const selectedPlanInput = document.getElementById("selectedPlan");

let currentQuestionStep = 1;
const totalQuestionSteps = 5;

function setQuestionStep(step) {
  currentQuestionStep = Math.max(1, Math.min(totalQuestionSteps, step));

  panels.forEach(panel => {
    panel.classList.toggle("active", Number(panel.dataset.panel) === currentQuestionStep);
  });

  stepIndicators.forEach(indicator => {
    const n = Number(indicator.dataset.step);
    indicator.classList.toggle("active", n === currentQuestionStep);
    indicator.classList.toggle("complete", n < currentQuestionStep);
  });

  prevQuestion.disabled = currentQuestionStep === 1;
  nextQuestion.hidden = currentQuestionStep === totalQuestionSteps;
  finishQuestionnaire.hidden = currentQuestionStep !== totalQuestionSteps;

  const pct = Math.round((currentQuestionStep / totalQuestionSteps) * 100);
  progressPercent.textContent = `${pct}%`;
  const degrees = (currentQuestionStep / totalQuestionSteps) * 360;
  progressRing.style.background =
    `conic-gradient(var(--gold) 0deg ${degrees}deg, #1a1711 ${degrees}deg 360deg)`;

  questionnaireError.hidden = true;

  if (currentQuestionStep === 5) {
    buildProfileSummary();
  }

  document.querySelector(".questionnaire-card").scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

function validateCurrentPanel() {
  const panel = panels.find(p => Number(p.dataset.panel) === currentQuestionStep);
  const requiredFields = [...panel.querySelectorAll("[required]")];

  let firstInvalid = null;

  requiredFields.forEach(field => {
    let valid = true;

    if (field.type === "radio") {
      const checked = panel.querySelector(`input[name="${field.name}"]:checked`);
      valid = Boolean(checked);
    } else if (field.type === "checkbox") {
      valid = field.checked;
    } else {
      valid = field.value.trim() !== "" && field.checkValidity();
    }

    if (!valid && !firstInvalid) firstInvalid = field;
  });

  if (firstInvalid) {
    questionnaireError.textContent = "Completa los campos obligatorios antes de continuar.";
    questionnaireError.hidden = false;

    if (firstInvalid.type !== "radio") {
      firstInvalid.focus({ preventScroll: true });
    }
    return false;
  }

  questionnaireError.hidden = true;
  return true;
}

function getQuestionnaireData() {
  const data = Object.fromEntries(new FormData(questionnaire).entries());

  const mainGoal = questionnaire.querySelector('input[name="mainGoal"]:checked');
  data.mainGoal = mainGoal ? mainGoal.value : "";

  return data;
}

function cleanValue(value) {
  if (!value || String(value).trim() === "") return "No especificado";
  return String(value).trim();
}

function buildProfileSummary() {
  const data = getQuestionnaireData();

  const items = [
    ["Nombre", data.clientName],
    ["Plan seleccionado", data.selectedPlan || "Aún sin seleccionar"],
    ["Edad", data.age ? `${data.age} años` : ""],
    ["Estatura / peso", data.height && data.weight ? `${data.height} cm · ${data.weight} kg` : ""],
    ["Objetivo", data.mainGoal],
    ["Zona prioritaria", data.priorityArea],
    ["Nivel", data.trainingLevel],
    ["Frecuencia", data.trainingDays ? `${data.trainingDays} días por semana` : ""],
    ["Tiempo por sesión", data.sessionTime],
    ["Lugar", data.trainingPlace],
    ["Equipo", data.equipmentAvailable],
    ["Ejercicios preferidos", data.likes],
    ["Ejercicios a evitar", data.dislikes],
    ["Limitaciones relevantes", data.limitations],
  ];

  profileSummary.innerHTML = items.map(([label, value], index) => {
    const wide = index >= 10 ? " wide" : "";
    return `<div class="summary-item${wide}">
      <span>${label}</span>
      <strong>${cleanValue(value)}</strong>
    </div>`;
  }).join("");
}

nextQuestion.addEventListener("click", () => {
  if (!validateCurrentPanel()) return;
  setQuestionStep(currentQuestionStep + 1);
});

prevQuestion.addEventListener("click", () => {
  setQuestionStep(currentQuestionStep - 1);
});

stepIndicators.forEach(indicator => {
  indicator.addEventListener("click", () => {
    const target = Number(indicator.dataset.step);

    // Allow going backwards freely, but don't skip unfinished forward steps.
    if (target <= currentQuestionStep) setQuestionStep(target);
  });
});

questionnaire.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!validateCurrentPanel()) return;

  const data = getQuestionnaireData();
  data.savedAt = new Date().toISOString();

  localStorage.setItem("forgeClientProfile", JSON.stringify(data));

  questionnaire.hidden = true;
  questionnaireSuccess.hidden = false;
});

document.getElementById("editProfile").addEventListener("click", () => {
  questionnaireSuccess.hidden = true;
  questionnaire.hidden = false;
  setQuestionStep(1);
});

document.getElementById("downloadProfile").addEventListener("click", () => {
  const stored = localStorage.getItem("forgeClientProfile");
  if (!stored) return;

  const data = JSON.parse(stored);

  const lines = [
    "FORGE · PERFIL DE ENTRENAMIENTO",
    "==============================",
    "",
    `Nombre: ${cleanValue(data.clientName)}`,
    `Plan: ${cleanValue(data.selectedPlan)}`,
    `Edad: ${cleanValue(data.age)}`,
    `Estatura: ${cleanValue(data.height)} cm`,
    `Peso: ${cleanValue(data.weight)} kg`,
    `Objetivo principal: ${cleanValue(data.mainGoal)}`,
    `Zona prioritaria: ${cleanValue(data.priorityArea)}`,
    `Nivel: ${cleanValue(data.trainingLevel)}`,
    `Días por semana: ${cleanValue(data.trainingDays)}`,
    `Tiempo por sesión: ${cleanValue(data.sessionTime)}`,
    `Lugar de entrenamiento: ${cleanValue(data.trainingPlace)}`,
    `Equipo disponible: ${cleanValue(data.equipmentAvailable)}`,
    `Ejercicios preferidos: ${cleanValue(data.likes)}`,
    `Ejercicios a evitar: ${cleanValue(data.dislikes)}`,
    `Limitaciones relevantes: ${cleanValue(data.limitations)}`,
    "",
    "Nota: Este perfil sirve para personalizar el entrenamiento y no sustituye una valoración médica."
  ];

  const blob = new Blob([lines.join("\\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `FORGE-perfil-${(data.clientName || "cliente").replace(/\\s+/g, "-").toLowerCase()}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

// Load saved local profile if available
(function restoreForgeProfile() {
  const stored = localStorage.getItem("forgeClientProfile");
  if (!stored) return;

  try {
    const data = JSON.parse(stored);

    Object.entries(data).forEach(([key, value]) => {
      const field = questionnaire.elements[key];
      if (!field || key === "mainGoal") return;

      if (field instanceof RadioNodeList) return;
      if (typeof value === "string") field.value = value;
    });

    if (data.mainGoal) {
      const goalRadio = questionnaire.querySelector(
        `input[name="mainGoal"][value="${CSS.escape(data.mainGoal)}"]`
      );
      if (goalRadio) goalRadio.checked = true;
    }
  } catch (_) {}
})();

// Plan buttons now feed the questionnaire instead of only showing an alert.


// ------------------------------
// FORGE PAYMENT VERIFICATION
// ------------------------------
const paymentGate = document.getElementById("paymentGate");
const questionnaireUnlocked = document.getElementById("questionnaireUnlocked");
const paymentReturnBanner = document.getElementById("paymentReturnBanner");
const paymentReturnPlan = document.getElementById("paymentReturnPlan");
const paymentReturnMessage = document.getElementById("paymentReturnMessage");
const accessCodeInput = document.getElementById("accessCodeInput");
const redeemAccessCode = document.getElementById("redeemAccessCode");
const accessCodeMessage = document.getElementById("accessCodeMessage");

const transferModal = document.getElementById("transferModal");
const transferPlanName = document.getElementById("transferPlanName");
const transferPlanAmount = document.getElementById("transferPlanAmount");
const transferReference = document.getElementById("transferReference");
const transferPayerName = document.getElementById("transferPayerName");
const transferLast4 = document.getElementById("transferLast4");
const markTransferSent = document.getElementById("markTransferSent");
const transferWaiting = document.getElementById("transferWaiting");
const transferConfirm = document.getElementById("transferConfirm");
const waitingReference = document.getElementById("waitingReference");
const verifyPaymentNow = document.getElementById("verifyPaymentNow");

const TRANSFER_PLANS = {
  essential: { name: "Essential", amount: 299 },
  forge_plus: { name: "FORGE+", amount: 499 },
  coaching: { name: "Coaching", amount: 799 }
};

let activeTransferOrder = null;
let paymentPollTimer = null;

function planName(plan) {
  return TRANSFER_PLANS[plan]?.name || plan || "";
}

function setPaymentUI(status, plan) {
  const friendly = planName(plan);

  if (selectedPlanInput && friendly) {
    selectedPlanInput.value = friendly;
  }

  if (paymentReturnBanner && paymentReturnPlan) {
    paymentReturnPlan.textContent = friendly;
    paymentReturnBanner.hidden = !plan;
  }

  if (status === "approved") {
    clearTimeout(paymentPollTimer);

    paymentGate.hidden = true;
    questionnaireUnlocked.hidden = false;

    if (paymentReturnMessage) {
      paymentReturnMessage.textContent = "Pago confirmado ✓. Ya puedes completar tu perfil FORGE.";
    }

    localStorage.setItem("forgePaymentApproved", JSON.stringify({
      plan,
      approvedAt: new Date().toISOString()
    }));
    localStorage.removeItem("forgePendingOrder");

    // Si el cliente sigue viendo la ventana de transferencia,
    // mostrar confirmación y cerrarla automáticamente.
    if (transferModal && !transferModal.hidden) {
      if (transferWaiting) {
        const title = transferWaiting.querySelector("h4");
        const text = transferWaiting.querySelector("p");

        if (title) title.textContent = "Pago aprobado ✓";
        if (text) {
          text.textContent = "Tu transferencia fue confirmada. Ya puedes completar tu perfil FORGE.";
        }

        transferConfirm.hidden = true;
        transferWaiting.hidden = false;
      }

      setTimeout(() => {
        closeTransferModal();

        document.getElementById("cuestionario")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 1200);
    } else {
      setTimeout(() => {
        document.getElementById("cuestionario")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 250);
    }

    return;
  }

  paymentGate.hidden = false;
  questionnaireUnlocked.hidden = true;

  if (paymentReturnMessage) {
    if (status === "rejected") {
      paymentReturnMessage.textContent = "No pudimos validar el pago. Contacta a FORGE para revisarlo.";
    } else {
      paymentReturnMessage.textContent = "Pago pendiente de validación.";
    }
  }
}

async function checkPaymentStatus(orderId, plan, scheduleNext = true) {
  if (!orderId) return null;

  try {
    const response = await fetch(
      `/api/payment-status?order_id=${encodeURIComponent(orderId)}&_=${Date.now()}`,
      { cache: "no-store" }
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo consultar el pago");
    }

    setPaymentUI(data.status, data.plan || plan);

    if (
      scheduleNext &&
      data.status !== "approved" &&
      data.status !== "rejected"
    ) {
      clearTimeout(paymentPollTimer);
      paymentPollTimer = setTimeout(
        () => checkPaymentStatus(orderId, plan, true),
        3500
      );
    }

    return data;
  } catch (err) {
    console.error(err);

    if (scheduleNext) {
      clearTimeout(paymentPollTimer);
      paymentPollTimer = setTimeout(
        () => checkPaymentStatus(orderId, plan, true),
        6000
      );
    }

    return null;
  }
}

function openTransferModal() {
  transferModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeTransferModal() {
  transferModal.hidden = true;
  document.body.style.overflow = "";
}

document.querySelectorAll("[data-close-transfer]").forEach(el => {
  el.addEventListener("click", closeTransferModal);
});

document.querySelectorAll(".transfer-btn").forEach(button => {
  button.addEventListener("click", async () => {
    const plan = button.dataset.plan;
    const meta = TRANSFER_PLANS[plan];
    if (!meta) return;

    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "Generando referencia...";

    try {
      const response = await fetch("/api/create-bank-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo crear la orden");

      activeTransferOrder = data;
      transferPlanName.textContent = meta.name;
      transferPlanAmount.textContent = `$${meta.amount} MXN`;
      transferReference.textContent = data.reference;
      if (waitingReference) waitingReference.textContent = data.reference;
      transferPayerName.value = "";
      transferLast4.value = "";
      transferWaiting.hidden = true;
      transferConfirm.hidden = false;

      localStorage.setItem("forgePendingOrder", JSON.stringify({
        orderId: data.order_id,
        plan,
        reference: data.reference,
        method: "bank_transfer",
        createdAt: new Date().toISOString()
      }));

      setPaymentUI("pending", plan);
      openTransferModal();
    } catch (err) {
      console.error(err);
      alert("No pudimos generar la referencia. Intenta nuevamente.");
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  });
});

document.querySelectorAll("[data-copy]").forEach(button => {
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(button.dataset.copy);
    const old = button.textContent;
    button.textContent = "Copiado";
    setTimeout(() => button.textContent = old, 1000);
  });
});

document.getElementById("copyReference").addEventListener("click", async () => {
  if (!activeTransferOrder?.reference) return;
  await navigator.clipboard.writeText(activeTransferOrder.reference);
  const btn = document.getElementById("copyReference");
  const old = btn.textContent;
  btn.textContent = "Copiado";
  setTimeout(() => btn.textContent = old, 1000);
});

markTransferSent.addEventListener("click", async () => {
  if (!activeTransferOrder) return;

  const payerName = transferPayerName.value.trim();
  const last4 = transferLast4.value.trim();

  if (!payerName || !/^\d{4}$/.test(last4)) {
    alert("Completa tu nombre y los últimos 4 dígitos de la cuenta.");
    return;
  }

  const oldText = markTransferSent.textContent;
  markTransferSent.disabled = true;
  markTransferSent.textContent = "Guardando...";

  try {
    const response = await fetch("/api/report-transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: activeTransferOrder.order_id,
        payer_name: payerName,
        payer_last4: last4
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo registrar");

    transferConfirm.hidden = true;
    transferWaiting.hidden = false;
    if (waitingReference) {
      waitingReference.textContent = activeTransferOrder.reference || "—";
    }
    setPaymentUI("pending", activeTransferOrder.plan);
    checkPaymentStatus(activeTransferOrder.order_id, activeTransferOrder.plan, true);
  } catch (err) {
    console.error(err);
    alert("No pudimos registrar la transferencia. Intenta nuevamente.");
  } finally {
    markTransferSent.disabled = false;
    markTransferSent.textContent = oldText;
  }
});

// Restore the exact order this browser is waiting for.
(function restorePaymentState() {
  const approved = localStorage.getItem("forgePaymentApproved");
  if (approved) {
    try {
      const data = JSON.parse(approved);
      setPaymentUI("approved", data.plan);
      return;
    } catch (_) {}
  }

  const raw = localStorage.getItem("forgePendingOrder");
  if (!raw) return;

  try {
    const pending = JSON.parse(raw);

    activeTransferOrder = {
      order_id: pending.orderId,
      plan: pending.plan,
      reference: pending.reference || ""
    };

    if (waitingReference && pending.reference) {
      waitingReference.textContent = pending.reference;
    }

    setPaymentUI("pending", pending.plan);
    checkPaymentStatus(pending.orderId, pending.plan, true);
  } catch (_) {}
})();


// Manual status check for the exact order shown to the customer.
if (verifyPaymentNow) {
  verifyPaymentNow.addEventListener("click", async () => {
    const raw = localStorage.getItem("forgePendingOrder");

    if (!raw) {
      alert("No encontramos una orden pendiente en este navegador.");
      return;
    }

    try {
      const pending = JSON.parse(raw);
      const oldText = verifyPaymentNow.textContent;

      verifyPaymentNow.disabled = true;
      verifyPaymentNow.textContent = "Verificando...";

      const result = await checkPaymentStatus(
        pending.orderId,
        pending.plan,
        false
      );

      if (result && result.status !== "approved") {
        verifyPaymentNow.textContent = "Aún está pendiente";
        setTimeout(() => {
          verifyPaymentNow.textContent = oldText;
          verifyPaymentNow.disabled = false;
        }, 1400);
      } else {
        verifyPaymentNow.disabled = false;
        verifyPaymentNow.textContent = oldText;
      }
    } catch (_) {
      verifyPaymentNow.disabled = false;
      verifyPaymentNow.textContent = "Verificar pago ahora";
    }
  });
}

// If Alex approves from another tab in the same browser, unlock immediately.
window.addEventListener("storage", (event) => {
  if (event.key !== "forgeAdminApprovedOrder" || !event.newValue) return;

  try {
    const approved = JSON.parse(event.newValue);
    const raw = localStorage.getItem("forgePendingOrder");
    if (!raw) return;

    const pending = JSON.parse(raw);

    if (approved.orderId === pending.orderId) {
      checkPaymentStatus(pending.orderId, pending.plan, false);
    }
  } catch (_) {}
});


// ------------------------------
// FORGE ACCESS CODE
// ------------------------------
async function redeemForgeAccessCode() {
  const code = String(accessCodeInput?.value || "").trim().toUpperCase();

  if (!code) {
    accessCodeMessage.textContent = "Escribe el código que te proporcionó FORGE.";
    return;
  }

  const oldText = redeemAccessCode.textContent;
  redeemAccessCode.disabled = true;
  redeemAccessCode.textContent = "Validando...";
  accessCodeMessage.textContent = "Validando código...";

  try {
    const response = await fetch("/api/redeem-access-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store"
    });

    const data = await response.json();

    if (!response.ok || !data.approved) {
      accessCodeMessage.textContent =
        data.error || "Ese código no es válido o el pago aún no está aprobado.";
      return;
    }

    setPaymentUI("approved", data.plan);

    localStorage.setItem("forgeAccessCode", JSON.stringify({
      code,
      plan: data.plan,
      redeemedAt: new Date().toISOString()
    }));

    accessCodeMessage.textContent = "Código válido ✓. Acceso desbloqueado.";

    setTimeout(() => {
      document.getElementById("cuestionario")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 250);
  } catch (error) {
    console.error(error);
    accessCodeMessage.textContent = "No pudimos validar el código. Intenta nuevamente.";
  } finally {
    redeemAccessCode.disabled = false;
    redeemAccessCode.textContent = oldText;
  }
}

redeemAccessCode?.addEventListener("click", redeemForgeAccessCode);

accessCodeInput?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    redeemForgeAccessCode();
  }
});

(function restoreRedeemedAccessCode() {
  const raw = localStorage.getItem("forgeAccessCode");
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    if (saved?.code) {
      accessCodeInput.value = saved.code;
      redeemForgeAccessCode();
    }
  } catch (_) {}
})();
