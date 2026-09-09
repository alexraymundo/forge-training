# FORGE v8 — Fix desbloqueo de cuestionario

# FORGE v7 — Transferencia SPEI con aprobación

Esta versión no necesita credenciales de Mercado Pago para funcionar.

## Ya configurado
- D1 binding: `DB`
- Base: `forge-payments`
- Flujo de transferencia SPEI
- Referencia única por orden
- Cliente reporta nombre + últimos 4 dígitos
- Estado pendiente
- Panel privado `/admin.html`
- El cuestionario se desbloquea únicamente al quedar `approved`

## Secreto requerido
En Cloudflare > forge-training > Settings/Bindings > Variables and Secrets crea:

`ADMIN_KEY` como **Secret**

Usa una contraseña larga y única. No la pongas en el código.

## Publicar
Este proyecto está preparado para Cloudflare Workers + Static Assets.

Después de desplegarlo, entra a:
`https://TU-WORKER.workers.dev/admin.html`

Alex escribe la clave `ADMIN_KEY`, revisa las transferencias y aprueba solo después de ver el depósito en su banca.
