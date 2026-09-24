/**
 * Plantilla de papel (carta por defecto, A4 como variante) del motor único.
 *
 * Una sola maqueta para todos los tipos: los bloques de DOCUMENTOS-PDF.md §3
 * (identidad, datos fiscales, sucursal, título y numeración, contraparte,
 * metadatos, líneas, tablas, totales, notas, términos, firma, pie legal y
 * paginación) se pintan si el payload los trae. Lo que varía por tipo lo
 * decide el cargador, no la plantilla.
 *
 * Reglas de la plantilla:
 * - Todo texto pasa por `escaparHtml` (también los traducidos: sus variables
 *   pueden venir de la base).
 * - Nada remoto: el logo llega como `data:` URI y el QR es un `<svg>` local.
 *   Puppeteer, además, bloquea toda petición de red al renderizar.
 * - `@page` con márgenes 14/12/18 mm, «Página X de Y» y la identificación del
 *   documento en las cajas de margen (Chrome ≥ 131), cabecera de tabla
 *   repetida y filas que no se parten.
 */

import { escaparHtml as e, dataUriImagenSeguro } from '../escape';
import { crearFormateador, type Formateador } from '../formato';
import { qrSvg } from '../qr';
import { temaDocumento, type TemaDocumento } from '../tema';
import type { Traductor } from '../textos';
import type { Campo, DocumentoPayload, FilaTotal, LineaDocumento, SeccionTabla } from '../tipos';
import { claseTono, htmlDeValor, nitConDv, textoDeCelda, textoDeTotal, titulo } from './comun';

export interface OpcionesCarta {
  papel: 'carta' | 'a4';
  /** Agrega un script (con nonce) que abre el diálogo de impresión al cargar. */
  imprimir?: boolean;
  /** Nonce del CSP de la respuesta HTML. Obligatorio si `imprimir`. */
  nonce?: string;
}

/** Cadena CSS segura para `content:` (sin comillas, barras ni `<` que cierre el `<style>`). */
function cadenaCss(texto: string): string {
  const limpio = texto
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/</g, '\\3C ')
    .replace(/>/g, '\\3E ');
  return `"${limpio}"`;
}

function estilos(tema: TemaDocumento, doc: DocumentoPayload, t: Traductor, papel: 'carta' | 'a4'): string {
  const identificacion = [titulo(doc, t), doc.numero ?? ''].filter(Boolean).join(' ');
  return `
@page {
  size: ${papel === 'a4' ? 'A4' : 'letter'};
  margin: 14mm 12mm 18mm;
  @bottom-left { content: ${cadenaCss(identificacion)}; font: 400 7.5pt Inter, 'Segoe UI', Arial, sans-serif; color: ${tema.textoTenue}; }
  @bottom-right { content: ${cadenaCss(t('paginacion.pagina'))} " " counter(page) " " ${cadenaCss(t('paginacion.de'))} " " counter(pages); font: 400 7.5pt Inter, 'Segoe UI', Arial, sans-serif; color: ${tema.textoTenue}; }
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Inter, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 9pt; line-height: 1.4; color: ${tema.texto}; background: #fff; }
.hoja { position: relative; z-index: 1; }
@media screen { body { background: ${tema.fondoSuave}; } .hoja { max-width: 216mm; margin: 16px auto; background: #fff; padding: 14mm 12mm 18mm; box-shadow: 0 1px 3px rgba(15,23,42,.12); } }
.marca-agua { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; }
.marca-agua span { transform: rotate(-18deg); font-size: 88pt; font-weight: 700; letter-spacing: 6px; opacity: .10; }
.marca-agua.tono-peligro span { color: ${tema.peligro}; } .marca-agua.tono-exito span { color: ${tema.exito}; } .marca-agua.tono-neutro span { color: ${tema.textoSecundario}; }
.cabecera { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 10px; border-bottom: 2px solid ${tema.acento}; margin-bottom: 12px; }
.identidad { flex: 1; min-width: 0; }
.logo { max-height: 56px; max-width: 200px; object-fit: contain; display: block; margin-bottom: 6px; }
.emisor-nombre { font-size: 14pt; font-weight: 700; color: ${tema.acento}; }
.emisor-razon { font-size: 8pt; color: ${tema.textoSecundario}; font-weight: 500; }
.emisor-dato { font-size: 8pt; color: ${tema.textoSecundario}; }
.caja-doc { width: 250px; flex-shrink: 0; text-align: right; border: 1px solid ${tema.borde}; border-radius: 8px; padding: 10px 12px; background: ${doc.sobrio ? tema.fondoSuave : '#fff'}; }
.caja-doc h1 { font-size: 13pt; line-height: 1.2; color: ${tema.texto}; }
.caja-doc .numero { font-size: 11pt; font-weight: 700; color: ${tema.acento}; margin: 2px 0 6px; word-break: break-all; }
.etiqueta-tercero { display: inline-block; font-size: 7pt; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: ${tema.aviso}; background: ${tema.avisoSuave}; border: 1px solid ${tema.aviso}; border-radius: 4px; padding: 1px 6px; margin-bottom: 6px; }
.badge { display: inline-block; font-size: 7.5pt; font-weight: 600; border-radius: 999px; padding: 2px 10px; }
.tono-neutro.badge { background: ${tema.fondoSuave}; color: ${tema.textoSecundario}; border: 1px solid ${tema.borde}; }
.tono-marca.badge { background: ${tema.acentoSuave}; color: ${tema.acento}; }
.tono-exito.badge { background: ${tema.exitoSuave}; color: ${tema.exito}; }
.tono-aviso.badge { background: ${tema.avisoSuave}; color: ${tema.aviso}; }
.tono-peligro.badge { background: ${tema.peligroSuave}; color: ${tema.peligro}; }
.tono-info.badge { background: ${tema.infoSuave}; color: ${tema.info}; }
.qr { margin-top: 8px; display: inline-block; text-align: center; }
.qr svg { width: 84px; height: 84px; display: block; margin-left: auto; }
.qr small { display: block; font-size: 6.5pt; color: ${tema.textoTenue}; max-width: 110px; margin-left: auto; }
.banda { border-radius: 6px; padding: 7px 12px; margin-bottom: 10px; font-weight: 600; font-size: 8.5pt; border: 1px solid; }
.banda.tono-peligro { color: ${tema.peligro}; background: ${tema.peligroSuave}; border-color: ${tema.peligro}; }
.banda.tono-aviso { color: ${tema.aviso}; background: ${tema.avisoSuave}; border-color: ${tema.aviso}; }
.banda.tono-exito { color: ${tema.exito}; background: ${tema.exitoSuave}; border-color: ${tema.exito}; }
.banda.tono-neutro, .banda.tono-marca, .banda.tono-info { color: ${tema.textoSecundario}; background: ${tema.fondoSuave}; border-color: ${tema.bordeFuerte}; }
.partes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
.parte { border: 1px solid ${tema.borde}; border-radius: 8px; padding: 8px 10px; }
.rotulo { font-size: 6.8pt; font-weight: 600; letter-spacing: .4px; text-transform: uppercase; color: ${tema.textoTenue}; margin-bottom: 3px; }
.parte .nombre { font-weight: 600; font-size: 10pt; }
.parte p { font-size: 8pt; color: ${tema.textoSecundario}; }
.referencia { border-left: 3px solid ${tema.acento}; background: ${tema.acentoSuave}; border-radius: 4px; padding: 8px 10px; margin-bottom: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 12px; }
.campos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 12px; padding: 8px 10px; background: ${tema.fondoSuave}; border-radius: 8px; margin-bottom: 12px; }
.campo .valor { font-weight: 500; font-size: 8.5pt; word-break: break-word; }
.resumen { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.tarjeta { border: 1px solid ${tema.borde}; border-radius: 8px; padding: 8px 10px; }
.tarjeta .valor { font-size: 11pt; font-weight: 700; }
h2 { font-size: 9pt; font-weight: 700; color: ${tema.texto}; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: .4px; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th { background: ${tema.acento}; color: #fff; font-size: 7pt; font-weight: 600; text-transform: uppercase; letter-spacing: .3px; padding: 6px 6px; text-align: left; }
td { padding: 6px; border-bottom: 1px solid ${tema.borde}; font-size: 8.5pt; vertical-align: top; }
.der { text-align: right; } .centro { text-align: center; }
td.num, th.num { text-align: right; white-space: nowrap; }
tfoot td { font-weight: 700; border-top: 2px solid ${tema.bordeFuerte}; }
.detalle { display: block; font-size: 7pt; color: ${tema.textoTenue}; }
.codigo { font-size: 7pt; color: ${tema.textoTenue}; }
.chip { display: inline-block; font-size: 7pt; border: 1px solid ${tema.borde}; border-radius: 4px; padding: 0 4px; white-space: nowrap; }
.descuento { color: ${tema.peligro}; }
.cierre { display: flex; gap: 16px; margin-top: 12px; align-items: flex-start; break-inside: avoid; }
.cierre .izquierda { flex: 1; min-width: 0; }
.totales { width: 280px; flex-shrink: 0; }
.totales .fila { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid ${tema.borde}; font-size: 8.5pt; }
.totales .fila.total { font-size: 11pt; font-weight: 700; border-top: 2px solid ${tema.acento}; border-bottom: none; padding-top: 6px; }
.totales .fila.descuento span:last-child { color: ${tema.peligro}; }
.totales .fila.saldo { color: ${tema.peligro}; font-weight: 700; }
.totales .fila.pagado { color: ${tema.exito}; font-weight: 600; }
.totales .fila.informativo { color: ${tema.textoSecundario}; font-style: italic; }
.nota { border: 1px solid ${tema.borde}; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; white-space: pre-wrap; font-size: 8pt; }
.firmas { display: flex; gap: 40px; margin-top: 28px; break-inside: avoid; }
.firma { flex: 1; }
.firma .linea { border-top: 1px solid ${tema.texto}; padding-top: 4px; font-size: 7.5pt; color: ${tema.textoSecundario}; }
.firma .datos { font-size: 7pt; color: ${tema.textoTenue}; margin-top: 2px; }
.pie-legal { margin-top: 16px; padding-top: 8px; border-top: 1px solid ${tema.borde}; font-size: 7pt; color: ${tema.textoSecundario}; break-inside: avoid; }
.pie-legal p { margin-bottom: 3px; }
.pie-legal .codigo-unico { font-family: 'Consolas', 'Courier New', monospace; word-break: break-all; }
.generado { font-size: 6.5pt; color: ${tema.textoTenue}; margin-top: 4px; }
`;
}

function campoHtml(campo: Campo, f: Formateador, t: Traductor): string {
  return `<div class="campo"><div class="rotulo">${e(t(`campos.${campo.clave}`))}</div><div class="valor">${htmlDeValor(campo.valor, f, t) || '—'}</div></div>`;
}

function cabecera(doc: DocumentoPayload, f: Formateador, t: Traductor): string {
  const em = doc.emisor;
  const logo = dataUriImagenSeguro(em.logoDataUri);
  const nit = nitConDv(em.nit, em.dv);
  const ubicacion = [em.direccion, em.ciudad].filter(Boolean).join(' · ');
  const contacto = [em.telefono, em.email, em.web].filter(Boolean).join(' · ');
  const razon = em.razonSocial && em.razonSocial.trim() !== em.nombre.trim() ? em.razonSocial : null;
  const qr = doc.pieLegal.qr
    ? `<div class="qr">${qrSvg(doc.pieLegal.qr.contenido, { titulo: t(`qr.${doc.pieLegal.qr.leyenda}`) })}<small>${e(t(`qr.${doc.pieLegal.qr.leyenda}`))}</small></div>`
    : '';
  return `
<header class="cabecera">
  <div class="identidad">
    ${logo ? `<img class="logo" src="${e(logo)}" alt="${e(em.nombre)}" />` : ''}
    <div class="emisor-nombre">${e(em.nombre)}</div>
    ${razon ? `<div class="emisor-razon">${e(razon)}</div>` : ''}
    ${nit ? `<div class="emisor-dato">${e(t('emisor.nit', { nit }))}</div>` : ''}
    ${ubicacion ? `<div class="emisor-dato">${e(ubicacion)}</div>` : ''}
    ${contacto ? `<div class="emisor-dato">${e(contacto)}</div>` : ''}
    ${em.actividadEconomica ? `<div class="emisor-dato">${e(t('emisor.actividad', { codigo: em.actividadEconomica }))}</div>` : ''}
    ${em.responsabilidades.length > 0 ? `<div class="emisor-dato">${e(t('emisor.responsabilidades', { lista: em.responsabilidades.join(', ') }))}</div>` : ''}
  </div>
  <div class="caja-doc">
    ${doc.sobrio ? `<div class="etiqueta-tercero">${e(t('bandas.documentoTercero'))}</div>` : ''}
    <h1>${e(titulo(doc, t))}</h1>
    <div class="numero">${e(doc.numero ?? t('sinNumero'))}</div>
    ${doc.estado ? `<span class="badge ${claseTono(doc.estado.tono)}">${e(t(`estados.${doc.estado.codigo}`))}</span>` : ''}
    ${qr}
  </div>
</header>`;
}

function partes(doc: DocumentoPayload, t: Traductor): string {
  const bloques: string[] = [];
  if (doc.sucursal) {
    const s = doc.sucursal;
    bloques.push(`<div class="parte"><div class="rotulo">${e(t('partes.sucursal'))}</div><div class="nombre">${e(s.nombre)}</div>
      ${[s.direccion, s.ciudad].filter(Boolean).length ? `<p>${e([s.direccion, s.ciudad].filter(Boolean).join(' · '))}</p>` : ''}
      ${s.telefono ? `<p>${e(t('partes.telefono', { telefono: s.telefono }))}</p>` : ''}</div>`);
  }
  if (doc.contraparte) {
    const c = doc.contraparte;
    const documento = c.numeroDocumento
      ? [c.tipoDocumento ? c.tipoDocumento.toUpperCase() : null, nitConDv(c.numeroDocumento, c.dv)].filter(Boolean).join(' ')
      : null;
    bloques.push(`<div class="parte"><div class="rotulo">${e(t(`partes.${c.rol}`))}</div><div class="nombre">${e(c.nombre)}</div>
      ${documento ? `<p>${e(documento)}</p>` : ''}
      ${[c.direccion, c.ciudad].filter(Boolean).length ? `<p>${e([c.direccion, c.ciudad].filter(Boolean).join(' · '))}</p>` : ''}
      ${[c.telefono, c.email].filter(Boolean).length ? `<p>${e([c.telefono, c.email].filter(Boolean).join(' · '))}</p>` : ''}
      ${c.responsabilidades.length > 0 ? `<p>${e(t('emisor.responsabilidades', { lista: c.responsabilidades.join(', ') }))}</p>` : ''}</div>`);
  }
  return bloques.length > 0 ? `<section class="partes">${bloques.join('')}</section>` : '';
}

function tablaLineas(lineas: LineaDocumento[], f: Formateador, t: Traductor): string {
  const filas = lineas
    .map((l, i) => {
      const impuesto = l.impuesto && (l.impuesto.tasa ?? 0) > 0
        ? `<span class="chip">${e([l.impuesto.nombre ?? t('lineas.impuesto'), `${f.numero(l.impuesto.tasa, 2)} %`].join(' '))}${l.impuesto.incluido ? ` ${e(t('lineas.incluido'))}` : ''}</span>`
        : '—';
      return `<tr>
  <td class="centro">${i + 1}</td>
  <td>${l.codigo ? `<span class="codigo">${e(l.codigo)}</span><br/>` : ''}${e(l.descripcion)}
    ${l.nota ? `<span class="detalle">${e(l.nota)}</span>` : ''}
    ${l.seriales.length > 0 ? `<span class="detalle">${e(t('lineas.seriales', { lista: l.seriales.join(', ') }))}</span>` : ''}</td>
  <td class="num">${e(f.numero(l.cantidad))}</td>
  <td class="num">${e(f.dinero(l.precioUnitario))}</td>
  <td class="num">${l.descuento > 0 ? `<span class="descuento">- ${e(f.dinero(l.descuento))}</span>` : '—'}</td>
  <td>${impuesto}</td>
  <td class="num">${e(f.dinero(l.total))}</td>
</tr>`;
    })
    .join('');
  return `<h2>${e(t('secciones.detalle'))}</h2>
<table>
  <colgroup><col style="width:5%"/><col style="width:36%"/><col style="width:8%"/><col style="width:13%"/><col style="width:11%"/><col style="width:12%"/><col style="width:15%"/></colgroup>
  <thead><tr><th class="centro">#</th><th>${e(t('columnas.descripcion'))}</th><th class="num">${e(t('columnas.cantidad'))}</th><th class="num">${e(t('columnas.precioUnitario'))}</th><th class="num">${e(t('columnas.descuento'))}</th><th>${e(t('columnas.impuesto'))}</th><th class="num">${e(t('columnas.valor'))}</th></tr></thead>
  <tbody>${filas || `<tr><td colspan="7" class="centro">${e(t('vacios.lineas'))}</td></tr>`}</tbody>
</table>`;
}

function claseColumna(alinear: string | undefined, tipo: string): string {
  if (alinear === 'derecha' || (!alinear && (tipo === 'dinero' || tipo === 'numero'))) return 'num';
  if (alinear === 'centro') return 'centro';
  return '';
}

function tablaSeccion(s: SeccionTabla, f: Formateador, t: Traductor): string {
  if (s.filas.length === 0 && !s.vacio) return '';
  const cabeza = s.columnas.map((c) => `<th class="${claseColumna(c.alinear, c.tipo)}">${e(t(`columnas.${c.clave}`))}</th>`).join('');
  const cuerpo = s.filas.length > 0
    ? s.filas.map((fila) => `<tr>${s.columnas.map((c, i) => `<td class="${claseColumna(c.alinear, c.tipo)}">${e(textoDeCelda(c, fila[i] ?? null, f, t))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${s.columnas.length}" class="centro">${e(t(`vacios.${s.vacio}`))}</td></tr>`;
  const pie = s.pie ? `<tfoot><tr>${s.columnas.map((c, i) => `<td class="${claseColumna(c.alinear, c.tipo)}">${e(textoDeCelda(c, s.pie?.[i] ?? null, f, t))}</td>`).join('')}</tr></tfoot>` : '';
  return `<h2>${e(t(`secciones.${s.titulo}`))}</h2><table><thead><tr>${cabeza}</tr></thead><tbody>${cuerpo}</tbody>${pie}</table>`;
}

function totalesHtml(totales: FilaTotal[], f: Formateador, t: Traductor): string {
  if (totales.length === 0) return '';
  return `<div class="totales">${totales
    .map((fila) => `<div class="fila ${fila.estilo ?? 'normal'}"><span>${e(t(`totales.${fila.clave}`, fila.vars))}</span><span>${e(textoDeTotal(fila, f))}</span></div>`)
    .join('')}</div>`;
}

function firmasHtml(doc: DocumentoPayload, t: Traductor): string {
  if (!doc.firma) return '';
  const cajas: string[] = [];
  const caja = (rotulo: string, datos: string) =>
    `<div class="firma"><div class="linea">${e(rotulo)}</div><div class="datos">${e(datos)}</div></div>`;
  switch (doc.firma) {
    case 'recibido':
      cajas.push(caja(t('firmas.recibido'), t('firmas.datosRecibe')));
      break;
    case 'aceptacion':
      cajas.push(caja(t('firmas.aceptacion'), t('firmas.datosAcepta')));
      break;
    case 'cajeroSupervisor':
      cajas.push(caja(t('firmas.cajero'), t('firmas.datosNombre')), caja(t('firmas.supervisor'), t('firmas.datosNombre')));
      break;
    case 'entregaRecibe':
      cajas.push(caja(t('firmas.entrega'), t('firmas.datosNombre')), caja(t('firmas.recibe'), t('firmas.datosRecibe')));
      break;
  }
  return `<section class="firmas">${cajas.join('')}</section>`;
}

function pieLegal(doc: DocumentoPayload, f: Formateador, t: Traductor): string {
  const p = doc.pieLegal;
  const partesPie: string[] = [];
  if (p.resolucion) {
    const r = p.resolucion;
    partesPie.push(`<p>${e(t('legal.resolucion', {
      numero: r.numero,
      fecha: f.fecha(r.fecha) || '—',
      prefijo: r.prefijo ?? '',
      desde: r.desde ?? '—',
      hasta: r.hasta ?? '—',
      vigencia: f.fecha(r.vigenteHasta) || '—',
    }))}</p>`);
  }
  if (p.codigoUnico) {
    partesPie.push(`<p><strong>${e(t(`legal.${p.codigoUnico.clave}`))}:</strong> <span class="codigo-unico">${e(p.codigoUnico.valor)}</span></p>`);
  }
  for (const texto of p.textos) partesPie.push(`<p>${e(texto)}</p>`);
  partesPie.push(`<p class="generado">${e(t('legal.generado', { fecha: f.instanteHora(doc.generadoEn) }))}</p>`);
  return `<footer class="pie-legal">${partesPie.join('')}</footer>`;
}

/** HTML completo de un documento en carta o A4. */
export function renderizarCarta(doc: DocumentoPayload, t: Traductor, opciones: OpcionesCarta): string {
  const f = crearFormateador({ moneda: doc.moneda, zonaHoraria: doc.zonaHoraria, idioma: doc.idioma });
  const tema = temaDocumento(doc.emisor.colorPrimario, doc.sobrio);
  const tituloDoc = [titulo(doc, t), doc.numero].filter(Boolean).join(' ');
  const marca = doc.marcaAgua
    ? `<div class="marca-agua ${claseTono(doc.marcaAgua === 'anulada' ? 'peligro' : doc.marcaAgua === 'pagada' ? 'exito' : 'neutro')}"><span>${e(t(`marcas.${doc.marcaAgua}`))}</span></div>`
    : '';
  const bandas = doc.bandas.map((b) => `<div class="banda ${claseTono(b.tono)}">${e(t(`bandas.${b.clave}`, b.vars))}</div>`).join('');
  const referencia = doc.referencia.length > 0 ? `<section class="referencia">${doc.referencia.map((c) => campoHtml(c, f, t)).join('')}</section>` : '';
  const metadatos = doc.metadatos.length > 0 ? `<section class="campos">${doc.metadatos.map((c) => campoHtml(c, f, t)).join('')}</section>` : '';
  const resumen = doc.resumen.length > 0
    ? `<section class="resumen">${doc.resumen.map((c) => `<div class="tarjeta"><div class="rotulo">${e(t(`campos.${c.clave}`))}</div><div class="valor">${htmlDeValor(c.valor, f, t) || '—'}</div></div>`).join('')}</section>`
    : '';
  const lineas = doc.lineas ? tablaLineas(doc.lineas, f, t) : '';
  const secciones = doc.secciones.map((s) => tablaSeccion(s, f, t)).join('');
  const notas = [
    doc.notas ? `<div class="rotulo">${e(t('secciones.notas'))}</div><div class="nota">${e(doc.notas)}</div>` : '',
    doc.terminos ? `<div class="rotulo">${e(t('secciones.terminos'))}</div><div class="nota">${e(doc.terminos)}</div>` : '',
  ].join('');
  const cierre = notas || doc.totales.length > 0
    ? `<section class="cierre"><div class="izquierda">${notas}</div>${totalesHtml(doc.totales, f, t)}</section>`
    : '';
  const script = opciones.imprimir && opciones.nonce
    ? `<script nonce="${e(opciones.nonce)}">window.addEventListener('load',function(){setTimeout(function(){window.print();},250);});</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="${e(doc.idioma)}">
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex, nofollow" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${e(tituloDoc)}</title>
<style>${estilos(tema, doc, t, opciones.papel)}</style>
${script}
</head>
<body>
${marca}
<main class="hoja">
${cabecera(doc, f, t)}
${bandas}
${partes(doc, t)}
${referencia}
${metadatos}
${resumen}
${lineas}
${secciones}
${cierre}
${firmasHtml(doc, t)}
${pieLegal(doc, f, t)}
</main>
</body>
</html>`;
}
