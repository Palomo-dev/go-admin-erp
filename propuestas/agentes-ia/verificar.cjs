/** Verifica recorridos del prototipo local; nunca consulta aplicaciones externas. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const salida = path.join(__dirname, 'evidencia');
const url = process.env.PROPUESTA_URL || 'http://127.0.0.1:4318';

(async () => {
  fs.mkdirSync(salida, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: chromium.args, executablePath: await chromium.executablePath() });
  const errores = [], externos = [], comprobaciones = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errores.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (!/^(?:data:|blob:|file:|https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$))/.test(request.url())) {
        externos.push(request.url()); request.abort();
      } else request.continue();
    });
    const esperar = async () => { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); };
    const click = async (texto, selector = 'button,[role="radio"],[role="tab"],[role="option"]', ultimo = true) => {
      const handle = await page.evaluateHandle((s, t, last) => { const elementos = [...document.querySelectorAll(s)]; if (last) elementos.reverse(); return elementos.find(el => el.getClientRects().length && ((el.getAttribute('aria-label') || '').trim() === t || el.textContent.trim() === t || (el.matches('tr') && [...el.querySelectorAll('p')].some(p => p.textContent.trim() === t)))); }, selector, texto, ultimo);
      const el = handle.asElement(); assert(el, `No existe la acción visible: ${texto}`); await el.click(); await handle.dispose(); await esperar();
    };
    const contiene = async texto => assert((await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))).includes(texto), `Falta contenido: ${texto}`);
    const llenar = async (selector, valor) => { await page.waitForSelector(selector, { visible: true }); await page.click(selector, { clickCount: 3 }); await page.type(selector, valor); await esperar(); };
    const captura = async nombre => { await esperar(); await page.screenshot({ path: path.join(salida, nombre), fullPage: false }); };
    const cerrar = async () => { await click('Cerrar', '[role="dialog"] button'); };
    const sinDesborde = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Desborde horizontal');

    await page.setViewport({ width: 1440, height: 1050 });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await contiene('Agentes IA de voz'); await contiene('6 voces'); await sinDesborde();
    assert.equal(await page.evaluate(() => document.fonts.check('14px Inter')), true);
    await captura('01-voces-escritorio.png'); comprobaciones.push('Biblioteca y marca con Inter local');

    await llenar('input[aria-label="Buscar voces"]', 'no existe esta voz');
    await contiene('No encontramos voces'); await click('Limpiar filtros'); await contiene('6 voces');
    await click('Filtros'); await click('Cualquier acento'); await click('Colombia'); await page.keyboard.press('Escape');
    await contiene('Acento: Colombia'); await contiene('3 voces'); await click('Limpiar todo');
    await click('Añadir Santiago a Mis voces'); await click('Mis voces3');
    await contiene('Sin agentes asignados');
    await click('Santiago'); await click('Asignar a agente', '[role="dialog"] button'); await click('Asignar voz', '[role="dialog"] button');
    await contiene('Santiago asignada a Clara'); comprobaciones.push('Buscar, filtrar, guardar y asignar voz');
    await captura('02-mis-voces-escritorio.png');

    await click('Campañas'); await contiene('4 campañas'); await contiene('Santiago');
    await captura('03-campanas-escritorio.png');
    await click('Primer contacto con leads', 'tr[role="button"],tr,[role="row"]');
    await contiene('Voz del agente: Santiago'); await click('Ver', '[role="dialog"] button', false);
    await click('Abrir', '[role="dialog"] button');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter(el => el.getClientRects().length).length), 0, 'Un portal de Campañas quedó abierto al cambiar a Voces');
    await contiene('Las voces de tu organización'); comprobaciones.push('La voz se hereda en campaña y las relaciones cierran portales');

    await click('Campañas'); await click('Nueva campaña');
    await click('Continuar', '[role="dialog"] button'); await contiene('Escribe un nombre');
    await llenar('[role="dialog"] input[placeholder="Ej. Seguimiento de propuestas de octubre"]', 'Campaña de revisión');
    await click('Continuar', '[role="dialog"] button'); await contiene('Voz: Santiago');
    await click('Continuar', '[role="dialog"] button');
    const leerInicio = () => page.evaluate(() => { const etiqueta = [...document.querySelectorAll('[role="dialog"] label')].find(el => el.textContent.startsWith('Fecha y hora de inicio')); const fecha = etiqueta && document.getElementById(etiqueta.htmlFor); const hora = document.querySelector('[role="dialog"] [aria-label^="Hora:"]'); return [fecha?.textContent.trim(), hora?.textContent.trim()]; });
    const inicio = await leerInicio(); assert(inicio[0] && inicio[1], 'Controles de fecha y hora de marca no disponibles');
    await click('Simular verificación RNE', '[role="dialog"] button');
    await click('Guardar borrador', '[role="dialog"] button'); await contiene('Política pendiente'); await contiene('Minutos pendientes');
    await click('Revisar programación', '[role="dialog"] button');
    assert.deepEqual(await leerInicio(), inicio, 'Se perdió la fecha elegida');
    await click('Continuar', '[role="dialog"] button');
    assert.equal(await page.$eval('[role="dialog"] button[title="Completa los requisitos simulados y la programación antes de continuar."]', el => el.disabled), true, 'Programó sin política y minutos');
    await click('Atrás', '[role="dialog"] button');
    await click('Simular política de datos disponible', '[role="dialog"] button'); await click('Simular minutos disponibles', '[role="dialog"] button');
    await captura('04-asistente-campana.png'); await click('Continuar', '[role="dialog"] button');
    await click('Programar campaña', '[role="dialog"] button'); await contiene('Programada'); await cerrar();
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('tbody tr')].filter(el => el.innerText.includes('Campaña de revisión')).length), 1, 'Duplicó el borrador');
    comprobaciones.push('Borrador conserva programación; tres requisitos; programación sin duplicados');

    await click('Seguimiento de propuestas', 'tr[role="button"],tr,[role="row"]'); await click('Pausar campaña', '[role="dialog"] button');
    await click('Pausar campaña', '[role="dialog"] button'); await contiene('En pausa');
    await click('Reanudar', '[role="dialog"] button'); await click('Reanudar campaña', '[role="dialog"] button'); await contiene('En marcha'); await cerrar();
    comprobaciones.push('Pausar y reanudar conserva avance');

    await click('Restablecer propuesta'); await click('Restablecer propuesta', '[role="dialog"] button');
    await contiene('6 voces'); await click('Mis voces2'); await contiene('Valentina');
    await click('Biblioteca'); await click('Clonar mi voz'); await click('Siguiente', '[role="dialog"] button');
    await contiene('Confirma que esta es tu voz'); await page.click('[role="dialog"] input[type="checkbox"]'); await click('Siguiente', '[role="dialog"] button');
    await contiene('Añade una muestra'); await cerrar(); comprobaciones.push('Restablecer y consentimiento antes de audio');

    await page.setViewport({ width: 390, height: 844 }); await page.reload({ waitUntil: 'networkidle0' }); await sinDesborde();
    await captura('05-voces-movil.png'); await click('Filtros'); await contiene('Filtrar voces'); await captura('06-filtros-movil.png'); await page.keyboard.press('Escape'); await esperar();
    await click('Campañas'); await sinDesborde(); await captura('07-campanas-movil.png');
    await click('Nueva campaña'); await sinDesborde(); await contiene('Paso 1 de 4'); await captura('08-asistente-movil.png'); await cerrar();
    await page.setViewport({ width: 375, height: 812 }); await sinDesborde();
    comprobaciones.push('Móvil 390 y 375: tarjetas, filtros y asistente sin desborde');

    await page.setViewport({ width: 1440, height: 1050 }); await page.reload({ waitUntil: 'networkidle0' });
    await page.evaluate(() => document.documentElement.classList.add('dark')); await captura('09-voces-oscuro.png');
    assert.deepEqual(errores, [], 'Errores de navegador'); assert.deepEqual(externos, [], 'Solicitudes externas');
    const resumen = { resultado: 'correcto', comprobaciones, errores, solicitudesExternas: externos.length, capturas: 9 };
    fs.writeFileSync(path.join(salida, 'verificacion.json'), JSON.stringify(resumen, null, 2));
    console.log(JSON.stringify(resumen));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
