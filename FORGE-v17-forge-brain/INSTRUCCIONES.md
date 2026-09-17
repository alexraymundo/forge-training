# FORGE v17 — FORGE Brain

Esta versión añade una capa de conocimiento propio a FORGE.

## Qué guarda automáticamente

Por cada cliente/rutina:

1. `ai_draft`
   - El borrador original creado por FORGE AI.

2. `trainer_edit`
   - Cada versión que Alex guarda después de editar.

3. `delivered`
   - La rutina final que Alex aprobó y entregó.

Esto permite comparar en el futuro:
**qué propuso la IA → qué cambió Alex → qué terminó recibiendo el cliente.**

## Feedback de Alex

En la pestaña Rutinas IA aparecen botones:

- 👍 Bueno
- 🛠 Necesitó ajustes
- 👎 Malo

Si hubo ajustes, Alex puede indicar cosas como:

- volumen
- ejercicios
- frecuencia
- descansos
- progresión
- distribución
- limitaciones
- otro

También puede dejar una nota.

## Pestaña 🧠 FORGE Brain

Muestra:

- Rutinas entregadas
- Borradores IA guardados
- Ediciones de Alex
- Evaluaciones
- Casos que ya sirven como conocimiento FORGE
- Feedback reciente

## Cómo usa FORGE Brain la información

Cuando Alex genera una rutina nueva:

1. Lee el perfil actual.
2. Busca hasta 3 rutinas FORGE ya entregadas con similitud en:
   - objetivo
   - nivel
   - días
   - lugar
   - duración
3. Se las pasa a FORGE AI como referencias históricas.
4. La IA recibe la instrucción de NO copiar ciegamente y de priorizar el perfil actual.

Esto es un sistema de **memoria + recuperación de casos (RAG simple)**.

Todavía NO es fine-tuning ni entrenamiento de un modelo propio.

## Cuándo tendría sentido entrenar/fine-tunear

Primero conviene acumular:

- decenas/cientos de borradores IA
- sus correcciones
- rutinas finales
- feedback de Alex
- resultados/feedback de clientes

Cuando el dataset tenga suficiente calidad podremos exportarlo y preparar una fase de entrenamiento especializado.

## Tablas nuevas

- `routine_versions`
- `brain_feedback`

El Worker las crea automáticamente con `CREATE TABLE IF NOT EXISTS`, por lo que no necesitas ejecutar SQL manualmente en una instalación existente.

## Lo demás de v16 sigue incluido

- Notificaciones en Admin
- Correo opcional vía Resend
- FORGE AI privado
- Generador de rutinas
- Mi FORGE
- Límites por plan
