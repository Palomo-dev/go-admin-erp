'use client';

/**
 * «Estilo» del contador regresivo: fondo, texto, ícono, temporizador y tamaño, en UNA columna
 * (`website_settings.countdown_style`, jsonb) que vale para todas las ubicaciones. Apagado = NULL =
 * el contador de siempre. Lector y valores compartidos con la tienda: `@/lib/website/estiloContador`.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useId } from 'react';
import { Clock, Flame, Gift, Percent, Sparkles, Tag, Timer, Zap, type LucideIcon } from 'lucide-react';
import { ChipsOpcion, FormField, SegmentedControl } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { ColorKit } from './controlesKit';
import { textoSobreAcento } from '@/lib/website/v2/tokensEstilo';
import {
  ESTILO_CONTADOR_INICIAL,
  ICONOS_CONTADOR,
  leerEstiloContador,
  resolverEstiloContador,
  avisosContrasteContador,
  unidadesContador,
  type EstiloContador,
} from '@/lib/website/estiloContador';

const LUCIDE: Record<string, LucideIcon> = { Flame, Clock, Timer, Zap, Tag, Gift, Percent, Sparkles };

type Parcial = { [K in keyof EstiloContador]?: Partial<EstiloContador[K]> | EstiloContador[K] };

/** Mezcla un cambio parcial en el estilo vigente (o en el inicial). */
export function mezclarEstilo(actual: EstiloContador | null, cambio: Parcial): EstiloContador {
  const b = actual ?? ESTILO_CONTADOR_INICIAL;
  return {
    fondo: { ...b.fondo, ...(cambio.fondo as object) },
    texto: { ...b.texto, ...(cambio.texto as object) },
    icono: { ...b.icono, ...(cambio.icono as object) },
    temporizador: { ...b.temporizador, ...(cambio.temporizador as object) },
    tamano: (cambio.tamano as EstiloContador['tamano']) ?? b.tamano,
  };
}

function Grupo({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={titulo} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-fg">{titulo}</span>
        {ayuda && <span className="text-[12px] leading-4 text-fg-muted">{ayuda}</span>}
      </div>
      {children}
    </div>
  );
}

function FilaSwitch({ titulo, ayuda, checked, onChange, disabled }: { titulo: string; ayuda?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-fg">{titulo}</label>
        {ayuda && <span className="text-[12px] text-fg-muted">{ayuda}</span>}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}

function Segmento<V extends string>({ etiqueta, valor, opciones, onCambiar, disabled }: { etiqueta: string; valor: V; opciones: readonly { valor: V; etiqueta: string }[]; onCambiar: (v: V) => void; disabled?: boolean }) {
  return (
    <FormField etiqueta={etiqueta}>
      {(campo) => (
        <SegmentedControl aria-labelledby={campo.idEtiqueta} tamano="sm" anchoCompleto deshabilitado={disabled} valor={valor} opciones={opciones} onValorChange={onCambiar} />
      )}
    </FormField>
  );
}

/** Color «automático o personalizado»: vacío = automático. */
function ColorAuto({ etiqueta, valor, onCambiar, disabled, porDefecto }: { etiqueta: string; valor: string; onCambiar: (hex: string) => void; disabled?: boolean; porDefecto: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Segmento
        etiqueta={etiqueta}
        valor={valor ? 'propio' : 'auto'}
        opciones={[{ valor: 'auto', etiqueta: 'Automático' }, { valor: 'propio', etiqueta: 'Personalizado' }] as const}
        onCambiar={(v) => onCambiar(v === 'auto' ? '' : valor || porDefecto)}
        disabled={disabled}
      />
      {valor && <ColorKit etiqueta={`${etiqueta} · color`} value={valor} disabled={disabled} onChange={(e) => onCambiar(e.target.value)} />}
    </div>
  );
}

const ANGULOS = [
  { valor: '90', etiqueta: '→ Horizontal' },
  { valor: '180', etiqueta: '↓ Vertical' },
  { valor: '135', etiqueta: '↘ Diagonal' },
  { valor: '45', etiqueta: '↗ Diagonal' },
] as const;

function IconoVista({ e, px }: { e: EstiloContador; px: number }) {
  const def = ICONOS_CONTADOR.find((i) => i.valor === e.icono.tipo);
  if (!def || def.valor === 'ninguno') return null;
  if (def.emoji) return <span aria-hidden style={{ fontSize: px }}>{def.emoji}</span>;
  const C = def.lucide ? LUCIDE[def.lucide] : null;
  return C ? <C aria-hidden style={{ width: px, height: px }} strokeWidth={2.25} /> : null;
}

/** Vista previa (barra y tarjeta) con los mismos valores resueltos que la tienda. */
export function VistaContadorEstilo({ estilo, primario, titulo, segundos }: { estilo: EstiloContador; primario: string; titulo: string; segundos: number }) {
  const r = resolverEstiloContador(estilo, primario, textoSobreAcento);
  const caja: CSSProperties = { background: r.fondoCaja, borderRadius: r.radioCaja, color: r.colorDigitos, padding: r.conCaja ? '2px 6px' : 0 };
  const dig = (
    <span className="flex items-center gap-1 font-mono font-bold" style={{ fontSize: r.px.digitos, color: r.colorDigitos }}>
      {unidadesContador(segundos).map((u, i) => (
        <span key={u.etiqueta} className="flex items-center gap-1">
          {i > 0 && estilo.temporizador.separadores && <span>:</span>}
          <span className="flex flex-col items-center leading-tight">
            <span style={caja}>{u.valor}</span>
            {estilo.temporizador.etiquetas && <span className="font-sans uppercase opacity-80" style={{ fontSize: r.px.etiqueta, color: r.colorTexto }}>{u.etiqueta}</span>}
          </span>
        </span>
      ))}
    </span>
  );
  const base: CSSProperties = { background: r.fondo, color: r.colorTexto, fontWeight: r.peso, fontSize: r.px.texto };
  const pos = estilo.icono.posicion;
  const t = `${estilo.texto.antes ? `${estilo.texto.antes} ` : ''}${titulo}`;
  return (
    <div aria-hidden="true" data-testid="vista-contador-estilo" className="flex flex-col gap-2">
      <div className="flex flex-nowrap items-center justify-center rounded-lg" style={{ ...base, padding: `${r.px.relleno}px 12px`, gap: r.px.separacion }}>
        {pos !== 'fin' && <IconoVista e={estilo} px={r.px.icono} />}
        <span className="min-w-0 truncate">{t}</span>
        {dig}
        {estilo.texto.despues && <span className="shrink-0">{estilo.texto.despues}</span>}
        {pos !== 'inicio' && <IconoVista e={estilo} px={r.px.icono} />}
      </div>
      <div className="flex flex-col items-center gap-1.5 rounded-lg p-3 text-center" style={base}>
        <span className="flex items-center gap-1.5">{pos !== 'fin' && <IconoVista e={estilo} px={r.px.icono} />}{t}</span>
        {dig}
      </div>
    </div>
  );
}

export function PanelEstiloContador({
  valor,
  onCambiar,
  primario,
  titulo,
  segundos,
  columnaDisponible,
  deshabilitado,
}: {
  /** Valor crudo de `countdown_style` (puede venir NULL, vacío o con basura). */
  valor: unknown;
  onCambiar: (estilo: EstiloContador | null) => void;
  primario: string;
  titulo: string;
  segundos: number;
  /** false si la fila cargada no trae la columna (migración pendiente): se ve, pero no se guarda. */
  columnaDisponible: boolean;
  deshabilitado?: boolean;
}) {
  const e = leerEstiloContador(valor);
  const d = deshabilitado;
  const set = (c: Parcial) => onCambiar(mezclarEstilo(e, c));
  return (
    <div className="flex flex-col gap-[14px]" data-testid="estilo-contador">
      <FilaSwitch
        titulo="Personalizar estilo"
        ayuda={e ? 'Vale para la barra, el carrito, el pago, el producto y la portada' : 'Apagado: el contador de siempre'}
        checked={!!e}
        disabled={d}
        onChange={(v) => onCambiar(v ? ESTILO_CONTADOR_INICIAL : null)}
      />
      {!columnaDisponible && e && (
        <p className="rounded-md bg-warning/10 px-2 py-1.5 text-[12px] text-fg-secondary">
          Vista previa: este estilo todavía no se guarda en la tienda (falta activar la columna en la base).
        </p>
      )}
      {e && (() => {
        const bajos = avisosContrasteContador(e, primario, textoSobreAcento);
        return bajos.length > 0 ? (
          <p role="status" data-testid="aviso-contraste-contador" className="text-[12px] leading-4 text-fg-muted">
            Poco contraste ({bajos.map((b) => (b === 'texto' ? 'texto' : 'dígitos')).join(' y ')}): menos de 4.5:1, puede leerse mal.
          </p>
        ) : null;
      })()}
      {e && (
        <>
          <VistaContadorEstilo estilo={e} primario={primario} titulo={titulo} segundos={segundos} />
          <Grupo titulo="Fondo" ayuda="Color del sitio, un color propio o un degradado">
            <Segmento
              etiqueta="Tipo de fondo"
              valor={e.fondo.tipo}
              disabled={d}
              opciones={[{ valor: 'sitio', etiqueta: 'Color del sitio' }, { valor: 'solido', etiqueta: 'Sólido' }, { valor: 'degradado', etiqueta: 'Degradado' }] as const}
              onCambiar={(tipo) => set({ fondo: { tipo, color: e.fondo.color || primario, desde: e.fondo.desde || primario, hasta: e.fondo.hasta || '#111111' } })}
            />
            {e.fondo.tipo === 'solido' && <ColorKit etiqueta="Color de fondo" value={e.fondo.color || primario} disabled={d} onChange={(x) => set({ fondo: { color: x.target.value } })} />}
            {e.fondo.tipo === 'degradado' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <ColorKit etiqueta="Desde" value={e.fondo.desde || primario} disabled={d} onChange={(x) => set({ fondo: { desde: x.target.value } })} />
                  <ColorKit etiqueta="Hasta" value={e.fondo.hasta || primario} disabled={d} onChange={(x) => set({ fondo: { hasta: x.target.value } })} />
                </div>
                <FormField etiqueta="Dirección">
                  {(campo) => (
                    <ChipsOpcion
                      aria-labelledby={campo.idEtiqueta}
                      opciones={ANGULOS.map((a) => ({ ...a, deshabilitada: d }))}
                      valor={(ANGULOS.find((a) => Number(a.valor) === e.fondo.angulo)?.valor ?? null) as (typeof ANGULOS)[number]['valor'] | null}
                      onValorChange={(v) => set({ fondo: { angulo: Number(v) } })}
                    />
                  )}
                </FormField>
              </>
            )}
          </Grupo>
          <Grupo titulo="Texto">
            <ColorAuto etiqueta="Color del texto" valor={e.texto.color} porDefecto="#FFFFFF" disabled={d} onCambiar={(color) => set({ texto: { color } })} />
            <Segmento etiqueta="Tamaño del texto" valor={e.texto.tamano} disabled={d} opciones={[{ valor: 'compacto', etiqueta: 'Pequeño' }, { valor: 'normal', etiqueta: 'Normal' }, { valor: 'grande', etiqueta: 'Grande' }] as const} onCambiar={(tamano) => set({ texto: { tamano } })} />
            <Segmento etiqueta="Grosor" valor={e.texto.grosor} disabled={d} opciones={[{ valor: 'normal', etiqueta: 'Normal' }, { valor: 'medio', etiqueta: 'Medio' }, { valor: 'negrita', etiqueta: 'Negrita' }] as const} onCambiar={(grosor) => set({ texto: { grosor } })} />
            <div className="grid grid-cols-2 gap-2">
              <FormField etiqueta="Antes del texto">
                {(campo) => <input id={campo.id} className={CONTROL} disabled={d} maxLength={60} placeholder="Ej.: SOLO HOY" value={e.texto.antes} onChange={(x) => set({ texto: { antes: x.target.value } })} />}
              </FormField>
              <FormField etiqueta="Después del contador">
                {(campo) => <input id={campo.id} className={CONTROL} disabled={d} maxLength={60} placeholder="Ej.: ¡Aprovecha!" value={e.texto.despues} onChange={(x) => set({ texto: { despues: x.target.value } })} />}
              </FormField>
            </div>
          </Grupo>
          <Grupo titulo="Ícono">
            <FormField etiqueta="Ícono">
              {(campo) => (
                <ChipsOpcion aria-labelledby={campo.idEtiqueta} opciones={ICONOS_CONTADOR.map((i) => ({ valor: i.valor, etiqueta: i.etiqueta, deshabilitada: d }))} valor={e.icono.tipo} onValorChange={(tipo) => set({ icono: { tipo } })} />
              )}
            </FormField>
            {e.icono.tipo !== 'ninguno' && (
              <Segmento etiqueta="Posición" valor={e.icono.posicion} disabled={d} opciones={[{ valor: 'inicio', etiqueta: 'Al inicio' }, { valor: 'fin', etiqueta: 'Al final' }, { valor: 'ambos', etiqueta: 'Ambos lados' }] as const} onCambiar={(posicion) => set({ icono: { posicion } })} />
            )}
          </Grupo>
          <Grupo titulo="Temporizador" ayuda="Las cajas de los dígitos">
            <Segmento etiqueta="Caja" valor={e.temporizador.caja} disabled={d} opciones={[{ valor: 'ninguna', etiqueta: 'Sin caja' }, { valor: 'cuadrada', etiqueta: 'Cuadrada' }, { valor: 'redondeada', etiqueta: 'Redondeada' }, { valor: 'pildora', etiqueta: 'Píldora' }] as const} onCambiar={(caja) => set({ temporizador: { caja } })} />
            {e.temporizador.caja !== 'ninguna' && (
              <ColorAuto etiqueta="Color de la caja" valor={e.temporizador.colorCaja} porDefecto="#FFFFFF" disabled={d} onCambiar={(colorCaja) => set({ temporizador: { colorCaja } })} />
            )}
            <ColorAuto etiqueta="Color de los dígitos" valor={e.temporizador.colorDigitos} porDefecto="#111111" disabled={d} onCambiar={(colorDigitos) => set({ temporizador: { colorDigitos } })} />
            <FilaSwitch titulo="Etiquetas" ayuda="Días, horas, min y seg debajo de cada número" checked={e.temporizador.etiquetas} disabled={d} onChange={(etiquetas) => set({ temporizador: { etiquetas } })} />
            <FilaSwitch titulo="Separadores «:»" checked={e.temporizador.separadores} disabled={d} onChange={(separadores) => set({ temporizador: { separadores } })} />
          </Grupo>
          <Grupo titulo="Tamaño general">
            <Segmento etiqueta="Tamaño" valor={e.tamano} disabled={d} opciones={[{ valor: 'compacto', etiqueta: 'Compacto' }, { valor: 'normal', etiqueta: 'Normal' }, { valor: 'grande', etiqueta: 'Grande' }] as const} onCambiar={(tamano) => set({ tamano })} />
          </Grupo>
        </>
      )}
    </div>
  );
}

const CONTROL = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg';
