'use client';

/**
 * Secciones del detalle del chat del sitio web (Figma 91-chat-24):
 * Instalación (código, clave pública y dominios permitidos), Apariencia
 * (color, esquina, márgenes horizontal y vertical, tamaño, logo y más
 * opciones de estilo), Al abrir el chat (vista inicial, mensajes, botones
 * rápidos con mensaje o enlace, fuera de línea) y Datos del visitante.
 * Guardan con `chatChannelsService` por medio de la página; aquí solo hay
 * formulario. Lo restaurado el 2026-11-14 está en
 * `docs/design/AUDITORIA-CHAT-FUNCIONES-PERDIDAS-2026-11-14.md`.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, KeyRound, Link2, Plus, X } from 'lucide-react';
import { CampoNumero, ConfirmDialog, FormField, RowActionsMenu, SeccionPlegable, Tarjeta, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AIMode, BrandConfig, CollectIdentity, WidgetBehavior, WidgetPosition, WidgetStyle } from '@/lib/services/chatChannelsService';
import { MODOS_IA } from '../../canalesLogica';
import {
  LIMITES_WIDGET,
  botonAbreEnlace,
  botonRapido,
  claveDePosicion,
  entreLimites,
  esDominioValido,
  esUrlImagenValida,
  normalizarDominio,
  posicionDeClave,
  type ClavePosicion,
} from './widgetLogica';
import { EstiloAvanzadoWidget } from './EstiloAvanzadoWidget';

/* ── Instalación ─────────────────────────────────────────────────────────── */

export function InstalacionWidget({
  codigo,
  clavePublica,
  dominios,
  rotando,
  onRotarClave,
  onAgregarDominio,
  onQuitarDominio,
}: {
  codigo: string;
  clavePublica: string | null;
  dominios: readonly string[];
  rotando: boolean;
  onRotarClave: () => void;
  onAgregarDominio: (d: string) => Promise<void>;
  onQuitarDominio: (d: string) => Promise<void>;
}) {
  const t = useTranslations('chatModulo.canales.widget.instalacion');
  const tm = useTranslations('chatModulo.canales.widget.mas.instalacion');
  const [copiado, setCopiado] = useState(false);
  const [claveCopiada, setClaveCopiada] = useState(false);
  const [confirmarRotar, setConfirmarRotar] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* el código está a la vista para copiarlo a mano */
    }
  };

  const copiarClave = async () => {
    if (!clavePublica) return;
    try {
      await navigator.clipboard.writeText(clavePublica);
      setClaveCopiada(true);
      setTimeout(() => setClaveCopiada(false), 2000);
    } catch {
      /* la clave va dentro del código, que está a la vista */
    }
  };

  const agregar = async () => {
    const d = normalizarDominio(nuevo);
    if (!esDominioValido(d)) {
      setError(t('dominioInvalido'));
      return;
    }
    if (dominios.includes(d)) {
      setError(t('dominioRepetido'));
      return;
    }
    try {
      await onAgregarDominio(d);
      setNuevo('');
      setAgregando(false);
      setError(null);
    } catch {
      /* la página avisó con un toast; el campo queda para reintentar */
    }
  };

  return (
    <Tarjeta
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      accion={
        <RowActionsMenu
          orientacion="horizontal"
          titulo={t('titulo')}
          acciones={[
            {
              id: 'copiarClave',
              etiqueta: claveCopiada ? tm('claveCopiada') : tm('copiarClave'),
              descripcion: clavePublica ?? undefined,
              icono: claveCopiada ? Check : Copy,
              onSelect: copiarClave,
              deshabilitada: !clavePublica,
            },
            { id: 'rotar', etiqueta: t('rotarClave'), descripcion: t('rotarClaveDescripcion'), icono: KeyRound, onSelect: () => setConfirmarRotar(true), deshabilitada: rotando },
          ]}
        />
      }
    >
      <ConfirmDialog
        abierto={confirmarRotar}
        onAbiertoChange={setConfirmarRotar}
        titulo={tm('confirmarRotarTitulo')}
        descripcion={tm('confirmarRotarDescripcion')}
        textoConfirmar={t('rotarClave')}
        textoCancelar={tm('cancelar')}
        tono="advertencia"
        icono={KeyRound}
        cargando={rotando}
        onConfirmar={() => {
          setConfirmarRotar(false);
          onRotarClave();
        }}
      />
      <div className="flex flex-col gap-4">
        <div className="relative rounded-lg bg-solid-neutral p-3 pr-11">
          <code className="block break-all font-mono text-xs leading-5 text-on-solid">{codigo}</code>
          <button
            type="button"
            onClick={copiar}
            aria-label={copiado ? t('copiado') : t('copiar')}
            className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-md text-on-solid/80 hover:bg-white/10 hover:text-on-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {copiado ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-fg-secondary">{t('dominios')}</span>
          {dominios.length === 0 && <span className="text-[13px] text-fg-muted">{t('sinDominios')}</span>}
          {dominios.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 rounded-full bg-brand-tint py-1 pl-3 pr-1 text-[13px] font-medium text-brand-deep">
              {d}
              <button
                type="button"
                aria-label={t('quitarDominio', { dominio: d })}
                onClick={() => onQuitarDominio(d)}
                className="flex size-5 items-center justify-center rounded-full hover:bg-brand-tint-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ))}
          {agregando ? (
            <span className="flex items-center gap-2">
              <Input
                autoFocus
                value={nuevo}
                placeholder="tutienda.com"
                aria-label={t('nuevoDominio')}
                aria-invalid={!!error}
                onChange={(e) => {
                  setNuevo(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') agregar();
                  if (e.key === 'Escape') setAgregando(false);
                }}
                className="h-8 w-48"
              />
              <button type="button" onClick={agregar} className={clasesBoton({ tamano: 'sm' })}>
                {t('agregar')}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setAgregando(true)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('agregar')}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-danger-text">{error}</p>}
        <p className="text-xs text-fg-muted">{t('dominiosAyuda')}</p>
      </div>
    </Tarjeta>
  );
}

/* ── Apariencia ──────────────────────────────────────────────────────────── */

const TAMANOS = [48, 56, 64] as const;

export function AparienciaWidget({
  config,
  onGuardarPosicion,
  onGuardarEstilo,
  onGuardarLogo,
}: {
  config: BrandConfig;
  onGuardarPosicion: (p: WidgetPosition) => Promise<void>;
  onGuardarEstilo: (s: WidgetStyle) => Promise<void>;
  onGuardarLogo: (url: string) => Promise<void>;
}) {
  const t = useTranslations('chatModulo.canales.widget.apariencia');
  const tm = useTranslations('chatModulo.canales.widget.mas.apariencia');
  const [color, setColor] = useState(config.style.primaryColor);
  const [margenes, setMargenes] = useState({ x: config.position.offsetX, y: config.position.offsetY });
  const [logo, setLogo] = useState(config.logo_url ?? '');
  useEffect(() => setColor(config.style.primaryColor), [config.style.primaryColor]);
  useEffect(() => setMargenes({ x: config.position.offsetX, y: config.position.offsetY }), [config.position.offsetX, config.position.offsetY]);
  useEffect(() => setLogo(config.logo_url ?? ''), [config.logo_url]);
  const logoInvalido = !esUrlImagenValida(logo);
  const izquierda = config.position.side === 'left';
  const arriba = config.position.vertical === 'top';

  /** Guarda los márgenes al salir del campo; conserva la esquina elegida. */
  const guardarMargenes = () => {
    const x = entreLimites(margenes.x, LIMITES_WIDGET.margen, config.position.offsetX);
    const y = entreLimites(margenes.y, LIMITES_WIDGET.margen, config.position.offsetY);
    setMargenes({ x, y });
    if (x !== config.position.offsetX || y !== config.position.offsetY) {
      onGuardarPosicion({ ...config.position, offsetX: x, offsetY: y }).catch(() => undefined);
    }
  };

  const guardarLogo = () => {
    const v = logo.trim();
    if (esUrlImagenValida(v) && v !== (config.logo_url ?? '')) onGuardarLogo(v).catch(() => undefined);
  };
  const clave = claveDePosicion(config.position);
  const tamano = TAMANOS.includes(config.style.buttonSize as 48) ? String(config.style.buttonSize) : 'otro';

  const guardarColor = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(color) && color.toLowerCase() !== config.style.primaryColor.toLowerCase()) {
      onGuardarEstilo({ ...config.style, primaryColor: color }).catch(() => undefined);
    }
  };

  return (
    <Tarjeta titulo={t('titulo')}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField etiqueta={t('color')}>
            {(campo) => (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={t('color')}
                  value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#4361ee'}
                  onChange={(e) => setColor(e.target.value)}
                  onBlur={guardarColor}
                  className="size-10 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
                />
                <Input id={campo.id} value={color} onChange={(e) => setColor(e.target.value)} onBlur={guardarColor} className="font-mono uppercase" />
              </div>
            )}
          </FormField>
          <FormField etiqueta={t('posicion')}>
            {(campo) => (
              <Select value={clave} onValueChange={(v) => onGuardarPosicion(posicionDeClave(v as ClavePosicion, config.position)).catch(() => undefined)}>
                <SelectTrigger id={campo.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['abajoDerecha', 'abajoIzquierda', 'arribaDerecha', 'arribaIzquierda'] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`posiciones.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('tamano')}>
            {(campo) => (
              <Select
                value={tamano}
                onValueChange={(v) => {
                  const n = Number(v);
                  if (n) onGuardarEstilo({ ...config.style, buttonSize: n, borderRadius: Math.round(n / 2) }).catch(() => undefined);
                }}
              >
                <SelectTrigger id={campo.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAMANOS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t(`tamanos.t${n}`)}
                    </SelectItem>
                  ))}
                  {tamano === 'otro' && <SelectItem value="otro">{t('tamanos.otro', { px: config.style.buttonSize })}</SelectItem>}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            etiqueta={tm('margenHorizontal')}
            ayuda={tm(izquierda ? 'margenHorizontalAyudaIzquierda' : 'margenHorizontalAyudaDerecha', { max: LIMITES_WIDGET.margen.max })}
          >
            <CampoNumero
              decimales={0}
              minimo={LIMITES_WIDGET.margen.min}
              maximo={LIMITES_WIDGET.margen.max}
              sufijo="px"
              valor={margenes.x}
              onValorChange={(v) => setMargenes((m) => ({ ...m, x: v ?? m.x }))}
              onBlur={guardarMargenes}
            />
          </FormField>
          <FormField
            etiqueta={tm('margenVertical')}
            ayuda={tm(arriba ? 'margenVerticalAyudaArriba' : 'margenVerticalAyudaAbajo', { max: LIMITES_WIDGET.margen.max })}
          >
            <CampoNumero
              decimales={0}
              minimo={LIMITES_WIDGET.margen.min}
              maximo={LIMITES_WIDGET.margen.max}
              sufijo="px"
              valor={margenes.y}
              onValorChange={(v) => setMargenes((m) => ({ ...m, y: v ?? m.y }))}
              onBlur={guardarMargenes}
            />
          </FormField>
        </div>
        <FormField etiqueta={tm('logo')} ayuda={tm('logoAyuda')} error={logoInvalido ? tm('logoInvalido') : null}>
          {(campo) => (
            <div className="flex items-center gap-2">
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-subtle">
                {logo && !logoInvalido ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen externa elegida por la organización
                  <img src={logo} alt="" className="size-full object-cover" />
                ) : (
                  <Link2 aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
                )}
              </span>
              <Input id={campo.id} value={logo} placeholder="https://…" inputMode="url" onChange={(e) => setLogo(e.target.value)} onBlur={guardarLogo} />
            </div>
          )}
        </FormField>
        <SeccionPlegable titulo={t('avanzado')}>
          <EstiloAvanzadoWidget estilo={config.style} onGuardar={onGuardarEstilo} />
        </SeccionPlegable>
      </div>
    </Tarjeta>
  );
}

/* ── Al abrir el chat ────────────────────────────────────────────────────── */

export function AlAbrirWidget({ comportamiento, onGuardar }: { comportamiento: WidgetBehavior; onGuardar: (b: WidgetBehavior) => Promise<void> }) {
  const t = useTranslations('chatModulo.canales.widget.alAbrir');
  const tm = useTranslations('chatModulo.canales.widget.mas.alAbrir');
  const [b, setB] = useState(comportamiento);
  const [nuevoBoton, setNuevoBoton] = useState('');
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setB(comportamiento), [comportamiento]);
  const cambios = JSON.stringify(b) !== JSON.stringify(comportamiento);
  const botones = b.quickActions ?? [];

  const agregarBoton = () => {
    const etiqueta = nuevoBoton.trim();
    if (!etiqueta || botones.some((q) => q.label === etiqueta)) return;
    setB({ ...b, showQuickActions: true, quickActions: [...botones, botonRapido(etiqueta, nuevoMensaje)] });
    setNuevoBoton('');
    setNuevoMensaje('');
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await onGuardar(b);
    } catch {
      /* la página avisó con un toast */
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta
      titulo={t('titulo')}
      pie={
        <div className="flex justify-end gap-2">
          <button type="button" disabled={!cambios || guardando} onClick={() => setB(comportamiento)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            {t('descartar')}
          </button>
          <button type="button" disabled={!cambios || guardando} onClick={guardar} className={clasesBoton({ tamano: 'sm' })}>
            {t('guardar')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('tituloChat')}>
          <Input value={b.title} maxLength={60} onChange={(e) => setB({ ...b, title: e.target.value })} />
        </FormField>
        <FormField etiqueta={t('bienvenida')}>
          <Input value={b.welcomeMessage} maxLength={300} onChange={(e) => setB({ ...b, welcomeMessage: e.target.value })} />
        </FormField>
        <FormField etiqueta={tm('vistaInicial')}>
          {(campo) => (
            <Select value={b.openDefaultView} onValueChange={(v) => setB({ ...b, openDefaultView: v as WidgetBehavior['openDefaultView'] })}>
              <SelectTrigger id={campo.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['chat', 'form', 'faq'] as const).map((v) => (
                  <SelectItem key={v} value={v}>
                    {tm(`vistas.${v}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('fueraDeLinea')}>
          <Input value={b.offlineMessage} maxLength={300} onChange={(e) => setB({ ...b, offlineMessage: e.target.value })} />
        </FormField>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-fg">
          <Checkbox className="mt-0.5" checked={b.offlineCollectData} onCheckedChange={(v) => setB({ ...b, offlineCollectData: v === true })} />
          <span>
            {tm('pedirDatosFueraDeLinea')}
            <span className="block text-xs text-fg-muted">{tm('pedirDatosFueraDeLineaAyuda')}</span>
          </span>
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-fg">
          {tm('mostrarBotones')}
          <Switch checked={b.showQuickActions} onCheckedChange={(v) => setB({ ...b, showQuickActions: v })} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-fg-secondary">{t('botones')}</span>
          {botones.map((q) => (
            <span
              key={q.label}
              title={q.action !== q.label ? q.action : undefined}
              className="inline-flex items-center gap-1 rounded-full bg-brand-tint py-1 pl-3 pr-1 text-[13px] font-medium text-brand-deep"
            >
              {botonAbreEnlace(q.action) && <Link2 aria-label={tm('abreEnlace')} className="size-3.5" strokeWidth={1.75} />}
              {q.label}
              {q.action !== q.label && !botonAbreEnlace(q.action) && <span className="max-w-[10rem] truncate font-normal opacity-70">· {q.action}</span>}
              <button
                type="button"
                aria-label={t('quitarBoton', { boton: q.label })}
                onClick={() => setB({ ...b, quickActions: botones.filter((x) => x.label !== q.label) })}
                className="flex size-5 items-center justify-center rounded-full hover:bg-brand-tint-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ))}
          <Input
            value={nuevoBoton}
            placeholder={t('nuevoBoton')}
            aria-label={t('nuevoBoton')}
            maxLength={40}
            onChange={(e) => setNuevoBoton(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarBoton())}
            className="h-8 w-44"
          />
          <Input
            value={nuevoMensaje}
            placeholder={tm('mensajeBoton')}
            aria-label={tm('mensajeBoton')}
            maxLength={500}
            onChange={(e) => setNuevoMensaje(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarBoton())}
            className="h-8 w-56"
          />
          <button type="button" onClick={agregarBoton} disabled={!nuevoBoton.trim()} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('agregar')}
          </button>
        </div>
        <p className="text-xs text-fg-muted">{tm(b.showQuickActions ? 'mensajeBotonAyuda' : 'botonesOcultos')}</p>
      </div>
    </Tarjeta>
  );
}

/* ── Datos del visitante ─────────────────────────────────────────────────── */

export function DatosVisitanteWidget({
  datos,
  modo,
  onGuardarDatos,
  onCambiarModo,
  guardandoModo,
}: {
  datos: CollectIdentity;
  modo: AIMode;
  onGuardarDatos: (c: CollectIdentity) => Promise<void>;
  onCambiarModo: (m: AIMode) => void;
  guardandoModo: boolean;
}) {
  const t = useTranslations('chatModulo.canales.widget.visitante');
  const tm = useTranslations('chatModulo.canales');
  const campos = ['name', 'phone', 'email'] as const;
  return (
    <Tarjeta titulo={t('titulo')} descripcion={t('descripcion')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {campos.map((c) => (
            <label key={c} className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <Checkbox checked={!!datos[c]} onCheckedChange={(v) => onGuardarDatos({ ...datos, [c]: v === true }).catch(() => undefined)} />
              {t(`campos.${c}`)}
            </label>
          ))}
        </div>
        <FormField etiqueta={t('ayudaIa')}>
          {(campo) => (
            <Select value={modo} onValueChange={(v) => onCambiarModo(v as AIMode)} disabled={guardandoModo}>
              <SelectTrigger id={campo.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODOS_IA.map((m) => (
                  <SelectItem key={m} value={m}>
                    {tm(`modosTitulo.${m}`)} · {tm(`modosDescripcion.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>
    </Tarjeta>
  );
}
