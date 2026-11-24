/**
 * Planilla de despacho (Figma «23 Transporte» › 6, 2877:4521): la hoja carta que porta el
 * conductor. Viaje, vehículo, conductor, vencimientos, pasajeros con documento enmascarado,
 * total, excepción autorizada (si la hubo) y firmas. Puro: recibe todo ya formateado en el idioma
 * y la zona horaria de quien imprime; el HTML escapa cada valor.
 *
 * Mismo estilo de impresión que la hoja de ruta de Logística (`generateRouteSheetHTML`): ventana
 * propia, `window.print()` al cargar.
 */
import { enmascararDocumento } from './despachos';

export interface DatosPlanilla {
  numero: string;
  organizacion?: { nombre: string; nit?: string | null } | null;
  viaje: { codigo: string; ruta: string; fecha: string; salida: string; llegada?: string | null };
  vehiculo: { placa: string; tipo: string; documentos: readonly { nombre: string; vence: string }[] } | null;
  conductor: { nombre: string; documento?: string | null; licencia?: string | null; licenciaVence?: string | null } | null;
  pasajeros: readonly { nombre: string; documento?: string | null; puesto?: string | null; valor: string }[];
  total: string;
  despachado: { en: string; por?: string | null };
  excepcion?: { motivo: string; por?: string | null; en?: string | null } | null;
  textos: {
    titulo: string;
    viaje: string;
    ruta: string;
    fecha: string;
    salida: string;
    llegada: string;
    vehiculo: string;
    conductor: string;
    documento: string;
    licencia: string;
    vence: string;
    pasajeros: string;
    puesto: string;
    nombre: string;
    valor: string;
    total: string;
    sinPasajeros: string;
    excepcion: string;
    autorizo: string;
    despachado: string;
    firmaConductor: string;
    firmaDespachador: string;
  };
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function generarPlanillaHTML(d: DatosPlanilla): string {
  const t = d.textos;
  const filas = d.pasajeros.length
    ? d.pasajeros
        .map(
          (p, i) => `<tr><td class="n">${i + 1}</td><td>${esc(p.puesto ?? '')}</td><td>${esc(p.nombre)}</td><td>${esc(enmascararDocumento(p.documento))}</td><td class="m">${esc(p.valor)}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="5" class="vacio">${esc(t.sinPasajeros)}</td></tr>`;
  const docs = d.vehiculo?.documentos.length
    ? `<ul>${d.vehiculo.documentos.map((x) => `<li>${esc(x.nombre)}: ${esc(t.vence)} ${esc(x.vence)}</li>`).join('')}</ul>`
    : '';
  const excepcion = d.excepcion
    ? `<div class="exc"><strong>${esc(t.excepcion)}</strong><br>${esc(d.excepcion.motivo)}<br><small>${esc(t.autorizo)}: ${esc(d.excepcion.por ?? '—')}${d.excepcion.en ? ` · ${esc(d.excepcion.en)}` : ''}</small></div>`
    : '';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(t.titulo)} ${esc(d.numero)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 16px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { color: #555; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 12px; }
  .grid div { border: 1px solid #ddd; padding: 8px; border-radius: 4px; }
  .grid ul { margin: 4px 0 0; padding-left: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-size: 11px; }
  td.n { width: 28px; text-align: center; }
  td.m { text-align: right; white-space: nowrap; }
  td.vacio { text-align: center; color: #555; }
  tfoot td { font-weight: bold; }
  .exc { border: 1px solid #b45309; background: #fffbeb; padding: 8px; margin: 12px 0; border-radius: 4px; }
  .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 48px; }
  .firmas div { border-top: 1px solid #111; padding-top: 4px; text-align: center; }
  small { color: #555; }
  @page { size: letter; }
  @media print { body { margin: 10mm; } }
</style></head>
<body>
  ${d.organizacion?.nombre ? `<div class="sub">${esc(d.organizacion.nombre)}${d.organizacion.nit ? ` · ${esc(d.organizacion.nit)}` : ''}</div>` : ''}
  <h1>${esc(t.titulo)} ${esc(d.numero)}</h1>
  <div class="sub">${esc(t.despachado)}: ${esc(d.despachado.en)}${d.despachado.por ? ` · ${esc(d.despachado.por)}` : ''}</div>
  <div class="grid">
    <div><strong>${esc(t.viaje)}</strong> ${esc(d.viaje.codigo)}<br>${esc(t.ruta)}: ${esc(d.viaje.ruta)}<br>${esc(t.fecha)}: ${esc(d.viaje.fecha)} · ${esc(t.salida)} ${esc(d.viaje.salida)}${d.viaje.llegada ? ` · ${esc(t.llegada)} ${esc(d.viaje.llegada)}` : ''}</div>
    <div><strong>${esc(t.vehiculo)}</strong> ${esc(d.vehiculo?.placa ?? '—')}${d.vehiculo ? ` · ${esc(d.vehiculo.tipo)}` : ''}${docs}</div>
    <div><strong>${esc(t.conductor)}</strong> ${esc(d.conductor?.nombre || '—')}${d.conductor?.documento ? `<br>${esc(t.documento)}: ${esc(enmascararDocumento(d.conductor.documento))}` : ''}${d.conductor?.licencia ? `<br>${esc(t.licencia)}: ${esc(d.conductor.licencia)}${d.conductor.licenciaVence ? ` · ${esc(t.vence)} ${esc(d.conductor.licenciaVence)}` : ''}` : ''}</div>
  </div>
  ${excepcion}
  <h2 style="font-size:14px;margin:12px 0 6px">${esc(t.pasajeros)} (${d.pasajeros.length})</h2>
  <table>
    <thead><tr><th>#</th><th>${esc(t.puesto)}</th><th>${esc(t.nombre)}</th><th>${esc(t.documento)}</th><th>${esc(t.valor)}</th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td colspan="4">${esc(t.total)}</td><td class="m">${esc(d.total)}</td></tr></tfoot>
  </table>
  <div class="firmas"><div>${esc(t.firmaConductor)}</div><div>${esc(t.firmaDespachador)}</div></div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
</body></html>`;
}

/** Abre la planilla para imprimir (ventana síncrona, para no perder el gesto del usuario). */
export function abrirVentanaPlanilla(): Window | null {
  return typeof window === 'undefined' ? null : window.open('', '_blank', 'width=900,height=1000');
}

export function escribirPlanilla(ventana: Window, html: string): void {
  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
}
