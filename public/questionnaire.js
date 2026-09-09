
(async function protectQuestionnaire() {
  const raw = sessionStorage.getItem("forgeQuestionnaireAccess");
  if (!raw) {
    window.location.replace("/acceso.html");
    return;
  }

  let access;
  try {
    access = JSON.parse(raw);
  } catch (_) {
    window.location.replace("/acceso.html");
    return;
  }

  try {
    const response = await fetch("/api/redeem-access-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: access.code }),
      cache: "no-store"
    });
    const data = await response.json();

    if (!response.ok || !data.approved) {
      sessionStorage.removeItem("forgeQuestionnaireAccess");
      window.location.replace("/acceso.html");
      return;
    }

    document.getElementById("selectedPlan").value =
      ({essential:"Essential",forge_plus:"FORGE+",coaching:"Coaching"})[data.plan] || data.plan;

    document.getElementById("accessChecking").hidden = true;
    document.getElementById("questionnairePageContent").hidden = false;
  } catch (_) {
    window.location.replace("/acceso.html");
  }
})();

const form = document.getElementById("clientQuestionnaire");
const panels = [...document.querySelectorAll(".q-panel")];
const steps = [...document.querySelectorAll(".q-step-indicator")];
const prev = document.getElementById("prevQuestion");
const next = document.getElementById("nextQuestion");
const finish = document.getElementById("finishQuestionnaire");
const errorBox = document.getElementById("questionnaireError");
const summary = document.getElementById("profileSummary");
const success = document.getElementById("questionnaireSuccess");
const ring = document.getElementById("progressRing");
const percent = document.getElementById("progressPercent");
let step = 1;

function showStep(n) {
  step = Math.max(1, Math.min(5, n));
  panels.forEach(p => p.classList.toggle("active", Number(p.dataset.panel) === step));
  steps.forEach(s => {
    const n = Number(s.dataset.step);
    s.classList.toggle("active", n === step);
    s.classList.toggle("complete", n < step);
  });
  prev.disabled = step === 1;
  next.hidden = step === 5;
  finish.hidden = step !== 5;
  const pct = step * 20;
  percent.textContent = `${pct}%`;
  const deg = pct * 3.6;
  ring.style.background = `conic-gradient(var(--gold) 0deg ${deg}deg,#1a1711 ${deg}deg 360deg)`;
  if (step === 5) buildSummary();
  errorBox.hidden = true;
}

function validateStep() {
  const panel = panels.find(p => Number(p.dataset.panel) === step);
  const required = [...panel.querySelectorAll("[required]")];
  for (const field of required) {
    if (field.type === "radio") {
      if (!panel.querySelector(`input[name="${field.name}"]:checked`)) {
        errorBox.textContent = "Completa los campos obligatorios.";
        errorBox.hidden = false;
        return false;
      }
    } else if (field.type === "checkbox") {
      if (!field.checked) {
        errorBox.textContent = "Confirma la información para continuar.";
        errorBox.hidden = false;
        return false;
      }
    } else if (!field.value || !field.checkValidity()) {
      errorBox.textContent = "Completa los campos obligatorios.";
      errorBox.hidden = false;
      field.focus();
      return false;
    }
  }
  return true;
}

function data() {
  const d = Object.fromEntries(new FormData(form).entries());
  const goal = form.querySelector('input[name="mainGoal"]:checked');
  d.mainGoal = goal ? goal.value : "";
  return d;
}

function buildSummary() {
  const d = data();
  const rows = [
    ["Nombre",d.clientName],["Plan",d.selectedPlan],["Edad",d.age],
    ["WhatsApp",d.whatsapp],["Correo",d.email],
    ["Objetivo",d.mainGoal],["Prioridad",d.priorityArea],
    ["Nivel",d.trainingLevel],["Días",d.trainingDays],
    ["Sesión",d.sessionTime],["Lugar",d.trainingPlace],
    ["Equipo",d.equipmentAvailable],["Preferidos",d.likes],
    ["Evitar",d.dislikes],["Limitaciones",d.limitations]
  ];
  summary.innerHTML = rows.map(([k,v]) =>
    `<div class="summary-item"><span>${k}</span><strong>${v || "No especificado"}</strong></div>`
  ).join("");
}

next.addEventListener("click", () => {
  if (validateStep()) showStep(step + 1);
});
prev.addEventListener("click", () => showStep(step - 1));

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!validateStep()) return;

  const rawAccess = sessionStorage.getItem("forgeQuestionnaireAccess");
  if (!rawAccess) {
    window.location.replace("/acceso.html");
    return;
  }

  let access;
  try {
    access = JSON.parse(rawAccess);
  } catch (_) {
    window.location.replace("/acceso.html");
    return;
  }

  const submitButton = document.getElementById("finishQuestionnaire");
  const oldText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Enviando...";

  try {
    const profile = data();

    const response = await fetch("/api/submit-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_code: access.code,
        profile
      })
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "No se pudo guardar el perfil");
    }

    localStorage.setItem(
      "forgeClientProfile",
      JSON.stringify({
        ...profile,
        orderId: result.order_id,
        savedAt: new Date().toISOString()
      })
    );

    form.hidden = true;
    success.hidden = false;
    sessionStorage.removeItem("forgeQuestionnaireAccess");

    const successText = success.querySelector("p");
    if (successText) {
      successText.textContent =
        "Tu información fue enviada correctamente a FORGE. Alex ya puede verla desde su panel.";
    }
  } catch (error) {
    console.error(error);
    errorBox.textContent =
      "No pudimos enviar tu perfil. Intenta nuevamente.";
    errorBox.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = oldText;
  }
});

showStep(1);
