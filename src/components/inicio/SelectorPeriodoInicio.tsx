'use client';

/**
 * Selector de periodo del inicio (Figma `SelectorPeriodo` 445:195599 y popover
 * «Periodo personalizado» 448:196736).
 *
 * - Escritorio: siete opciones (Hoy · Ayer · 7 días · 30 días · 90 días · Año ·
 *   Personalizado) y a la derecha «Horas». «Personalizado» y «Horas» abren una
 *   capa ANCLADA al botón (8 px por debajo, borde izquierdo; patrón 11): antes
 *   los campos de fecha y el filtro de horas se insertaban en línea dentro de la
 *   cabecera y empujaban la pantalla.
 * - Móvil: un `Select` del kit (como dice el componente); «Personalizado» abre
 *   el mismo formulario en una hoja inferior.
 *
 * Las fechas son días de la organización (`useFormatDate`); las horas del día
 * son las mismas franjas de siempre (`PRESETS_HORAS`) más un rango libre.
 * Qué rango de instantes cuenta cada opción lo decide `calcularRangoPeriodo`.
 */
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { CampoFecha, PanelAdaptable, clasesBoton, useEsEscritorio } from '@/components/kit';
import { indiceSiguiente } from '@/components/kit/navegacionTeclado';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateCore';
import { cn } from '@/utils/Utils';
import type { FechasPeriodo, HorasPeriodo, PeriodoInicio } from '@/lib/dashboard/periodo';
import { PRESETS_HORAS } from './HorasPresets';

const OPCIONES: Array<{ valor: PeriodoInicio; clave: 'today' | 'yesterday' | '7days' | '30days' | '90days' | 'year' | 'custom' }> = [
  { valor: 'hoy', clave: 'today' },
  { valor: 'ayer', clave: 'yesterday' },
  { valor: '7d', clave: '7days' },
  { valor: '30d', clave: '30days' },
  { valor: '90d', clave: '90days' },
  { valor: 'año', clave: 'year' },
  { valor: 'personalizado', clave: 'custom' },
];

/** Las tres franjas del diseño (Mañana · Tarde · Noche) y «Todo el día». */
const FRANJAS = PRESETS_HORAS.filter((p) => p.labelKey === 'morning' || p.labelKey === 'afternoon' || p.labelKey === 'night');

export interface SelectorPeriodoInicioProps {
  periodo: PeriodoInicio;
  onPeriodo: (p: PeriodoInicio) => void;
  horas: HorasPeriodo | null;
  onHoras: (h: HorasPeriodo | null) => void;
  fechas: FechasPeriodo | null;
  onFechas: (f: FechasPeriodo | null) => void;
  className?: string;
}

/** «Horas del día»: franjas + rango libre. `null` = todo el día. */
function HorasDelDia({ valor, onCambio }: { valor: HorasPeriodo | null; onCambio: (h: HorasPeriodo | null) => void }) {
  const t = useTranslations('home');
  const activa = (inicio: string | null, fin: string | null) => (valor?.horaInicio ?? null) === inicio && (valor?.horaFin ?? null) === fin;
  const chip = (activo: boolean) =>
    cn(
      'inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
      activo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover hover:text-fg',
    );
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label={t('periodo.horasDelDia')} className="flex flex-wrap gap-1.5">
        {FRANJAS.map((f) => (
          <button
            key={f.labelKey}
            type="button"
            aria-pressed={activa(f.inicio, f.fin)}
            className={chip(activa(f.inicio, f.fin))}
            onClick={() => onCambio({ horaInicio: f.inicio, horaFin: f.fin })}
          >
            {t(`hours.${f.labelKey}`)}
          </button>
        ))}
        <button type="button" aria-pressed={!valor} className={chip(!valor)} onClick={() => onCambio(null)}>
          {t('periodo.todoElDia')}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="time"
          value={valor?.horaInicio ?? ''}
          onChange={(e) => onCambio({ horaInicio: e.target.value || null, horaFin: valor?.horaFin ?? null })}
          className="h-8 w-[112px] text-[13px]"
          aria-label={t('hours.start')}
        />
        <span aria-hidden="true" className="text-xs text-fg-secondary">—</span>
        <Input
          type="time"
          value={valor?.horaFin ?? ''}
          onChange={(e) => onCambio({ horaInicio: valor?.horaInicio ?? null, horaFin: e.target.value || null })}
          className="h-8 w-[112px] text-[13px]"
          aria-label={t('hours.end')}
        />
      </div>
    </div>
  );
}

/** Horas con los dos extremos o ninguno (las rutas solo aplican rangos completos). */
function normalizarHoras(h: HorasPeriodo | null): HorasPeriodo | null {
  return h && (h.horaInicio || h.horaFin) ? h : null;
}

/** Formulario del popover «Periodo personalizado» (y de la hoja en móvil). */
function FormularioPersonalizado({
  fechas,
  horas,
  onCancelar,
  onAplicar,
}: {
  fechas: FechasPeriodo | null;
  horas: HorasPeriodo | null;
  onCancelar: () => void;
  onAplicar: (f: FechasPeriodo, h: HorasPeriodo | null) => void;
}) {
  const t = useTranslations('home');
  const { getToday, timezone } = useFormatDate();
  const hoy = getToday();
  const [desde, setDesde] = useState(fechas?.fechaInicio ?? addPlainDays(hoy, -29));
  const [hasta, setHasta] = useState(fechas?.fechaFin ?? hoy);
  const [franja, setFranja] = useState<HorasPeriodo | null>(horas);
  const valido = !!desde && !!hasta && desde <= hasta;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold leading-[22px] text-fg">{t('periodo.rangoFechas')}</h3>
      <div className="grid grid-cols-2 gap-2">
        <CampoFecha valor={desde} onValorChange={setDesde} hoy={hoy} max={hasta || hoy} aria-label={t('periodo.desde')} limpiable={false} />
        <CampoFecha valor={hasta} onValorChange={setHasta} hoy={hoy} min={desde} max={hoy} aria-label={t('periodo.hasta')} limpiable={false} />
      </div>
      <p className="text-xs leading-[18px] text-fg-secondary">{t('periodo.notaZona', { zona: timezone })}</p>
      <h3 className="text-base font-semibold leading-[22px] text-fg">{t('periodo.horasDelDia')}</h3>
      <HorasDelDia valor={franja} onCambio={setFranja} />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={onCancelar}>
          {t('hours.cancel')}
        </button>
        <button
          type="button"
          className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
          disabled={!valido}
          onClick={() => onAplicar({ fechaInicio: desde, fechaFin: hasta }, normalizarHoras(franja))}
        >
          {t('hours.apply')}
        </button>
      </div>
    </div>
  );
}

export function SelectorPeriodoInicio({ periodo, onPeriodo, horas, onHoras, fechas, onFechas, className }: SelectorPeriodoInicioProps) {
  const t = useTranslations('home');
  const idGrupo = useId();
  // Solo decide qué capa abrir al pulsar (popover anclado o hoja inferior);
  // lo visible va por CSS (`lg:`).
  const esEscritorio = useEsEscritorio();
  const [personalizadoAbierto, setPersonalizadoAbierto] = useState(false);
  const [horasAbierto, setHorasAbierto] = useState(false);
  const [borradorHoras, setBorradorHoras] = useState<HorasPeriodo | null>(horas);
  const conHoras = !!normalizarHoras(horas);

  const elegir = (v: PeriodoInicio) => {
    if (v === 'personalizado') {
      setPersonalizadoAbierto(true);
      return;
    }
    onFechas(null);
    onPeriodo(v);
  };

  const aplicarPersonalizado = (f: FechasPeriodo, h: HorasPeriodo | null) => {
    onFechas(f);
    onHoras(h);
    onPeriodo('personalizado');
    setPersonalizadoAbierto(false);
  };

  const teclas = (e: React.KeyboardEvent, i: number) => {
    const siguiente = indiceSiguiente(i, OPCIONES.length, e.key, OPCIONES.map(() => false));
    if (siguiente === null) return;
    e.preventDefault();
    document.getElementById(`${idGrupo}-${siguiente}`)?.focus();
    elegir(OPCIONES[siguiente].valor);
  };

  const etiquetaHoras = conHoras ? `${horas?.horaInicio || '00:00'}–${horas?.horaFin || '23:59'}` : t('hours.hours');
  const formulario = (
    <FormularioPersonalizado
      fechas={fechas}
      horas={horas}
      onCancelar={() => setPersonalizadoAbierto(false)}
      onAplicar={aplicarPersonalizado}
    />
  );

  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      {/* Escritorio: siete opciones con el aspecto de SelectorPeriodo. */}
      <Popover open={personalizadoAbierto && esEscritorio} onOpenChange={setPersonalizadoAbierto}>
        <div
          role="radiogroup"
          aria-label={t('periods.label')}
          className="hidden items-center gap-0.5 rounded-lg border border-line bg-surface p-1 lg:inline-flex"
        >
          {OPCIONES.map((o, i) => {
            const activa = o.valor === periodo;
            const boton = (
              <button
                key={o.valor}
                id={`${idGrupo}-${i}`}
                type="button"
                role="radio"
                aria-checked={activa}
                tabIndex={activa ? 0 : -1}
                onClick={() => elegir(o.valor)}
                onKeyDown={(e) => teclas(e, i)}
                className={cn(
                  'inline-flex h-7 items-center whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  activa ? 'bg-brand text-fg-on-brand' : 'text-fg-secondary hover:bg-hover hover:text-fg',
                )}
              >
                {t(`periods.${o.clave}`)}
              </button>
            );
            return o.valor === 'personalizado' ? (
              <PopoverAnchor asChild key={o.valor}>
                {boton}
              </PopoverAnchor>
            ) : (
              boton
            );
          })}
        </div>
        <PopoverContent align="start" sideOffset={8} className="w-[400px] rounded-xl border-line bg-surface p-5">
          {formulario}
        </PopoverContent>
      </Popover>

      <Popover
        open={horasAbierto}
        onOpenChange={(v) => {
          setHorasAbierto(v);
          if (v) setBorradorHoras(horas);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-pressed={conHoras}
            title={t('hours.filterByHours')}
            className={clasesBoton({ variante: conHoras ? 'tinte' : 'secundario', tamano: 'sm', className: 'hidden lg:inline-flex' })}
          >
            {conHoras && <Clock aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {etiquetaHoras}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className="w-[340px] rounded-xl border-line bg-surface p-4">
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold leading-[22px] text-fg">{t('periodo.horasDelDia')}</h3>
            <HorasDelDia valor={borradorHoras} onCambio={setBorradorHoras} />
            <div className="flex justify-end gap-2">
              <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setHorasAbierto(false)}>
                {t('hours.cancel')}
              </button>
              <button
                type="button"
                className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
                onClick={() => {
                  onHoras(normalizarHoras(borradorHoras));
                  setHorasAbierto(false);
                }}
              >
                {t('hours.apply')}
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Móvil: Select del kit; «Personalizado» abre la hoja inferior. */}
      <div className="lg:hidden">
        <Select value={periodo} onValueChange={(v) => elegir(v as PeriodoInicio)}>
          <SelectTrigger className="h-10 w-[128px] bg-surface" aria-label={t('periods.label')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPCIONES.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {t(`periods.${o.clave}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <PanelAdaptable
          abierto={personalizadoAbierto && !esEscritorio}
          onAbiertoChange={setPersonalizadoAbierto}
          titulo={t('periods.custom')}
        >
          {formulario}
        </PanelAdaptable>
      </div>
    </div>
  );
}
