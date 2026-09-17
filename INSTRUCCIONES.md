# FORGE v20 — Fix de build validado

Corrige el error de sintaxis de v19 en `src/index.js`.
El archivo fue validado con `node --check` antes de generar este ZIP.

# FORGE v19 — Fix Workers AI

Esta versión corrige la integración gratuita con Cloudflare Workers AI.

## Cambios

- Mantiene `@cf/zai-org/glm-4.7-flash`.
- Usa el binding nativo `AI`.
- Desactiva el modo de razonamiento para simplificar respuestas.
- Soporta múltiples formatos de respuesta de Workers AI.
- Los errores del Admin ahora muestran más información útil.
- Agrega botón **⚡ Probar conexión IA** en Admin → Rutinas IA.

## Prueba recomendada

Después de desplegar:

1. Entra a `/admin.html`.
2. Ve a `Rutinas IA`.
3. Pulsa **⚡ Probar conexión IA**.

Resultado esperado:

`✅ FORGE AI OK`

Si aparece que falta el binding:

Cloudflare → forge-training → Bindings

Debe existir:

- Type: Workers AI
- Variable name: `AI`

El `wrangler.toml` ya contiene:

```toml
[ai]
binding = "AI"
```

## Si la prueba funciona

Entonces usa **Generar borrador IA**.

## Si la prueba falla

El mismo panel mostrará el error concreto devuelto por Cloudflare para poder corregirlo sin adivinar.
