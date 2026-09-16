export const meta = {
  name: 'pos-doble-pantalla-f2',
  description: 'Fase 2 del POS de doble pantalla: terminales, ajustes completos, propina y QR con imagen (builder → tester → qa por parte, rondas hasta ≥ 9,5)',
  phases: [
    { title: 'Parte A', detail: 'terminales y ajustes completos' },
    { title: 'Partes B C', detail: 'propina y QR con imagen' },
    { title: 'Integración F2', detail: 'extremo a extremo y QA final' },
  ],
}

const PLAN = args.plan
const DATE = args.date
const UMBRAL = 9.5
const MAX_RONDAS = 3

const REGLAS = `
Reglas del repositorio (además del CLAUDE.md que ya tienes):
- Español de Colombia en código, comentarios y textos. Nunca el nombre de una organización cliente.
- La tabla public.pos_terminals YA EXISTE en la base (migración supabase/migrations/20260916010000_pos_terminals.sql, aplicada por el orquestador). No escribas .sql ni migraciones; si necesitas un cambio de esquema, dilo en pendientes.
- pos_terminals: columnas pairing_code y display_token_hash NO son legibles desde el cliente (revoke select a authenticated); no las selecciones desde el navegador.
- Ajustes de la pantalla: organization_settings, key 'pos_customer_display', mismo upsert/onConflict que operating_hours. Valida con zod antes de guardar y al leer (degradar a defaults, nunca romper).
- Deja limpios de ESLint los archivos que toques. tsc filtrado a tus archivos sin errores. npx jest src/__tests__/pos-display debe seguir en verde.
- No edites PROGRESS.md ni ${PLAN}. No hagas git commit ni push. No toques cambios ajenos sin commitear.
`

const CONTEXTO = `
Contexto verificado:
- Plan: ${PLAN}. Lee §4 (estados, en especial 4.2 y 4.4 táctil/no táctil), §5.2 (tarjeta y ajustes con sus valores por defecto), §6.1/§6.2 (ajustes y pos_terminals), §8 (protocolo real), §12 Fase 2.
- Fase 0 aprobada: src/lib/pos/display/ (protocol, projection, transport, terminal, emitter), ruta src/app/pos-display/ + src/components/pos-display/, indicador en src/app/app/pos/page.tsx, tarjeta "Pantalla del cliente" en src/components/pos/configuracion/ (ConfiguracionPage.tsx + ConfigModals.tsx + el componente que creó la Fase 0). Fase 1 aprobada: bridge window.goAdminDesktop.posDisplay para Electron. LEE ESTOS ARCHIVOS: los nombres exactos de funciones del emitter y del receptor salen de ahí, no los inventes.
- El POS YA genera QR dinámicos de pago: src/components/pos/CheckoutDialog.tsx tiene los estados qrImageUrl y qrData (llama a /api/integrations/breb/create-qr, Bold, etc.) y existe la tabla payment_qr_sessions. La Fase 2 solo debe PASAR esa imagen por el emitter a la pantalla.
- Propinas: el registro/reparto ya existe (src/components/pos/propinas/propinasService.ts, tabla tips con sale_id, payment_id, amount, tip_type). La propina elegida en pantalla se registra por ese flujo; no inventes otro.
- Terminal local: src/lib/pos/display/terminal.ts guarda pos_terminal_id (UUID) en localStorage. En F2 ese id debe corresponder a una fila de pos_terminals (o quedar sin vincular si la organización aún no creó terminales: la pantalla sigue funcionando con el id local).
- Detección táctil: navigator.maxTouchPoints > 0 en la pantalla, con override 'auto' | 'touch' | 'no-touch' en los ajustes.
`

const PARTES = {
  A: { nombre: 'A · Terminales y ajustes completos', alcance: `
1. Servicio src/lib/services/posTerminalsService.ts: listar/crear/editar/desactivar terminales de la sucursal (organization_id de la sesión, branch_id del contexto de sucursal), sin leer pairing_code ni display_token_hash. Vincular esta caja: guarda en localStorage el id de la fila elegida (reutiliza la clave de terminal.ts) y expón getLinkedTerminal().
2. Esquema zod src/lib/pos/display/settings.ts con TODOS los ajustes de PLAN §5.2 y sus valores por defecto exactos (enabled, tips{enabled,presets[3],allowCustom}, rating{enabled}, showTaxBreakdown, showCustomerName, idle{mode,mediaUrls,idleAfterSeconds}, locale, touch). parse seguro: entrada inválida → defaults por campo. Helper loadCustomerDisplaySettings(orgId) / saveCustomerDisplaySettings(orgId, settings) sobre organization_settings.
3. Tarjeta "Pantalla del cliente" completa en Configuración › POS: todos los ajustes de §5.2 con el mismo patrón visual que las demás tarjetas; sección "Esta caja" para elegir/crear terminal (nombre y código) y ver cuál está vinculada; en Electron, selector de monitor (ya existe de F1). Al guardar: refresh del emitter para que aplique sin recargar. i18n en los archivos de mensajes del proyecto.
4. El emitter debe leer los ajustes con el helper de settings.ts (no un JSON crudo) y exponerlos a la pantalla en el hello (o en el state) para que la pantalla sepa presets de propina, rating, showTaxBreakdown, locale y touch override. Ajusta protocol.ts de forma ADITIVA si hace falta (nuevo campo opcional en hello) y documenta.
5. Tests: settings.test.ts (defaults, entradas inválidas, presets fuera de rango, locale nulo), posTerminalsService con mocks.` },
  B: { nombre: 'B · Propina en pantalla', alcance: `
1. Estado 'tip' completo según PLAN §4.2/§4.4: cuando tips.enabled y el carrito entra en cobro, la caja emite mode 'tip' con presets y allowCustom; la pantalla muestra "¿Desea dejar propina?" con los 3 porcentajes (importe calculado en vivo sobre el subtotal, formato de moneda de la organización), "Otro" y "Sin propina". Táctil: el cliente pulsa y la pantalla envía tip_selected {kind, value}. No táctil: se muestran los importes como información y no hay botones.
2. Lado caja: al recibir tip_selected, aviso NO bloqueante en el POS "Cliente eligió 10 % ($X)" con Aplicar / Cambiar. Aplicar registra la propina por el flujo existente de propinas (propinasService) vinculada a la venta al confirmar; nada se aplica solo. El cajero puede omitir y seguir cobrando.
3. Orden de estados: order → tip (si aplica) → payment → thanks. Si el cajero cambia de método o cancela, la pantalla vuelve a order. Documenta la máquina de estados en el emitter.
4. Tests: emitter (tip solo si enabled; tip_selected llega a la caja; omitir vuelve a payment), y lógica pura del cálculo de importes de propina (redondeo, presets, custom).` },
  C: { nombre: 'C · Cobro con QR a pantalla completa', alcance: `
1. CheckoutDialog: cuando hay qrImageUrl o qrData para un método QR, emitir payment {method:'qr', provider, qr:{kind:'image'|'text', value}, expiresAt}. Botón "Mostrar en pantalla del cliente" marcado por defecto si hay pantalla conectada (usa el estado de conexión del indicador de F0).
2. Pantalla: estado Cobro·QR con el QR a pantalla completa (imagen, o generado desde el texto con una librería ya presente en el proyecto si la hay; si no, solo imagen y texto grande), nombre del medio, total, y cuenta atrás si expiresAt. Táctil: botón "Ya pagué" que envía qr_paid_claim (solo avisa). No táctil: sin botón.
3. Lado caja: al recibir qr_paid_claim, toast "El cliente indica que ya pagó" sin cambiar nada; la confirmación sigue siendo del cajero/webhook como hoy.
4. Sin red o sin imagen: la pantalla muestra "Pago con QR: siga las instrucciones del cajero" (PLAN §3.5), nunca un código roto.
5. Tests: proyección del payment qr, guard del protocolo con qr null/expirado, y que qr_paid_claim no altera el estado.` },
}

const BUILD_SCHEMA = { type: 'object', properties: { resumen: { type: 'string' }, archivos: { type: 'array', items: { type: 'string' } }, feedbackAtendido: { type: 'array', items: { type: 'string' } }, decisiones: { type: 'array', items: { type: 'string' } }, pendientes: { type: 'array', items: { type: 'string' } } }, required: ['resumen', 'archivos', 'feedbackAtendido', 'decisiones', 'pendientes'] }
const TEST_SCHEMA = { type: 'object', properties: { ejecutados: { type: 'number' }, pasaron: { type: 'number' }, fallaron: { type: 'number' }, fallos: { type: 'array', items: { type: 'object', properties: { severidad: { type: 'string', enum: ['crítico', 'alto', 'medio', 'bajo'] }, descripcion: { type: 'string' }, reproducir: { type: 'string' }, esperado: { type: 'string' }, obtenido: { type: 'string' } }, required: ['severidad', 'descripcion', 'reproducir', 'esperado', 'obtenido'] } }, noProbado: { type: 'array', items: { type: 'string' } }, robustez: { type: 'number' }, evidencia: { type: 'string' }, testsAgregados: { type: 'array', items: { type: 'string' } } }, required: ['ejecutados', 'pasaron', 'fallaron', 'fallos', 'noProbado', 'robustez', 'evidencia', 'testsAgregados'] }
const QA_SCHEMA = { type: 'object', properties: { calificacion: { type: 'number' }, fortalezas: { type: 'array', items: { type: 'string' } }, problemas: { type: 'array', items: { type: 'object', properties: { severidad: { type: 'string', enum: ['crítico', 'alto', 'medio', 'bajo'] }, descripcion: { type: 'string' }, accion: { type: 'string' } }, required: ['severidad', 'descripcion', 'accion'] } }, paraElDiez: { type: 'array', items: { type: 'string' } }, veredicto: { type: 'string', enum: ['aprobado', 'requiere-nueva-ronda'] } }, required: ['calificacion', 'fortalezas', 'problemas', 'paraElDiez', 'veredicto'] }

function fb(test, qa) {
  const a = (qa?.problemas || []).map((p, i) => `${i + 1}. [qa · ${p.severidad}] ${p.descripcion}\n   Acción: ${p.accion}`)
  const b = (test?.fallos || []).map((f, i) => `${i + 1}. [tester · ${f.severidad}] ${f.descripcion}\n   Reproducir: ${f.reproducir}\n   Esperado: ${f.esperado} | Obtenido: ${f.obtenido}`)
  return [...a, ...b].join('\n')
}

async function ciclo(parte, fase) {
  const p = PARTES[parte]
  const rondas = []
  let feedback = null
  for (let ronda = 1; ronda <= MAX_RONDAS; ronda++) {
    log(`F2 ${p.nombre} — ronda ${ronda}`)
    const build = await agent(`Eres el BUILDER de la Fase 2 del POS de doble pantalla, parte ${p.nombre} (ronda ${ronda}).
${CONTEXTO}${REGLAS}
Alcance exacto:
${p.alcance}
${feedback ? `RONDA DE CORRECCIÓN. Lista obligatoria por severidad:\n${feedback}` : ''}
${parte !== 'A' ? 'La Parte A de esta fase (settings.ts, posTerminalsService, tarjeta completa) ya está aprobada: úsala. Solo cambios ADITIVOS en sus archivos y dilo en decisiones.' : ''}
Al terminar: eslint de lo tocado limpio, jest de pos-display en verde. No declares la parte lista.`, { label: `builder:F2${parte}:r${ronda}`, phase: fase, schema: BUILD_SCHEMA })
    if (!build) break
    const test = await agent(`Eres el TESTER de la Fase 2, parte ${p.nombre} (ronda ${ronda}). Rompe, no defiendas; no arregles.
${CONTEXTO}
Alcance:
${p.alcance}
Builder dice: ${JSON.stringify(build, null, 2)}
Haz: jest de pos-display y guardrails; eslint de lo tocado; tsc filtrado a los archivos de la fase (NODE_OPTIONS=--max-old-space-size=8192, tarda minutos: espéralo); casos borde (ajustes inválidos en organization_settings, presets vacíos, subtotal 0 con propina, QR expirado, pantalla no táctil con tips activadas, terminal sin vincular, dos cajas con la misma terminal). Para la parte A verifica contra la base con el MCP de Supabase (execute_sql, solo lectura) que pos_terminals se escribe con organization_id/branch_id correctos si hay forma de ejecutar el servicio; si no, dilo en noProbado. Añade tests que falten en src/__tests__/pos-display/ (archivos nuevos). Calificación de robustez 1-10.`, { label: `tester:F2${parte}:r${ronda}`, phase: fase, schema: TEST_SCHEMA })
    const qa = await agent(`Eres el QA-REVIEWER de la Fase 2, parte ${p.nombre} (ronda ${ronda}). Auditas, calificas 1-10, das acciones concretas; verificas el código tú mismo.
${CONTEXTO}
Alcance: ${p.alcance}
Builder: ${JSON.stringify(build, null, 2)}
Tester: ${JSON.stringify(test, null, 2)}
Rubric de 5 dimensiones (2 puntos c/u): funcionalidad completa según PLAN §4.2/§4.4/§5.2; robustez; consistencia (organization_settings pos_*, patrón de tarjetas/modales, tips existente, i18n, moneda/zona horaria, multi-tenant: nunca organization_id del cliente en escrituras de servidor); resultados del tester (un crítico limita a 6); trazabilidad. Nunca 10 automático. Si < 9,5, acciones concretas.`, { label: `qa:F2${parte}:r${ronda}`, phase: fase, schema: QA_SCHEMA, effort: 'high' })
    rondas.push({ ronda, build, test, qa })
    const nota = qa?.calificacion ?? 0
    log(`F2 ${p.nombre} — ronda ${ronda}: QA ${nota}/10, tester ${test?.robustez ?? '?'}/10, ${qa?.veredicto ?? '?'}`)
    if (nota >= UMBRAL) break
    feedback = fb(test, qa)
  }
  return { parte, rondas }
}

phase('Parte A')
const rA = await ciclo('A', 'Parte A')
if ((rA.rondas[rA.rondas.length - 1]?.qa?.calificacion ?? 0) < UMBRAL) return { fecha: DATE, fase: 'F2', detenidoEn: 'A', partes: [rA] }

phase('Partes B C')
const rBC = await parallel(['B', 'C'].map((p) => () => ciclo(p, 'Partes B C')))
const partes = [rA, ...rBC.filter(Boolean)]
const noOk = partes.filter((r) => (r.rondas[r.rondas.length - 1]?.qa?.calificacion ?? 0) < UMBRAL).map((r) => r.parte)
if (noOk.length) return { fecha: DATE, fase: 'F2', detenidoEn: noOk, partes }

phase('Integración F2')
const testInt = await agent(`Eres el TESTER DE INTEGRACIÓN de la Fase 2. Las tres partes pasaron QA por separado; pruébalas JUNTAS con jest (tests en src/__tests__/pos-display/integracion-f2.test.ts): ajustes guardados → emitter los aplica sin recargar → tip aparece solo si enabled → tip_selected → confirmación en caja → payment qr con imagen → qr_paid_claim no cambia estado → thanks. Regresión: jest completo (fallos preexistentes aparte, con nombre), eslint de todo lo tocado en la fase, tsc filtrado. Táctil vs no táctil con el override de ajustes. No arregles: reporta.
${CONTEXTO}
Partes: ${JSON.stringify(partes.map((r) => ({ parte: r.parte, archivos: r.rondas[r.rondas.length - 1].build.archivos })))}`, { label: 'tester:F2:integracion', phase: 'Integración F2', schema: TEST_SCHEMA })
const qaFinal = await agent(`Eres el QA-REVIEWER FINAL de la Fase 2. Califica la fase completa 1-10 verificando el código. Criterios de aceptación del PLAN §12 Fase 2: activar propinas, el cliente elige 10 % en pantalla, el cajero confirma y la propina queda en tips con el sale_id correcto; un cobro Bre-B muestra el QR al cliente y se cierra al confirmar. Anota qué probar en el hardware real.
${CONTEXTO}
Partes: ${JSON.stringify(partes.map((r) => ({ parte: r.parte, rondas: r.rondas.length, qa: r.rondas[r.rondas.length - 1]?.qa?.calificacion })))}
Integración: ${JSON.stringify(testInt, null, 2)}`, { label: 'qa:F2:final', phase: 'Integración F2', schema: QA_SCHEMA, effort: 'high' })
return { fecha: DATE, fase: 'F2', partes, integracion: { test: testInt, qa: qaFinal } }
