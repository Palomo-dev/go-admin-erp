# GO Admin Print Agent

Agente local de impresión física para el módulo POS de **GO Admin ERP**. Corre como un proceso Node.js en un PC dentro del local (restaurante/sucursal) y traduce los "trabajos de impresión" encolados desde la app web (tabla `print_jobs` en Supabase) a comandos ESC/POS enviados por **USB, red (TCP/IP), Bluetooth o impresora del sistema**.

## ¿Por qué es necesario?

Un navegador web no puede abrir sockets TCP crudos ni imprimir de forma silenciosa/automática a impresoras de red o Bluetooth (restricciones de seguridad del navegador). Este agente resuelve eso: corre fuera del navegador, con acceso completo al hardware local, y se conecta a Supabase igual que la app web (misma URL/clave), evitando problemas de red local / mixed-content, ya que la comunicación agente ↔ Supabase es siempre HTTPS/WSS saliente.

```
App Web (POS) ──insert print_jobs──▶ Supabase (Realtime) ──▶ Print Agent (este proyecto) ──ESC/POS──▶ Impresora física
```

## Requisitos

- Node.js 18+
- Una impresora térmica (o del sistema) ya configurada en **Configuración POS → Impresoras** dentro de la app web, con su estación asignada (Cocina Caliente, Cocina Fría, Bar, Caja).
- Un usuario de Supabase válido dentro de la organización (recomendado: crear un usuario dedicado, ej. `robot-impresion@turestaurante.com`), usado solo para autenticar este agente.

## Instalación

```bash
cd print-agent
npm install
cp .env.example .env
```

Completa el archivo `.env`:

| Variable | Descripción |
|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Mismos valores que usa la app web |
| `AGENT_EMAIL` / `AGENT_PASSWORD` | Credenciales del usuario que autentica al agente |
| `ORGANIZATION_ID` / `BRANCH_ID` | IDs de la organización y sucursal donde corre este agente |
| `AGENT_NAME` | Nombre identificador (ej. "Agente - Sucursal Norte") |

## Ejecución

```bash
npm run dev      # desarrollo (tsx, recarga directa desde TypeScript)
# o para producción:
npm run build
npm start
```

El agente:
1. Se autentica contra Supabase.
2. Envía un "heartbeat" cada `HEARTBEAT_INTERVAL_MS` a la tabla `print_agents` (visible como estado online/offline).
3. Se suscribe en tiempo real a nuevos `print_jobs` de su sucursal, y además hace polling de respaldo cada `POLL_INTERVAL_MS` (cubre jobs creados mientras estaba offline).
4. Por cada job, busca la impresora asociada (`printers`) y envía el ticket formateado según su tipo de conexión.

## Estado de soporte por tipo de conexión

| Tipo | Estado | Notas |
|---|---|---|
| **Red (TCP/IP)** | ✅ Listo | Usa `escpos-network`. Requiere IP y puerto (normalmente 9100) de la impresora. |
| **Sistema (spooler OS)** | ✅ Listo | Usa el paquete `printer` (node-printer), envía texto plano a la impresora por nombre tal como está registrada en el SO. |
| **USB** | ⚠️ Requiere validación con hardware real | Usa `escpos-usb`. Necesita `vendor_id`/`product_id` en hexadecimal y, en Windows, el driver WinUSB (instalable con [Zadig](https://zadig.akeo.ie/)); en Linux, reglas `udev` con permisos adecuados. |
| **Bluetooth** | ⚠️ Requiere validación con hardware real | Usa `escpos-bluetooth`. El dispositivo debe estar previamente emparejado con el SO; `mac_address` debe coincidir con el emparejamiento. |

## Formato de los `print_jobs`

Cada fila de `print_jobs` incluye un `payload` JSON con la estructura de la comanda (ticket, mesa, mesero, estación, items). Ver `src/types.ts` (`KitchenTicketPrintPayload`) y `src/escposFormatter.ts` para el formato de impresión generado.

## Múltiples sucursales / múltiples impresoras

- Cada sucursal con impresoras físicas necesita **su propia instancia** de este agente corriendo en un PC de ese local (configurado con su `BRANCH_ID`).
- Una misma instancia del agente puede manejar **todas las impresoras** configuradas para esa sucursal (cocina caliente, fría, bar, caja), siempre que estén accesibles desde ese PC (misma red local para las de red, USB/Bluetooth conectadas directamente a esa máquina).
