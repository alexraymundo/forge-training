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
// FORGE SPEI - HOME
// ------------------------------
const HOME_PLANS = {
  essential: { name: "Essential", amount: 299 },
  forge_plus: { name: "FORGE+", amount: 499 },
  coaching: { name: "Coaching", amount: 799 }
};

document.querySelectorAll(".transfer-btn").forEach(button => {
  button.addEventListener("click", async () => {
    const plan = button.dataset.plan;
    const meta = HOME_PLANS[plan];
    if (!meta) return;

    const old = button.textContent;
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

      const msg =
`TRANSFERENCIA SPEI

Plan: ${meta.name}
Total: $${meta.amount} MXN

Banco: Banamex
Beneficiario: Alejandro Rosales
CLABE: 002975010143135230

Referencia: ${data.reference}

Después de transferir, contacta a FORGE y proporciona esta referencia.
Cuando Alex apruebe el pago te enviará tu código de acceso al cuestionario.`;

      alert(msg);

      try {
        await navigator.clipboard.writeText(data.reference);
      } catch (_) {}
    } catch (error) {
      console.error(error);
      alert("No pudimos generar la referencia. Intenta nuevamente.");
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  });
});
