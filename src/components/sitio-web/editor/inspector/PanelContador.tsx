'use client';

/**
 * «Contador regresivo» del editor nuevo (Estilo del sitio). Escribe las MISMAS columnas de
 * `website_settings` que el editor viejo (`countdown_*` y `checkout_show_countdown`) con
 * `onCambiarAjustes`: en legacy van en el lote de «Guardar y publicar»; en V2 son operación (D12) y
 * van a la fila del principal con el autoguardado. El lienzo las pinta en vivo (`goadmin:settings`)
 * en el encabezado, el carrito, el pago, la ficha de producto y la portada.
 */
import { useEffect, useId, useState } from 'react';
import { SelectKit, NumeroKit } from './controlesKit';
import { CampoFecha, ChipsOpcion, FormField, SegmentedControl } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { textoSobreAcento } from '@/lib/website/v2/tokensEstilo';
import { leerEstiloContador } from '@/lib/website/estiloContador';
import { PanelEstiloContador } from './PanelEstiloContador';
import { CampoHora } from '@/components/kit/CampoHora';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import {
  TITULO_POR_DEFECTO,
  UBICACIONES_CONTADOR,
  ZONAS_CONTADOR,
  finLocal,
  leerContador,
  partesFin,
  tiempoRestante,
} from './contadorLegacy';

const control = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg';

export function PanelContador({
  settings,
  onCambiarAjustes,
  colorPrimario,
  deshabilitado,
}: {
  settings: WebsiteSettings | null;
  onCambiarAjustes: (cambios: Partial<WebsiteSettings>) => void;
  colorPrimario?: string | null;
  deshabilitado?: boolean;
}) {
  const c = leerContador(settings as unknown as Record<string, unknown> | null);
  const cambiar = (cambios: Record<string, unknown>) => onCambiarAjustes(cambios as Partial<WebsiteSettings>);
  const { dia, hora } = partesFin(c.fin, c.zona);
  const sinFecha = c.modo === 'custom' && !dia;
  // Vista previa con el tiempo real que falta (misma regla que la tienda), al segundo.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const restante = tiempoRestante(c, ahora);
  const idMostrar = useId();
  const idDonde = useId();
  const fondoVista = colorPrimario || '#3B82F6';
  // Texto y dígitos en «texto sobre primario» (negro o blanco, el de más contraste), como la tienda.
  const textoVista = textoSobreAcento(fondoVista);
  const estiloCrudo = (settings as unknown as Record<string, unknown> | null)?.countdown_style;
  const conEstilo = leerEstiloContador(estiloCrudo) !== null;
  // «HH:MM:SS» (horas pueden pasar de 24) → segundos, para la vista previa con estilo.
  const segundos = restante ? restante.split(':').map(Number).reduce((a, n) => a * 60 + n, 0) : 0;
  const ubicacionesActivas = UBICACIONES_CONTADOR.filter((u) => c.ubicaciones[u.columna]).map((u) => u.columna);
  return (
    <section aria-label="Contador regresivo" className="mt-[14px] flex flex-col gap-[14px] px-1">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-medium text-fg">Contador regresivo</h3>
        <p className="text-[12px] leading-4 text-fg-muted">Una barra con la cuenta atrás de tu oferta. Usa el color principal del sitio.</p>
      </div>
      {!conEstilo && <div
        aria-hidden="true"
        data-testid="vista-contador"
        className={`flex flex-wrap items-center justify-center gap-2 rounded-lg px-3 py-2 text-center text-sm font-medium ${c.activo ? '' : 'opacity-50'}`}
        style={{ background: fondoVista, color: textoVista }}
      >
        <span>🔥 {c.titulo || TITULO_POR_DEFECTO}</span>
        <span className="font-mono font-bold">{restante ?? 'Terminado: no se muestra'}</span>
      </div>}
      <div className={`flex items-center justify-between gap-3 ${deshabilitado ? 'opacity-60' : ''}`}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <label htmlFor={idMostrar} className="text-sm font-medium text-fg">Mostrar contador</label>
          <span className="text-[12px] text-fg-muted">En las ubicaciones que elijas abajo</span>
        </div>
        <Switch id={idMostrar} checked={c.activo} disabled={deshabilitado} onCheckedChange={(v) => cambiar({ countdown_enabled: v })} className="shrink-0" />
      </div>
      <div className={`flex flex-col gap-[14px] ${c.activo ? '' : 'opacity-50'}`}>
        <FormField etiqueta="Texto">
          {(campo) => (
            <input
              id={campo.id}
              aria-describedby={campo['aria-describedby']}
              className={control}
              disabled={deshabilitado}
              value={c.titulo}
              placeholder={TITULO_POR_DEFECTO}
              maxLength={200}
              onChange={(e) => cambiar({ countdown_title: e.target.value })}
            />
          )}
        </FormField>
        <FormField etiqueta="Modo">
          {(campo) => (
            <SegmentedControl
              aria-labelledby={campo.idEtiqueta}
              tamano="sm"
              anchoCompleto
              deshabilitado={deshabilitado}
              valor={c.modo === 'custom' ? 'custom' : 'daily_reset'}
              opciones={MODOS}
              onValorChange={(v) => cambiar({ countdown_mode: v })}
            />
          )}
        </FormField>
        {c.modo === 'custom' ? (
          <div role="group" aria-label="Termina" className="flex flex-col gap-1.5 text-[12px] text-fg-secondary">Termina
            <div className="grid grid-cols-2 gap-2">
              <CampoFecha tamano="sm" valor={dia || null} disabled={deshabilitado} onValorChange={(d) => cambiar({ countdown_end_date: finLocal(d ?? '', hora) })} />
              <CampoHora tamano="sm" aria-label="Hora de fin" valor={hora || null} disabled={deshabilitado || !dia} onValorChange={(h) => cambiar({ countdown_end_date: finLocal(dia, h) })} />
            </div>
            {sinFecha && <span className="text-[12px] text-fg-secondary">Sin fecha de fin el contador no se muestra.</span>}
          </div>
        ) : (
          <label className="flex flex-col gap-1.5 text-[12px] text-fg-secondary">Hora de reinicio (0–23)
            <NumeroKit min={0} max={23} disabled={deshabilitado} value={c.horaReinicio} onChange={(e) => {
              const n = Number(e.target.value);
              cambiar({ countdown_reset_hour: Number.isInteger(n) && n >= 0 && n <= 23 ? n : 0 });
            }} />
          </label>
        )}
        <div role="group" aria-label="Zona horaria" className="flex flex-col gap-1.5 text-[12px] text-fg-secondary">Zona horaria
          <SelectKit aria-label="Zona horaria" disabled={deshabilitado} value={c.zona} onChange={(e) => cambiar({ countdown_timezone: e.target.value })}>
            {ZONAS_CONTADOR.some(([z]) => z === c.zona) ? null : <option value={c.zona}>{c.zona}</option>}
            {ZONAS_CONTADOR.map(([z, nombre]) => <option key={z} value={z}>{nombre}</option>)}
          </SelectKit>
        </div>
        <div className="flex flex-col gap-1.5 text-[12px] text-fg-secondary">
          <span id={idDonde}>Dónde se ve</span>
          <ChipsOpcion
            multiple
            aria-labelledby={idDonde}
            opciones={UBICACIONES_CONTADOR.map((u) => ({ valor: u.columna, etiqueta: u.etiqueta, deshabilitada: deshabilitado }))}
            valor={ubicacionesActivas}
            onValorChange={(sig) => {
              // Una sola columna por clic: la que cambió (mismo cambio que la casilla de antes).
              const u = UBICACIONES_CONTADOR.find((x) => sig.includes(x.columna) !== c.ubicaciones[x.columna]);
              if (u) cambiar({ [u.columna]: sig.includes(u.columna) });
            }}
          />
        </div>
        <div className="flex flex-col gap-[14px] border-t border-line pt-[14px]">
          <div className="flex flex-col gap-0.5">
            <h4 className="text-[13px] font-medium text-fg">Estilo</h4>
            <p className="text-[12px] leading-4 text-fg-muted">Un solo estilo para todas las ubicaciones; cada una solo cambia la forma (barra o tarjeta).</p>
          </div>
          <PanelEstiloContador
            valor={estiloCrudo}
            onCambiar={(estilo) => cambiar({ countdown_style: estilo })}
            primario={fondoVista}
            titulo={c.titulo || TITULO_POR_DEFECTO}
            segundos={segundos}
            columnaDisponible={!settings || 'countdown_style' in (settings as object)}
            deshabilitado={deshabilitado}
          />
        </div>
      </div>
    </section>
  );
}

const MODOS = [
  { valor: 'daily_reset', etiqueta: 'Se reinicia cada día' },
  { valor: 'custom', etiqueta: 'Hasta una fecha' },
] as const;
