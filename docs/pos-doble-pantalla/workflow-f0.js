export const meta = {
  name: 'pos-doble-pantalla-f0',
  description: 'Fase 0 del POS de doble pantalla: builder → tester → qa-reviewer por parte, rondas hasta ≥ 9,5, e integración final',
  phases: [
    { title: 'Parte A', detail: 'protocolo, proyección y transporte' },
    { title: 'Partes B C D', detail: 'emisión, ruta /pos-display, indicador y configuración' },
    { title: 'Integración', detail: 'pruebas de extremo a extremo y QA final' },
  ],
}

const PLAN = args.plan
const DATE = args.date
const UMBRAL = 9.5
const MAX_RONDAS = 3

const REGLAS = `
Reglas del repositorio que aplican a tu trabajo (además del CLAUDE.md que ya tienes):
- Español de Colombia en código, comentarios y textos. Nunca escribas el nombre de una organización cliente.
- No crees archivos .sql ni migraciones en esta fase: la Fase 0 no toca la base de datos.
- Deja limpios de ESLint los archivos que toques (npx eslint <archivo>). Los ~190 errores de tsc preexistentes en OTROS archivos no son tuyos.
- Nunca uses toISOString().split('T')[0] ni .split('T')[0] sobre valores de la BD.
- No edites PROGRESS.md ni ${PLAN}: los actualiza el orquestador.
- No hagas git commit ni git push.
- Trabaja en el árbol de trabajo tal cual está (hay cambios sin commitear de otras sesiones en otros archivos: no los toques ni los reviertas).
`

const CONTEXTO = `
Contexto verificado (no lo re-descubras, úsalo):
- Plan completo en ${PLAN}. Léelo entero antes de empezar; tu parte está definida ahí (§8 protocolo, §4 UX, §5 cajero, §12 Fase 0).
- Carrito del POS: tipos en src/components/pos/types.ts (Cart, CartItem, CartItemModifier). Servicio: src/lib/services/posService.ts (clase POSService con métodos estáticos; el carrito se guarda en localStorage con saveCartsToStorage / saveCartToStorage, clave pos_carts_<orgId>). NO cambies cómo se guarda.
- Página del POS: src/app/app/pos/page.tsx (usa CartView, CartTabs, CheckoutDialog). Modal de cobro: src/components/pos/CheckoutDialog.tsx.
- Precedente de pantalla propia fuera de /app: src/app/qr-display/[deviceId]/page.tsx.
- Configuración del POS: src/components/pos/configuracion/ConfiguracionPage.tsx (tarjetas + modales en ConfigModals.tsx). Persiste ajustes en la tabla organization_settings con upsert({organization_id, key, settings, updated_at}, {onConflict:'organization_id,key'}); claves existentes: pos_categories_display, pos_blind_cash_count, pos_cash_session_mode, pos_require_cash_session, operating_hours. La clave nueva es pos_customer_display.
- Marca: organizations.logo_url, primary_color, secondary_color, timezone. Hook de organización: useOrganization() en @/lib/hooks/useOrganization.
- Tests: jest con testEnvironment node, testMatch **/__tests__/**/*.test.ts (solo .ts, no .tsx). Node ≥ 18 tiene BroadcastChannel global: sirve para probar el transporte sin navegador.
- i18n con next-intl (useTranslations, useLocale). Formato de moneda: busca el helper que usa el recibo/CartView y reutilízalo.
`

const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    resumen: { type: 'string' },
    archivos: { type: 'array', items: { type: 'string' } },
    feedbackAtendido: { type: 'array', items: { type: 'string' } },
    decisiones: { type: 'array', items: { type: 'string' } },
    pendientes: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumen', 'archivos', 'feedbackAtendido', 'decisiones', 'pendientes'],
}

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    ejecutados: { type: 'number' },
    pasaron: { type: 'number' },
    fallaron: { type: 'number' },
    fallos: { type: 'array', items: { type: 'object', properties: {
      severidad: { type: 'string', enum: ['crítico', 'alto', 'medio', 'bajo'] },
      descripcion: { type: 'string' },
      reproducir: { type: 'string' },
      esperado: { type: 'string' },
      obtenido: { type: 'string' },
    }, required: ['severidad', 'descripcion', 'reproducir', 'esperado', 'obtenido'] } },
    noProbado: { type: 'array', items: { type: 'string' } },
    robustez: { type: 'number' },
    evidencia: { type: 'string' },
    testsAgregados: { type: 'array', items: { type: 'string' } },
  },
  required: ['ejecutados', 'pasaron', 'fallaron', 'fallos', 'noProbado', 'robustez', 'evidencia', 'testsAgregados'],
}

const QA_SCHEMA = {
  type: 'object',
  properties: {
    calificacion: { type: 'number' },
    fortalezas: { type: 'array', items: { type: 'string' } },
    problemas: { type: 'array', items: { type: 'object', properties: {
      severidad: { type: 'string', enum: ['crítico', 'alto', 'medio', 'bajo'] },
      descripcion: { type: 'string' },
      accion: { type: 'string' },
    }, required: ['severidad', 'descripcion', 'accion'] } },
    paraElDiez: { type: 'array', items: { type: 'string' } },
    veredicto: { type: 'string', enum: ['aprobado', 'requiere-nueva-ronda'] },
  },
  required: ['calificacion', 'fortalezas', 'problemas', 'paraElDiez', 'veredicto'],
}

const PARTES = {
  A: {
    nombre: 'A · Protocolo, proyección del carrito y transporte',
    alcance: `
Crea src/lib/pos/display/ con:
1. protocol.ts — los tipos de §8 del plan (DownMessage, UpMessage, DisplayState, DisplayCart, DisplayPayment) con versión v: 1. Exporta también un type guard isDownMessage/isUpMessage que valide forma y versión.
2. projection.ts — projectCartForDisplay(cart: Cart, opts: { currency: string; lastChangedLineId?: string | null }): DisplayCart. Sin el objeto product completo. Nombres de modificadores y extraPrice. Descuentos por línea y totales, etiqueta de descuento si hay cupón/promoción en el carrito (mira qué campos tiene Cart para eso; si no hay, deja discountLabel null y documenta). Respeta tax_included. Debe ser función pura y determinista.
3. transport.ts — interfaz DisplayTransport (§3.2) y BroadcastChannelTransport: canal por terminalId ('pos-display:<terminalId>'), seq creciente por emisor, descarte de mensajes de otra terminal o con seq no creciente, y heartbeat opcional (start/stop) cada 1 s. Debe funcionar en Node ≥ 18 (BroadcastChannel global) para poder probarse.
4. terminal.ts — getOrCreateLocalTerminalId(): identidad local en localStorage ('pos_terminal_id'), UUID generado una vez. En Fase 0 no hay tabla; documenta que F2 la formaliza.
5. Tests en src/__tests__/pos-display/: proyección (varios carritos: vacío, con modificadores, descuento, impuesto incluido/excluido, 200 líneas), type guards, y transporte (dos canales en el mismo proceso: emisor y receptor; descarte por terminal ajena y por seq viejo; heartbeat). Deben pasar con npx jest src/__tests__/pos-display.
Criterios: cero any innecesario, exports con nombre, comentarios breves donde haya decisión no obvia.`,
  },
  B: {
    nombre: 'B · Emisión desde posService y CheckoutDialog',
    alcance: `
1. Un emisor único src/lib/pos/display/emitter.ts: mantiene el DisplayState actual, expone setCart(cart|null), setPayment(payment|null), setMode(...), y publica por el transporte de Parte A de forma COALESCIDA (requestAnimationFrame en navegador, setTimeout 0 en tests) para que varias mutaciones en la misma vuelta emitan un solo 'state'. Emite 'hello' al arrancar y responde 'need_snapshot' con hello + state completo. Respeta el interruptor maestro: lee organization_settings/pos_customer_display.enabled (la Parte D lo persiste; aquí solo léelo con un helper cacheado en memoria y una función refresh()); si está apagado, no emite nada.
2. Conecta el emisor en el POS: tras CADA mutación del carrito activo en src/lib/services/posService.ts (addItem, remove, updateQuantity, descuentos, hold, clear, etc.) llama al emisor. Hazlo en un único punto (donde se guarda el carrito) para no olvidar rutas. No cambies cómo se guarda el carrito.
3. CheckoutDialog.tsx: al abrir el cobro, setPayment según el método: cash → total/received/change en vivo mientras el cajero teclea; card/bold_card → method card; cualquier método QR (nequi, daviplata, breb_qr, bold_qr, bancolombia_qr, redeban_qr, qr, transfer) → method 'qr' con qr: null (la imagen llega en F2). Al confirmar la venta → mode 'thanks' con total, y a los 8 s → idle. Al cancelar → vuelve a 'order'.
4. Tests en src/__tests__/pos-display/emitter.test.ts: coalescencia (3 setCart seguidos = 1 state), hello al inicio, respuesta a need_snapshot, y que con enabled=false no se emite. Mockea el transporte.
Regla: no importes nada de React en emitter.ts (debe ser probable en Node).`,
  },
  C: {
    nombre: 'C · Ruta /pos-display',
    alcance: `
1. src/app/pos-display/page.tsx ('use client', fuera de /app: sin sidebar ni header) + componentes en src/components/pos-display/. Usa el transporte de Parte A: al montar envía need_snapshot con capabilities {touch: navigator.maxTouchPoints > 0, width, height} y pinta el DisplayState que reciba.
2. Estados de §4.2 para esta fase: Reposo (marca + reloj), Pedido (§4.3: líneas con resaltado de 600 ms en lastChangedLineId, subtotal, descuento con etiqueta, impuestos como 'IVA incluido' o desglose según taxIncluded, TOTAL grande), Cobro·efectivo (total, recibido, cambio), Cobro·tarjeta (total + 'Siga las instrucciones del datáfono'), Cobro·QR sin imagen (total + 'Siga las instrucciones del cajero'), Gracias (8 s), Conectando (sin heartbeat 3 s: oculta importes), Cerrado no aplica aún.
3. Marca: logo, primary_color y nombre de la organización desde useOrganization(); si el color de marca no alcanza contraste AA sobre blanco, oscurécelo (helper pequeño). Tipografías fluidas con clamp(): total ≥ 96 px en 1920×1080, legible en 1024×768.
4. Sin scroll: si no caben las líneas, muestra las últimas N y 'y X más'.
5. Fundido de 200 ms entre estados; sin animaciones > 300 ms; sin sonidos.
6. Botón discreto de pantalla completa (requestFullscreen) que se oculta si window.electronAPI existe.
7. i18n con next-intl: añade las claves necesarias en TODOS los archivos de mensajes que use el proyecto (busca dónde viven, p. ej. messages/es.json y en.json) y no dejes textos hardcodeados.
8. Moneda con el mismo helper que el POS. Zona horaria de la organización para el reloj (usa lo de src/lib/utils/dateDisplay.ts; nunca hardcodees America/Bogota).
Pruebas que debes dejar: un test .ts de la lógica pura que extraigas (p. ej. el helper de contraste y el recorte de líneas) en src/__tests__/pos-display/.`,
  },
  D: {
    nombre: 'D · Indicador en el POS y tarjeta en Configuración › POS',
    alcance: `
1. Indicador en la cabecera de src/app/app/pos/page.tsx: punto verde 'Pantalla del cliente conectada' / gris 'Sin pantalla' según si el emisor de Parte B ha recibido need_snapshot/heartbeat de una pantalla en los últimos 3 s (expón lo necesario desde el emisor sin acoplar React a él). Al pulsarlo: menú con 'Abrir pantalla del cliente' y 'Cerrar'.
2. Abrir en web: window.open('/pos-display', 'pos-display', 'popup,width=1280,height=800'); nombre fijo para no duplicar. Primera vez: aviso (toast) 'Arrastre la ventana a la pantalla del cliente y pulse F11', recordado en localStorage. Si existe window.electronAPI?.posDisplay?.open úsalo (llegará en F1); si no, el window.open.
3. Tarjeta 'Pantalla del cliente' en src/components/pos/configuracion/ConfiguracionPage.tsx con el MISMO patrón que las demás tarjetas (tarjeta + modal en ConfigModals.tsx). Contenido de Fase 0: interruptor maestro 'Pantalla del cliente' y botón 'Abrir ahora'. Persiste en organization_settings con key 'pos_customer_display' y settings {enabled: boolean} usando exactamente el mismo upsert/onConflict que operating_hours. Lee el valor al cargar. Al guardar, llama al refresh() del emisor (Parte B) para que la caja aplique el cambio sin recargar.
4. El módulo de propina/calificación NO va en esta fase: deja un comentario indicando que llega en F2.
5. i18n: claves en los archivos de mensajes del proyecto, sin textos hardcodeados.
Deja limpios los archivos que toques.`,
  },
}

function promptBuilder(parte, ronda, feedbackPrevio) {
  const p = PARTES[parte]
  return `Eres el BUILDER de la parte ${p.nombre} de la Fase 0 del POS de doble pantalla (ronda ${ronda}).
${CONTEXTO}
${REGLAS}
Tu alcance exacto:
${p.alcance}
${feedbackPrevio ? `\nEsta es una RONDA DE CORRECCIÓN. Feedback del tester y del qa-reviewer de la ronda anterior; trátalo como lista obligatoria en orden de severidad:\n${feedbackPrevio}\n` : ''}
${parte !== 'A' ? 'Los archivos de la Parte A (src/lib/pos/display/protocol.ts, projection.ts, transport.ts, terminal.ts) ya existen y están aprobados: úsalos. Solo modifícalos si es estrictamente necesario y de forma ADITIVA (nuevos exports), y dilo en decisiones.' : ''}
Antes de terminar: corre npx eslint sobre cada archivo que tocaste y npx jest sobre los tests que creaste; corrige lo que salga. No declares la parte como lista: eso lo decide el qa-reviewer.`
}

function promptTester(parte, ronda, build) {
  const p = PARTES[parte]
  return `Eres el TESTER de la parte ${p.nombre} de la Fase 0 del POS de doble pantalla (ronda ${ronda}). Tu trabajo es romper lo construido, no defenderlo. No arregles nada: reporta con pasos reproducibles.
${CONTEXTO}
Alcance de la parte (lo que DEBERÍA cumplir):
${p.alcance}
Lo que el builder dice que hizo (verifícalo, no lo creas):
${JSON.stringify(build, null, 2)}
Qué hacer:
1. Lee los archivos cambiados y los tests. Corre npx jest src/__tests__/pos-display (y la suite existente src/__tests__/guardrails.test.ts para comprobar que no rompió nada).
2. Corre npx eslint sobre cada archivo tocado. Corre NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "pos-display|pos/display|posService|CheckoutDialog|ConfiguracionPage|app/pos/page" y reporta SOLO errores en archivos de esta fase (los ~190 preexistentes en otros archivos no cuentan). tsc tarda varios minutos: espéralo.
3. Diseña y ejecuta casos: camino feliz, casos borde (carrito vacío, 200 líneas, cantidad 0, descuento mayor que el subtotal, impuesto incluido vs excluido, modificadores sin precio, terminal ajena, mensajes fuera de orden, enabled=false), y de error (JSON malformado, versión desconocida del protocolo).
4. Si faltan tests razonables, escríbelos tú en src/__tests__/pos-display/ (archivos .test.ts nuevos, no edites los del builder) y déjalos en el repo; lista sus rutas en testsAgregados.
5. Para la Parte C (UI): además del análisis estático, intenta una verificación de render real: si puedes levantar un servidor de Next sin colisionar con otro que ya esté corriendo en este directorio (revisa primero puertos en uso), abre /pos-display y comprueba que renderiza el estado Conectando/Reposo sin errores en consola; si no es viable, dilo en noProbado en vez de fingirlo.
Sé específico y verificable. Calificación de robustez de 1 a 10 con justificación breve en evidencia.`
}

function promptQA(parte, ronda, build, test) {
  const p = PARTES[parte]
  return `Eres el QA-REVIEWER de la parte ${p.nombre} de la Fase 0 del POS de doble pantalla (ronda ${ronda}). No construyes ni arreglas: auditas, calificas de 1 a 10 y das dirección concreta.
${CONTEXTO}
Alcance que debía cumplirse:
${p.alcance}
Informe del builder:
${JSON.stringify(build, null, 2)}
Informe del tester:
${JSON.stringify(test, null, 2)}
Rubric (5 dimensiones de 2 puntos, promedia): funcionalidad completa sin atajos; robustez (bordes, errores, concurrencia); consistencia con los patrones del proyecto (multi-tenant, capa de servicios, convenciones de organization_settings, i18n, moneda/zona horaria); resultados del tester (un solo fallo crítico limita el máximo a 6); trazabilidad (decisiones documentadas en el código).
Verifica tú mismo lo que afirman ambos leyendo el código: no te fíes de los informes. Nunca un 10 automático: solo si de verdad no encuentras nada. Entre 9,5 y 9,9 es aprobado, pero anota qué falta para el 10.
Si calificas < 9,5, cada problema debe traer una acción concreta y verificable para el builder (ejemplo bueno: 'projectCartForDisplay no suma extraPrice de modificadores al total de línea cuando quantity > 1: ver línea X'; ejemplo malo: 'mejorar la proyección').`
}

function formatearFeedback(test, qa) {
  const fallos = (test?.fallos || []).map((f, i) => `${i + 1}. [tester · ${f.severidad}] ${f.descripcion}\n   Reproducir: ${f.reproducir}\n   Esperado: ${f.esperado} | Obtenido: ${f.obtenido}`)
  const problemas = (qa?.problemas || []).map((p, i) => `${i + 1}. [qa · ${p.severidad}] ${p.descripcion}\n   Acción: ${p.accion}`)
  return [...problemas, ...fallos].join('\n')
}

async function cicloParte(parte, fase) {
  const rondas = []
  let feedback = null
  for (let ronda = 1; ronda <= MAX_RONDAS; ronda++) {
    log(`${PARTES[parte].nombre} — ronda ${ronda}`)
    const build = await agent(promptBuilder(parte, ronda, feedback), { label: `builder:${parte}:r${ronda}`, phase: fase, schema: BUILD_SCHEMA })
    if (!build) { rondas.push({ ronda, error: 'builder sin resultado' }); break }
    const test = await agent(promptTester(parte, ronda, build), { label: `tester:${parte}:r${ronda}`, phase: fase, schema: TEST_SCHEMA })
    const qa = await agent(promptQA(parte, ronda, build, test), { label: `qa:${parte}:r${ronda}`, phase: fase, schema: QA_SCHEMA, effort: 'high' })
    rondas.push({ ronda, build, test, qa })
    const nota = qa?.calificacion ?? 0
    log(`${PARTES[parte].nombre} — ronda ${ronda}: QA ${nota}/10, tester ${test?.robustez ?? '?'}/10, veredicto ${qa?.veredicto ?? '?'}`)
    if (nota >= UMBRAL) break
    feedback = formatearFeedback(test, qa)
  }
  return { parte, rondas }
}

phase('Parte A')
const resultadoA = await cicloParte('A', 'Parte A')
const notaA = resultadoA.rondas[resultadoA.rondas.length - 1]?.qa?.calificacion ?? 0
if (notaA < UMBRAL) {
  log(`Parte A no alcanzó ${UMBRAL} tras ${resultadoA.rondas.length} rondas: se detiene la fase para escalar.`)
  return { fecha: DATE, detenidoEn: 'A', partes: [resultadoA] }
}

phase('Partes B C D')
const resultadosBCD = await parallel(['B', 'C', 'D'].map((p) => () => cicloParte(p, 'Partes B C D')))
const partes = [resultadoA, ...resultadosBCD.filter(Boolean)]
const noAprobadas = partes.filter((r) => (r.rondas[r.rondas.length - 1]?.qa?.calificacion ?? 0) < UMBRAL).map((r) => r.parte)
if (noAprobadas.length) {
  log(`Partes sin aprobar tras ${MAX_RONDAS} rondas: ${noAprobadas.join(', ')}. Se escala sin integración.`)
  return { fecha: DATE, detenidoEn: noAprobadas, partes }
}

phase('Integración')
const resumenPartes = partes.map((r) => ({ parte: r.parte, archivos: r.rondas[r.rondas.length - 1].build.archivos, decisiones: r.rondas[r.rondas.length - 1].build.decisiones }))
const testInt = await agent(`Eres el TESTER DE INTEGRACIÓN de la Fase 0 del POS de doble pantalla. Las cuatro partes ya pasaron QA por separado; ahora pruébalas JUNTAS.
${CONTEXTO}
Archivos y decisiones por parte:
${JSON.stringify(resumenPartes, null, 2)}
Casos obligatorios:
1. Extremo a extremo en Node: con el transporte real (BroadcastChannel) y el emitter real, simula que POSService muta un carrito (usa el mismo camino de código que el POS, no el emitter a mano si es posible) y comprueba que un receptor recibe hello + state con la proyección correcta; luego need_snapshot desde el receptor y respuesta completa; luego heartbeat.
2. Coalescencia real: N mutaciones rápidas → un solo state.
3. Interruptor maestro: enabled=false → nada se emite; refresh() con enabled=true → empieza a emitir.
4. Cobro: cash con recibido/cambio, card, qr → estados correctos; confirmar → thanks; 8 s → idle (usa fake timers).
5. Regresión: npx jest completo (reporta fallos preexistentes aparte de los nuevos, con nombre), npx eslint de todos los archivos tocados en la fase, y tsc filtrado a los archivos de la fase.
6. Render: si es viable sin colisionar con otro servidor, /pos-display en un navegador; si no, dilo.
Deja los tests de integración en src/__tests__/pos-display/integracion.test.ts. No arregles nada; reporta.`, { label: 'tester:integracion', phase: 'Integración', schema: TEST_SCHEMA })

const qaFinal = await agent(`Eres el QA-REVIEWER FINAL de la Fase 0 del POS de doble pantalla. Califica la FASE COMPLETA (no una parte) de 1 a 10 con el rubric de 5 dimensiones, verificando el código tú mismo.
${CONTEXTO}
Partes y sus últimas calificaciones: ${JSON.stringify(partes.map((r) => ({ parte: r.parte, rondas: r.rondas.length, qa: r.rondas[r.rondas.length - 1]?.qa?.calificacion })))}
Informe del tester de integración:
${JSON.stringify(testInt, null, 2)}
Criterios de aceptación de la fase (del plan §12 Fase 0): con dos ventanas en un portátil, teclear una venta se refleja en < 100 ms; cerrar la caja deja la pantalla en Conectando en ≤ 3 s; recargar la pantalla recupera la venta completa. Evalúa si el código construido los cumple o qué le falta. Anota explícitamente qué queda para el 10 y qué debería probarse en el hardware real (pantalla táctil) que no se pudo probar aquí.`, { label: 'qa:final', phase: 'Integración', schema: QA_SCHEMA, effort: 'high' })

return { fecha: DATE, partes, integracion: { test: testInt, qa: qaFinal } }