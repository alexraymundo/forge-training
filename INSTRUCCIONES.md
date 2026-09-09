# FORGE v13 — Contacto, estados y código de un solo uso

Cambios:
- WhatsApp y correo obligatorios en cuestionario.
- Estado de cliente en admin: cuestionario enviado / rutina en proceso / entregada.
- Código se consume al enviar perfil.
- Admin puede reabrir acceso y generar un nuevo código.
- Botón directo de WhatsApp en perfiles.

# FORGE v12 — Perfiles guardados en D1

Flujo completo:
1. Pago aprobado.
2. Admin genera código.
3. Cliente usa código.
4. Cliente completa cuestionario.
5. Perfil se guarda automáticamente en D1.
6. Alex lo consulta desde /admin.html.

No necesitas crear manualmente la tabla profiles: el Worker usa CREATE TABLE IF NOT EXISTS.

# FORGE v10 — Código manual de acceso

Flujo: transferencia → aprobación admin → código FORGE-XXXXXX → cliente escribe código → cuestionario.

No requiere cambios de esquema D1: el código se guarda en preference_id, campo no usado por SPEI.

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
