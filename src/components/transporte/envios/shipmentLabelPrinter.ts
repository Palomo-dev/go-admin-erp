/**
 * Impresiones de Logística que no son el rótulo: la hoja de ruta del domiciliario.
 *
 * La guía (rótulo estándar, Figma «21 Logística» 3223:15627) ya no se genera aquí: la arman
 * `src/lib/logistica/rotuloEnvio.ts` (datos y textos), `src/components/logistica/rotulo/`
 * (`RotuloEnvio` para la vista previa y `/imprimir/guias`; `rasterRotulo` para la imagen de la
 * térmica) y el agente (`printShipmentGuide`). El recibo largo que vivía aquí —con productos,
 * precios, estado crudo, firmas y la marca GO Admin— se retiró el 2026-11-25.
 */
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';

export interface ShipmentGuideOrgInfo {
  name: string;
  nit?: string;
  tax_id?: string;
  address?: string;
  phone?: string;
}

// ── Hoja de ruta (Logística › Por despachar, Figma 2794:3311) ─────────────────

/** Una parada de la hoja de ruta, en el orden en que el domiciliario la recorre. */
export interface ParadaHojaRuta {
  numero: string;
  pedido?: string | null;
  cliente?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  barrio?: string | null;
  ciudad?: string | null;
  instrucciones?: string | null;
  /** Hora prometida ya formateada en la zona de la organización. */
  promesa?: string | null;
  /** Monto a cobrar en la puerta (0 si ya está pagado). */
  contraentrega?: number | null;
}

export interface OpcionesHojaRuta {
  titulo: string;
  /** Subtítulo ya formateado («Sede Centro · 23/11/2026 · Luisa Martínez»). */
  subtitulo?: string | null;
  orgInfo?: ShipmentGuideOrgInfo | null;
  /** Moneda base de la organización (nunca pesos fijos). */
  moneda?: ContextoMoneda;
  /** Textos de la tabla en el idioma de la persona (los pone quien llama). */
  textos: {
    parada: string;
    pedido: string;
    cliente: string;
    direccion: string;
    promesa: string;
    cobrar: string;
    firma: string;
    total: string;
    pagado: string;
  };
}

/** HTML de la hoja de ruta: una fila por parada, con lo que hay que cobrar y espacio para firmar. */
export function generateRouteSheetHTML(paradas: readonly ParadaHojaRuta[], opciones: OpcionesHojaRuta): string {
  const esc = (v: unknown) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const fmt = (v: number) => (opciones.moneda ? formatMoneda(v, opciones.moneda) : String(v));
  const total = paradas.reduce((s, p) => s + Math.round((Number(p.contraentrega) || 0) * 100), 0) / 100;
  const t = opciones.textos;
  const filas = paradas
    .map((p, i) => {
      const cobro = Number(p.contraentrega) || 0;
      const lugar = [p.direccion, p.barrio, p.ciudad].filter(Boolean).map(esc).join(' · ');
      return `<tr>
        <td class="n">${i + 1}</td>
        <td><strong>${esc(p.numero)}</strong>${p.pedido ? `<br><small>${esc(p.pedido)}</small>` : ''}</td>
        <td>${esc(p.cliente)}${p.telefono ? `<br><small>${esc(p.telefono)}</small>` : ''}</td>
        <td>${lugar}${p.instrucciones ? `<br><small>${esc(p.instrucciones)}</small>` : ''}</td>
        <td>${esc(p.promesa ?? '')}</td>
        <td class="m">${cobro > 0 ? esc(fmt(cobro)) : esc(t.pagado)}</td>
        <td class="f"></td>
      </tr>`;
    })
    .join('');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(opciones.titulo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 16px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 6px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-size: 11px; }
  td.n { width: 28px; text-align: center; }
  td.m { text-align: right; white-space: nowrap; }
  td.f { width: 120px; }
  tfoot td { font-weight: bold; }
  small { color: #555; }
  @media print { body { margin: 8mm; } }
</style></head>
<body>
  ${opciones.orgInfo?.name ? `<div class="sub">${esc(opciones.orgInfo.name)}${opciones.orgInfo.nit || opciones.orgInfo.tax_id ? ` · ${esc(opciones.orgInfo.nit || opciones.orgInfo.tax_id)}` : ''}</div>` : ''}
  <h1>${esc(opciones.titulo)}</h1>
  ${opciones.subtitulo ? `<div class="sub">${esc(opciones.subtitulo)}</div>` : ''}
  <table>
    <thead><tr><th>${esc(t.parada)}</th><th>${esc(t.pedido)}</th><th>${esc(t.cliente)}</th><th>${esc(t.direccion)}</th><th>${esc(t.promesa)}</th><th>${esc(t.cobrar)}</th><th>${esc(t.firma)}</th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td colspan="5">${esc(t.total)}</td><td class="m">${esc(fmt(total))}</td><td></td></tr></tfoot>
  </table>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
</body></html>`;
}

/** Abre la hoja de ruta para imprimir (ventana síncrona, para no perder el gesto del usuario). */
export function printRouteSheet(paradas: readonly ParadaHojaRuta[], opciones: OpcionesHojaRuta): boolean {
  if (paradas.length === 0) return false;
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) return false;
  printWindow.document.write(generateRouteSheetHTML(paradas, opciones));
  printWindow.document.close();
  return true;
}
