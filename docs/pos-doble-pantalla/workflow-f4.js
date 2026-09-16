export const meta = {
  name: 'pos-doble-pantalla-f4',
  description: 'Fase 4 del POS de doble pantalla: calificación del cliente y modo reposo con promociones (builder → tester → qa)',
  phases: [{ title: 'Fase 4', detail: 'calificación, informe y reposo' }],
}

const PLAN = args.plan
const DATE = args.date
const UMBRAL = 9.5
const MAX_RONDAS = 3

const REGLAS = `
Reglas del repositorio (además del CLAUDE.md que ya tienes):
- Español de Colombia; nunca el nombre de una organización cliente.
- La tabla public.pos_display_feedback YA EXISTE (migración aplicada por el orquestador: id, organization_id, branch_id, terminal_id, sale_id nullable, rating 1-5, created_at; insert solo desde servidor con service role tras validar el token/sesión; select para miembros). Sin .sql nuevos.
- Sin datos personales del cliente: solo el número de calificación.
- Ruta de servidor para registrar la calificación: con sesión (pantalla local) → getServerOrgContext(); con token de pantalla remota → displayAuth de la Fase 3. Nunca organization_id del body.
- eslint limpio; tsc filtrado; jest de pos-display en verde. No edites PROGRESS.md ni ${PLAN}. No commits ni push.
`

const CONTEXTO = `
Contexto verificado:
- Plan: ${PLAN} §4.2 (estado Gracias con calificación), §4.4 (solo táctil), §5.2 (ajuste rating.enabled, modo reposo: marca / promociones / imágenes propias), §6.3, §12 Fase 4.
- Fases 0-3 aprobadas: src/lib/pos/display/ (protocol con UpMessage 'rating', emitter, settings con rating e idle), ruta src/app/pos-display/, tarjeta de configuración, rutas /api/pos/display/* con displayAuth, transporte remoto.
- Promociones activas del módulo POS: src/app/app/pos/promociones y su servicio (búscalo en src/lib/services o src/components/pos/promociones). Reportes del POS: src/app/app/pos/reportes (patrón de páginas de informe).
- Imágenes propias para el reposo: si el proyecto ya tiene un selector de imágenes de la organización (src/components/common/ImagePickerDialog.tsx existe en el repo de tiendas; busca el equivalente aquí, p. ej. bucket organization_images), reutilízalo; si no, URLs en los ajustes.
`

const ALCANCE = `
1. Calificación: en el estado Gracias, si rating.enabled y la pantalla es táctil, 1-5 con una sola pulsación (iconos grandes, accesibles, sin texto obligatorio). Al pulsar: UpMessage rating → la caja la registra por POST /api/pos/display/feedback (sesión o token) en pos_display_feedback con terminal_id y sale_id de la venta recién confirmada. Una sola calificación por venta (idempotente por sale_id+terminal_id en servidor). Sin táctil: no se pide.
2. Informe simple en Reportes › POS: "Satisfacción en caja" con promedio, distribución 1-5 y conteo por sucursal y por terminal, con el filtro de fechas y zona horaria de la organización que usen los demás informes. Sin datos personales.
3. Modo reposo según idle.mode de los ajustes: 'brand' (actual), 'promotions' (rotación suave de promociones ACTIVAS del módulo, con nombre, descripción corta y vigencia; 8 s por promoción, fundido 300 ms, sin sonido), 'media' (imágenes propias en idle.mediaUrls, mismo ritmo). Entra en reposo tras idle.idleAfterSeconds sin actividad. Si no hay promociones ni imágenes, cae a 'brand'.
4. Tests: idempotencia de la calificación, rotación del reposo (fake timers), fallback a brand, y el informe con datos sintéticos (mocks del cliente).
`

const BUILD_SCHEMA = { type: 'object', properties: { resumen: { type: 'string' }, archivos: { type: 'array', items: { type: 'string' } }, feedbackAtendido: { type: 'array', items: { type: 'string' } }, decisiones: { type: 'array', items: { type: 'string' } }, pendientes: { type: 'array', items: { type: 'string' } } }, required: ['resumen', 'archivos', 'feedbackAtendido', 'decisiones', 'pendientes'] }
const TEST_SCHEMA = { type: 'object', properties: { ejecutados: { type: 'number' }, pasaron: { type: 'number' }, fallaron: { type: 'number' }, fallos: { type: 'array', items: { type: 'object', properties: { severidad: { type: 'string', enum: ['crítico', 'alto', 'medio', 'bajo'] }, descripcion: { type: 'string' }, reproducir: { type: 'string' }, esperado: { type: 'string' }, obtenido: { type: 'string' } }, required: ['severidad', 'descripcion', 'reproducir', 'esperado', 'obtenido'] } }, noProbado: { type: 'array', items: { type: 'string' } }, robustez: { type: 'number' }, evidencia: { type: 'string' }, testsAgregados: { type: 'array', items: { type: 'string' } } }, required: ['ejecutados', 'pasaron', 'fallaron', 'fallos', 'noProbado', 'robustez', 'evidencia', 'testsAgregados'] }
const QA_SCHEMA = { type: 'object', properties: { calificacion: { type: 'number' }, fortalezas: { type: 'array', items: { type: 'string' } }, problemas: { type: 'array', items: { type: 'object', properties: { severidad: { type: 'string', enum: ['crítico', 'alto', 'medio', 'bajo'] }, descripcion: { type: 'string' }, accion: { type: 'string' } }, required: ['severidad', 'descripcion', 'accion'] } }, paraElDiez: { type: 'array', items: { type: 'string' } }, veredicto: { type: 'string', enum: ['aprobado', 'requiere-nueva-ronda'] } }, required: ['calificacion', 'fortalezas', 'problemas', 'paraElDiez', 'veredicto'] }

function fb(test, qa) {
  const a = (qa?.problemas || []).map((p, i) => `${i + 1}. [qa · ${p.severidad}] ${p.descripcion}\n   Acción: ${p.accion}`)
  const b = (test?.fallos || []).map((f, i) => `${i + 1}. [tester · ${f.severidad}] ${f.descripcion}\n   Reproducir: ${f.reproducir}\n   Esperado: ${f.esperado} | Obtenido: ${f.obtenido}`)
  return [...a, ...b].join('\n')
}

phase('Fase 4')
const rondas = []
let feedback = null
for (let ronda = 1; ronda <= MAX_RONDAS; ronda++) {
  log(`Fase 4 — ronda ${ronda}`)
  const build = await agent(`Eres el BUILDER de la Fase 4 del POS de doble pantalla (ronda ${ronda}).
${CONTEXTO}${REGLAS}
Alcance exacto:
${ALCANCE}
${feedback ? `RONDA DE CORRECCIÓN. Lista obligatoria por severidad:\n${feedback}` : ''}
Al terminar: eslint limpio, jest de pos-display en verde. No declares la fase lista.`, { label: `builder:F4:r${ronda}`, phase: 'Fase 4', schema: BUILD_SCHEMA })
  if (!build) break
  const test = await agent(`Eres el TESTER de la Fase 4 (ronda ${ronda}). Rompe: calificación duplicada por la misma venta, rating fuera de 1-5, sin sale_id, pantalla no táctil con rating activado, reposo sin promociones, mediaUrls con URL inválida, zona horaria en el informe (TZ=UTC y TZ=America/Bogota: npm run test:tz-all si aplica). jest de pos-display y guardrails, eslint, tsc filtrado. Verifica con el MCP de Supabase (solo lectura) que la ruta de feedback no acepta organization_id del body. No arregles: reporta.
${CONTEXTO}
Alcance: ${ALCANCE}
Builder dice: ${JSON.stringify(build, null, 2)}`, { label: `tester:F4:r${ronda}`, phase: 'Fase 4', schema: TEST_SCHEMA })
  const qa = await agent(`Eres el QA-REVIEWER de la Fase 4 (ronda ${ronda}). Rubric de 5 dimensiones; privacidad (sin datos personales) y multi-tenant son críticos. Verifica el código tú mismo. Nunca 10 automático.
${CONTEXTO}
Alcance: ${ALCANCE}
Builder: ${JSON.stringify(build, null, 2)}
Tester: ${JSON.stringify(test, null, 2)}`, { label: `qa:F4:r${ronda}`, phase: 'Fase 4', schema: QA_SCHEMA, effort: 'high' })
  rondas.push({ ronda, build, test, qa })
  const nota = qa?.calificacion ?? 0
  log(`Fase 4 — ronda ${ronda}: QA ${nota}/10, tester ${test?.robustez ?? '?'}/10, ${qa?.veredicto ?? '?'}`)
  if (nota >= UMBRAL) break
  feedback = fb(test, qa)
}
return { fecha: DATE, fase: 'F4', rondas }
