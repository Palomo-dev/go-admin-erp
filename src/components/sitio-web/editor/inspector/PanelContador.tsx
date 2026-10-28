'use client';

/**
 * «Contador regresivo» del editor nuevo (Estilo del sitio). Escribe las MISMAS columnas de
 * `website_settings` que el editor viejo (`countdown_*` y `checkout_show_countdown`) con
 * `onCambiarAjustes`: en legacy van en el lote de «Guardar y publicar»; en V2 son operación (D12) y
 * van a la fila del principal con el autoguardado. El lienzo las pinta en vivo (`goadmin:settings`)
 * en el encabezado, el carrito, el pago, la ficha de producto y la portada.
 */
import { SelectKit, NumeroKit, CasillaKit } from './controlesKit';
import { CampoFecha } from '@/components/kit';
import { CampoHora } from '@/components/kit/CampoHora';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import {
  TITULO_POR_DEFECTO,
  UBICACIONES_CONTADOR,
  ZONAS_CONTADOR,
  finLocal,
  leerContador,
  partesFin,
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
  return (
    <section aria-label="Contador regresivo" className="mt-4 flex flex-col gap-3 border-t border-line px-1 pt-3">
      <div>
        <h3 className="text-sm font-semibold text-fg">Contador regresivo</h3>
        <p className="text-[12px] text-fg-secondary">Una barra con la cuenta atrás de tu oferta. Usa el color principal del sitio.</p>
      </div>
      <div
        aria-hidden="true"
        className={`rounded-lg px-3 py-2 text-center text-sm font-medium text-white ${c.activo ? '' : 'opacity-50'}`}
        style={{ background: colorPrimario || '#3B82F6' }}
      >
        <span>🔥 {c.titulo || TITULO_POR_DEFECTO}</span>
        <span className="ml-2 font-mono font-bold">00:10:00</span>
      </div>
      <CasillaKit titulo="Mostrar contador" disabled={deshabilitado} checked={c.activo} onChange={(e) => cambiar({ countdown_enabled: e.target.checked })} />
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Texto
        <input
          className={control}
          disabled={deshabilitado}
          value={c.titulo}
          placeholder={TITULO_POR_DEFECTO}
          maxLength={200}
          onChange={(e) => cambiar({ countdown_title: e.target.value })}
        />
      </label>
      <div role="group" aria-label="Modo" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Modo
        <SelectKit aria-label="Modo" disabled={deshabilitado} value={c.modo} onChange={(e) => cambiar({ countdown_mode: e.target.value })}>
          <option value="daily_reset">Se reinicia cada día</option>
          <option value="custom">Hasta una fecha</option>
        </SelectKit>
      </div>
      {c.modo === 'custom' ? (
        <div role="group" aria-label="Termina" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Termina
          <div className="grid grid-cols-2 gap-2">
            <CampoFecha tamano="sm" valor={dia || null} disabled={deshabilitado} onValorChange={(d) => cambiar({ countdown_end_date: finLocal(d ?? '', hora) })} />
            <CampoHora tamano="sm" aria-label="Hora de fin" valor={hora || null} disabled={deshabilitado || !dia} onValorChange={(h) => cambiar({ countdown_end_date: finLocal(dia, h) })} />
          </div>
          {sinFecha && <span className="text-[12px] text-fg-secondary">Sin fecha de fin el contador no se muestra.</span>}
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">Hora de reinicio (0–23)
          <NumeroKit min={0} max={23} disabled={deshabilitado} value={c.horaReinicio} onChange={(e) => {
            const n = Number(e.target.value);
            cambiar({ countdown_reset_hour: Number.isInteger(n) && n >= 0 && n <= 23 ? n : 0 });
          }} />
        </label>
      )}
      <div role="group" aria-label="Zona horaria" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Zona horaria
        <SelectKit aria-label="Zona horaria" disabled={deshabilitado} value={c.zona} onChange={(e) => cambiar({ countdown_timezone: e.target.value })}>
          {ZONAS_CONTADOR.some(([z]) => z === c.zona) ? null : <option value={c.zona}>{c.zona}</option>}
          {ZONAS_CONTADOR.map(([z, nombre]) => <option key={z} value={z}>{nombre}</option>)}
        </SelectKit>
      </div>
      <fieldset className="flex flex-col gap-2 text-[12px] text-fg-secondary">
        <legend className="mb-1">Dónde se ve</legend>
        {UBICACIONES_CONTADOR.map((u) => (
          <CasillaKit
            key={u.columna}
            titulo={u.etiqueta}
            disabled={deshabilitado}
            checked={c.ubicaciones[u.columna]}
            onChange={(e) => cambiar({ [u.columna]: e.target.checked })}
          />
        ))}
      </fieldset>
    </section>
  );
}
