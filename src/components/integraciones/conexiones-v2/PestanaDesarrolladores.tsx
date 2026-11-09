'use client';

/**
 * Desarrolladores (diseño 85-15): llaves de API y webhooks salientes, todo desde la pestaña (antes
 * «Nuevo webhook» mandaba a la página vieja). Paridad con `/api-keys` y `/webhooks-salientes`:
 *  - llaves: crear (la llave completa se ve UNA vez), editar nombre · permisos · vencimiento,
 *    duplicar, desactivar/activar, revocar y borrar; filtro de activas/revocadas en «Filtros»;
 *  - webhooks: crear (secreto de firma UNA vez), editar, duplicar, pausar/reactivar, enviar una
 *    prueba REAL firmada (código HTTP), nuevo secreto, borrar; último envío y su respuesta en la fila.
 * Toda escritura va por `/api/integrations/desarrolladores/**` (organización y permisos de la
 * sesión, en el servidor). En celular cada tabla pasa a tarjetas del kit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ban, Copy, CopyPlus, KeyRound, Pause, Pencil, Play, Plus, RefreshCw, Send, Trash2, Webhook } from 'lucide-react';
import {
  AvisoTonal,
  CampoFecha,
  ConfirmDialog,
  DataTable,
  Dialogo,
  FormField,
  FilaDato,
  ListCard,
  ListaDatos,
  PanelAdaptable,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ALCANCES_LLAVE } from '@/lib/services/integrations/conexiones/alcancesLlave';
import { EVENTOS_WEBHOOK, claveEventoWebhook } from '@/lib/services/integrations/conexiones/eventosWebhook';
import {
  apiConexiones,
  type LlaveApiResumen,
  type WebhookSalienteResumen,
} from '@/lib/services/integrations/conexiones/clienteConexiones';
import { filtrarLlaves, filtrarWebhooks, type Filtros } from './filtrosConexiones';

const claveAlcance = (a: string) => a.replace(':', '_');
const CLASE_INPUT = 'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

type ModoLlave = { modo: 'nueva' } | { modo: 'editar'; llave: LlaveApiResumen } | { modo: 'duplicar'; llave: LlaveApiResumen };
type ModoWebhook = { modo: 'nuevo' } | { modo: 'editar'; webhook: WebhookSalienteResumen } | { modo: 'duplicar'; webhook: WebhookSalienteResumen };

export interface PestanaDesarrolladoresProps {
  busqueda?: string;
  filtros?: Filtros;
  onLimpiarFiltros?: () => void;
}

export function PestanaDesarrolladores({ busqueda = '', filtros = {}, onLimpiarFiltros }: PestanaDesarrolladoresProps) {
  const t = useTranslations('integracionesConexiones');
  const { formatDate, formatDateTime, toInstant, toDate } = useFormatDate();
  const [llaves, setLlaves] = useState<LlaveApiResumen[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSalienteResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);

  // Llaves
  const [dialogoLlave, setDialogoLlave] = useState<ModoLlave | null>(null);
  const [nombre, setNombre] = useState('');
  const [alcances, setAlcances] = useState<string[]>([]);
  const [vence, setVence] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [completa, setCompleta] = useState<string | null>(null);
  const [creada, setCreada] = useState<LlaveApiResumen | null>(null);
  const [revocar, setRevocar] = useState<LlaveApiResumen | null>(null);
  const [borrarLlave, setBorrarLlave] = useState<LlaveApiResumen | null>(null);

  // Webhooks
  const [dialogoWebhook, setDialogoWebhook] = useState<ModoWebhook | null>(null);
  const [nombreWebhook, setNombreWebhook] = useState('');
  const [urlWebhook, setUrlWebhook] = useState('');
  const [eventos, setEventos] = useState<string[]>([]);
  const [errorWebhook, setErrorWebhook] = useState<string | null>(null);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [regenerar, setRegenerar] = useState<WebhookSalienteResumen | null>(null);
  const [borrarWebhook, setBorrarWebhook] = useState<WebhookSalienteResumen | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [l, w] = await Promise.all([apiConexiones.llavesApi(), apiConexiones.webhooks()]);
      setLlaves(l.llaves);
      setWebhooks(w.webhooks);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('comun.errorCarga'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const mensajeError = (e: unknown) => (e instanceof Error ? e.message : t('comun.errorCarga'));

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(t('comun.copiado'));
    } catch {
      toast.error(t('desarrolladores.llaves.noCopiada'));
    }
  };

  // ── Llaves ────────────────────────────────────────────────────────────────

  const abrirLlave = (m: ModoLlave) => {
    const base = m.modo === 'nueva' ? null : m.llave;
    setNombre(base ? (m.modo === 'duplicar' ? t('desarrolladores.llaves.copiaDe', { nombre: base.nombre }) : base.nombre) : '');
    setAlcances(base ? [...base.alcances] : []);
    setVence(base?.expira && m.modo === 'editar' ? toDate(new Date(base.expira)) : '');
    setDialogoLlave(m);
  };

  const guardarLlave = async () => {
    if (!dialogoLlave || !nombre.trim() || alcances.length === 0) return;
    setGuardando(true);
    // El vencimiento se guarda al final del día elegido, en la zona de la organización.
    const expira = vence ? toInstant(vence, '23:59') : null;
    try {
      if (dialogoLlave.modo === 'editar') {
        await apiConexiones.editarLlaveApi(dialogoLlave.llave.id, { nombre: nombre.trim(), alcances, expira });
        toast.success(t('desarrolladores.llaves.editada', { nombre: nombre.trim() }));
      } else {
        const r = await apiConexiones.crearLlaveApi({ nombre: nombre.trim(), alcances, expira });
        setCreada(r.llave);
        setCompleta(r.completa);
      }
      setDialogoLlave(null);
      void cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarActiva = async (k: LlaveApiResumen) => {
    setOcupada(k.id);
    try {
      await apiConexiones.editarLlaveApi(k.id, { activa: !k.activa });
      toast.success(t(k.activa ? 'desarrolladores.llaves.desactivada' : 'desarrolladores.llaves.activada', { nombre: k.nombre }));
      void cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setOcupada(null);
    }
  };

  const confirmarRevocar = async () => {
    if (!revocar) return;
    try {
      await apiConexiones.revocarLlaveApi(revocar.id);
      toast.success(t('desarrolladores.llaves.revocada', { nombre: revocar.nombre }));
      setRevocar(null);
      void cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    }
  };

  const confirmarBorrarLlave = async () => {
    if (!borrarLlave) return;
    try {
      await apiConexiones.borrarLlaveApi(borrarLlave.id);
      toast.success(t('desarrolladores.llaves.borrada', { nombre: borrarLlave.nombre }));
      setBorrarLlave(null);
      void cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    }
  };

  // ── Webhooks ──────────────────────────────────────────────────────────────

  const abrirWebhook = (m: ModoWebhook) => {
    const base = m.modo === 'nuevo' ? null : m.webhook;
    setNombreWebhook(base ? (m.modo === 'duplicar' ? t('desarrolladores.llaves.copiaDe', { nombre: base.nombre }) : base.nombre) : '');
    setUrlWebhook(base?.url ?? '');
    setEventos(base ? [...base.eventos] : []);
    setErrorWebhook(null);
    setDialogoWebhook(m);
  };

  const guardarWebhook = async () => {
    if (!dialogoWebhook || !nombreWebhook.trim() || !urlWebhook.trim() || eventos.length === 0) return;
    setGuardando(true);
    setErrorWebhook(null);
    try {
      if (dialogoWebhook.modo === 'editar') {
        await apiConexiones.editarWebhook(dialogoWebhook.webhook.id, { nombre: nombreWebhook.trim(), url: urlWebhook.trim(), eventos });
        toast.success(t('desarrolladores.webhooks.editado'));
      } else {
        const r = await apiConexiones.crearWebhook({ nombre: nombreWebhook.trim(), url: urlWebhook.trim(), eventos });
        setSecreto(r.secreto);
      }
      setDialogoWebhook(null);
      void cargar();
    } catch (e) {
      // La dirección se rechaza en el servidor (HTTPS, pública): el motivo se muestra junto al campo.
      setErrorWebhook(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarActivo = async (w: WebhookSalienteResumen) => {
    setOcupada(w.id);
    try {
      await apiConexiones.editarWebhook(w.id, { activo: !w.activo });
      toast.success(t(w.activo ? 'desarrolladores.webhooks.pausado' : 'desarrolladores.webhooks.reactivado'));
      void cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setOcupada(null);
    }
  };

  const probarWebhook = async (w: WebhookSalienteResumen) => {
    setOcupada(w.id);
    try {
      const r = await apiConexiones.probarWebhook(w.id);
      if (r.ok) toast.success(t('desarrolladores.webhooks.pruebaOk', { http: r.http ?? 0, ms: r.ms }));
      else if (r.motivo === 'tiempo') toast.error(t('desarrolladores.webhooks.pruebaTiempo'));
      else if (r.motivo === 'red') toast.error(t('desarrolladores.webhooks.pruebaRed'));
      else toast.error(t('desarrolladores.webhooks.pruebaFallo', { http: r.http ?? 0 }));
      void cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setOcupada(null);
    }
  };

  const confirmarRegenerar = async () => {
    if (!regenerar) return;
    try {
      const r = await apiConexiones.regenerarSecretoWebhook(regenerar.id);
      setRegenerar(null);
      setSecreto(r.secreto);
      void cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    }
  };

  const confirmarBorrarWebhook = async () => {
    if (!borrarWebhook) return;
    try {
      await apiConexiones.borrarWebhook(borrarWebhook.id);
      toast.success(t('desarrolladores.webhooks.borrado'));
      setBorrarWebhook(null);
      void cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    }
  };

  // ── Tablas ────────────────────────────────────────────────────────────────

  const llavesVisibles = useMemo(() => filtrarLlaves(llaves, filtros, busqueda), [llaves, filtros, busqueda]);
  const webhooksVisibles = useMemo(() => filtrarWebhooks(webhooks, busqueda), [webhooks, busqueda]);
  const hayCriterios = busqueda.trim() !== '' || Object.values(filtros).some(Boolean);

  const estadoLlaves: EstadoTabla = cargando ? 'cargando' : error ? 'error' : llaves.length === 0 ? 'vacio' : llavesVisibles.length === 0 ? 'sinResultados' : 'listo';
  const estadoWebhooks: EstadoTabla = cargando ? 'cargando' : error ? 'error' : webhooks.length === 0 ? 'vacio' : webhooksVisibles.length === 0 ? 'sinResultados' : 'listo';

  const vencida = (k: LlaveApiResumen) => !!k.expira && Date.parse(k.expira) < Date.now();
  const badgeLlave = (k: LlaveApiResumen) => {
    const clave = k.revocada ? 'revocada' : vencida(k) ? 'vencida' : k.activa ? 'activa' : 'inactiva';
    const tono = clave === 'activa' ? 'exito' : clave === 'vencida' ? 'advertencia' : 'neutro';
    return <StatusBadge estado={clave} etiqueta={t(`desarrolladores.llaves.estado.${clave}`)} tono={tono} />;
  };
  const textoAlcances = (k: LlaveApiResumen) =>
    k.alcances.map((a) => (t.has(`desarrolladores.alcances.${claveAlcance(a)}`) ? t(`desarrolladores.alcances.${claveAlcance(a)}`) : a)).join(' · ');
  const subtituloLlave = (k: LlaveApiResumen) =>
    [
      k.creada && k.creadaPor
        ? t('desarrolladores.llaves.creadaPor', { nombre: k.creadaPor, fecha: formatDate(k.creada) })
        : k.creada
          ? t('desarrolladores.llaves.creada', { fecha: formatDate(k.creada) })
          : null,
      k.expira ? t('desarrolladores.llaves.vence', { fecha: formatDate(k.expira) }) : null].filter(Boolean).join(' · ');

  const columnasLlaves: ColumnaTabla<LlaveApiResumen>[] = [
    {
      id: 'nombre',
      encabezado: t('desarrolladores.llaves.col.nombre'),
      celda: (k) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{k.nombre}</p>
          <p className="truncate text-xs text-fg-muted">{subtituloLlave(k)}</p>
        </div>
      ),
    },
    { id: 'llave', encabezado: t('desarrolladores.llaves.col.llave'), celda: (k) => k.mascara, variante: 'mono', ocultarDebajo: 'sm' },
    { id: 'permisos', encabezado: t('desarrolladores.llaves.col.permisos'), celda: textoAlcances, ocultarDebajo: 'md' },
    {
      id: 'uso',
      encabezado: t('desarrolladores.llaves.col.ultimoUso'),
      celda: (k) => (k.ultimoUso ? formatDateTime(k.ultimoUso) : <span className="text-fg-muted">{t('desarrolladores.llaves.sinUso')}</span>),
      ocultarDebajo: 'lg',
    },
    { id: 'estado', encabezado: t('desarrolladores.llaves.col.estado'), celda: badgeLlave },
  ];

  const accionesLlave = (k: LlaveApiResumen): AccionFila[] => {
    if (k.revocada) {
      return [{ id: 'borrar', etiqueta: t('desarrolladores.llaves.borrar'), icono: Trash2, destructiva: true, onSelect: () => setBorrarLlave(k) }];
    }
    return [
      { id: 'editar', etiqueta: t('desarrolladores.llaves.editar'), icono: Pencil, onSelect: () => abrirLlave({ modo: 'editar', llave: k }) },
      { id: 'duplicar', etiqueta: t('desarrolladores.llaves.duplicar'), icono: CopyPlus, onSelect: () => abrirLlave({ modo: 'duplicar', llave: k }) },
      {
        id: 'activa',
        etiqueta: t(k.activa ? 'desarrolladores.llaves.desactivar' : 'desarrolladores.llaves.activar'),
        icono: k.activa ? Pause : Play,
        onSelect: () => void cambiarActiva(k),
        deshabilitada: ocupada === k.id,
      },
      { id: 'revocar', etiqueta: t('desarrolladores.llaves.revocar'), icono: Ban, destructiva: true, onSelect: () => setRevocar(k) },
      { id: 'borrar', etiqueta: t('desarrolladores.llaves.borrar'), icono: Trash2, destructiva: true, onSelect: () => setBorrarLlave(k) },
    ];
  };

  const nombreEvento = (e: string) => {
    const clave = `desarrolladores.webhooks.eventosLista.${claveEventoWebhook(e)}`;
    return t.has(clave) ? t(clave) : e;
  };
  const estadoWebhook = (w: WebhookSalienteResumen) => (!w.activo ? 'inactivo' : w.fallosSeguidos > 0 ? 'fallando' : 'activo');
  const badgeWebhook = (w: WebhookSalienteResumen) => {
    const clave = estadoWebhook(w);
    return <StatusBadge estado={clave} etiqueta={t(`desarrolladores.webhooks.estado.${clave}`)} tono={clave === 'inactivo' ? 'neutro' : clave === 'fallando' ? 'peligro' : 'exito'} />;
  };
  const textoEnvio = (w: WebhookSalienteResumen) =>
    !w.registroDeEnvios
      ? t('desarrolladores.webhooks.pendienteActivar')
      : w.ultimoEnvio
        ? `${formatDateTime(w.ultimoEnvio)} · ${t('desarrolladores.webhooks.respuesta', { http: w.ultimaRespuesta ?? 0 })}${w.fallosSeguidos > 0 ? ` · ${t('desarrolladores.webhooks.fallos', { n: w.fallosSeguidos })}` : ''}`
        : t('desarrolladores.webhooks.nunca');

  const columnasWebhooks: ColumnaTabla<WebhookSalienteResumen>[] = [
    {
      id: 'url',
      encabezado: t('desarrolladores.webhooks.col.direccion'),
      celda: (w) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{w.nombre}</p>
          <p className="truncate font-mono text-[13px] text-fg-secondary">{w.url}</p>
          <p className="truncate text-xs text-fg-muted">
            {w.secreto ? t('desarrolladores.webhooks.firmado', { secreto: w.secreto }) : t('desarrolladores.webhooks.sinFirma')}
          </p>
        </div>
      ),
    },
    { id: 'eventos', encabezado: t('desarrolladores.webhooks.col.eventos'), celda: (w) => t('desarrolladores.webhooks.nEventos', { n: w.eventos.length }), ocultarDebajo: 'md' },
    {
      id: 'envio',
      encabezado: t('desarrolladores.webhooks.col.ultimoEnvio'),
      celda: (w) =>
        !w.registroDeEnvios ? (
          <span className="text-fg-muted">{t('desarrolladores.webhooks.pendienteActivar')}</span>
        ) : w.ultimoEnvio ? (
          <div>
            <p>{formatDateTime(w.ultimoEnvio)}</p>
            <p className="text-xs text-fg-muted">
              {t('desarrolladores.webhooks.respuesta', { http: w.ultimaRespuesta ?? 0 })}
              {w.fallosSeguidos > 0 ? ` · ${t('desarrolladores.webhooks.fallos', { n: w.fallosSeguidos })}` : ''}
            </p>
          </div>
        ) : (
          <span className="text-fg-muted">{t('desarrolladores.webhooks.nunca')}</span>
        ),
      ocultarDebajo: 'lg',
    },
    { id: 'estado', encabezado: t('desarrolladores.webhooks.col.estado'), celda: badgeWebhook },
  ];

  const accionesWebhook = (w: WebhookSalienteResumen): AccionFila[] => [
    { id: 'probar', etiqueta: t('desarrolladores.webhooks.probar'), icono: Send, onSelect: () => void probarWebhook(w), deshabilitada: ocupada === w.id },
    { id: 'editar', etiqueta: t('desarrolladores.webhooks.editar'), icono: Pencil, onSelect: () => abrirWebhook({ modo: 'editar', webhook: w }) },
    { id: 'duplicar', etiqueta: t('desarrolladores.webhooks.duplicar'), icono: CopyPlus, onSelect: () => abrirWebhook({ modo: 'duplicar', webhook: w }) },
    {
      id: 'activo',
      etiqueta: t(w.activo ? 'desarrolladores.webhooks.pausar' : 'desarrolladores.webhooks.reactivar'),
      icono: w.activo ? Pause : Play,
      onSelect: () => void cambiarActivo(w),
      deshabilitada: ocupada === w.id,
    },
    { id: 'secreto', etiqueta: t('desarrolladores.webhooks.regenerarSecreto'), icono: RefreshCw, onSelect: () => setRegenerar(w), separadorAntes: true },
    { id: 'borrar', etiqueta: t('desarrolladores.webhooks.borrar'), icono: Trash2, destructiva: true, onSelect: () => setBorrarWebhook(w) },
  ];

  const dialogoLlaveAbierto = !!dialogoLlave;
  const dialogoWebhookAbierto = !!dialogoWebhook;

  return (
    <div className="flex flex-col gap-6">
      <AvisoTonal tono="informacion" titulo={t('desarrolladores.avisoTitulo')} descripcion={t('desarrolladores.avisoTexto')} />

      <section aria-labelledby="dev-llaves" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="dev-llaves" className="text-base font-semibold text-fg">{t('desarrolladores.llaves.titulo')}</h2>
          <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} onClick={() => abrirLlave({ modo: 'nueva' })}>
            <Plus aria-hidden="true" className="mr-1.5 size-4" />
            {t('desarrolladores.llaves.nueva')}
          </button>
        </div>
        <DataTable
          etiqueta={t('desarrolladores.llaves.titulo')}
          columnas={columnasLlaves}
          filas={llavesVisibles}
          obtenerId={(k) => k.id}
          estado={estadoLlaves}
          acciones={accionesLlave}
          etiquetaFila={(k) => k.nombre}
          // Celular (85-53): nombre + estado, «máscara · permisos» y «creada … · último uso …»; «⋯» por llave.
          tarjetaMovil={(k) => (
            <ListCard
              titulo={k.nombre}
              insignia={badgeLlave(k)}
              subtitulo={`${k.mascara} · ${textoAlcances(k)}`}
              meta={[subtituloLlave(k), k.ultimoUso ? t('desarrolladores.llaves.ultimoUsoEl', { fecha: formatDateTime(k.ultimoUso) }) : t('desarrolladores.llaves.sinUso')].filter(Boolean).join(' · ')}
              acciones={accionesLlave(k)}
            />
          )}
          termino={busqueda}
          onLimpiarFiltros={hayCriterios ? onLimpiarFiltros : undefined}
          onReintentar={() => void cargar()}
          error={{ titulo: t('comun.errorCarga'), descripcion: error ?? undefined }}
          vacio={{ titulo: t('desarrolladores.llaves.vacio'), compacto: true }}
        />
        <p className="text-xs text-fg-muted">{t('desarrolladores.llaves.nota')}</p>
      </section>

      <section aria-labelledby="dev-webhooks" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="dev-webhooks" className="text-base font-semibold text-fg">{t('desarrolladores.webhooks.titulo')}</h2>
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => abrirWebhook({ modo: 'nuevo' })}>
            <Plus aria-hidden="true" className="mr-1.5 size-4" />
            {t('desarrolladores.webhooks.nuevo')}
          </button>
        </div>
        <DataTable
          etiqueta={t('desarrolladores.webhooks.titulo')}
          columnas={columnasWebhooks}
          filas={webhooksVisibles}
          obtenerId={(w) => w.id}
          estado={estadoWebhooks}
          acciones={accionesWebhook}
          etiquetaFila={(w) => w.nombre || w.url}
          // Celular (85-53): dirección + estado, eventos y «último envío · respuesta · secreto»; «⋯» por webhook.
          tarjetaMovil={(w) => (
            <ListCard
              titulo={w.url.replace(/^https:\/\//, '')}
              insignia={badgeWebhook(w)}
              subtitulo={[w.nombre, ...w.eventos.slice(0, 2).map(nombreEvento), t('desarrolladores.webhooks.nEventos', { n: w.eventos.length })].filter(Boolean).join(' · ')}
              meta={[textoEnvio(w), w.secreto ? t('desarrolladores.webhooks.firmado', { secreto: w.secreto }) : t('desarrolladores.webhooks.sinFirma')].join(' · ')}
              acciones={accionesWebhook(w)}
            />
          )}
          termino={busqueda}
          onLimpiarFiltros={hayCriterios ? onLimpiarFiltros : undefined}
          onReintentar={() => void cargar()}
          error={{ titulo: t('comun.errorCarga'), descripcion: error ?? undefined }}
          vacio={{ titulo: t('desarrolladores.webhooks.vacio'), compacto: true }}
        />
      </section>

      {/* Llave: nueva · editar · duplicar */}
      <Dialogo
        abierto={dialogoLlaveAbierto}
        onAbiertoChange={(v) => !v && setDialogoLlave(null)}
        titulo={dialogoLlave?.modo === 'editar' ? t('desarrolladores.llaves.editarTitulo', { nombre: dialogoLlave.llave.nombre }) : t('desarrolladores.llaves.nueva')}
        icono={KeyRound}
        primario={{
          etiqueta: dialogoLlave?.modo === 'editar' ? t('comun.guardar') : t('desarrolladores.llaves.crear'),
          onClick: () => void guardarLlave(),
          cargando: guardando,
          deshabilitada: !nombre.trim() || alcances.length === 0,
          motivo: t('desarrolladores.llaves.faltan'),
        }}
        textoCancelar={t('comun.cancelar')}
      >
        <FormField etiqueta={t('desarrolladores.llaves.nombre')} obligatorio>
          {(p) => (
            <input
              id={p.id}
              aria-describedby={p['aria-describedby']}
              aria-invalid={p['aria-invalid']}
              aria-required={p['aria-required']}
              value={nombre}
              maxLength={80}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={t('desarrolladores.llaves.nombreEjemplo')}
              className={CLASE_INPUT}
            />
          )}
        </FormField>
        <FormField etiqueta={t('desarrolladores.llaves.vencimiento')} ayuda={t('desarrolladores.llaves.vencimientoAyuda')}>
          {(p) => <CampoFecha id={p.id} valor={vence} onValorChange={setVence} min={toDate(new Date())} limpiable />}
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">{t('desarrolladores.llaves.permisos')}</legend>
          {ALCANCES_LLAVE.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                className="size-4 accent-brand-action"
                checked={alcances.includes(a)}
                onChange={(e) => setAlcances((prev) => (e.target.checked ? [...prev, a] : prev.filter((x) => x !== a)))}
              />
              {t(`desarrolladores.alcances.${claveAlcance(a)}`)}
            </label>
          ))}
        </fieldset>
      </Dialogo>

      {/* Llave completa, una sola vez (85-53c: hoja en celular, diálogo en escritorio) */}
      <PanelAdaptable
        abierto={!!completa}
        onAbiertoChange={(v) => !v && setCompleta(null)}
        titulo={t('desarrolladores.llaves.creadaTitulo')}
        icono={KeyRound}
        ancho={520}
        pie={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setCompleta(null)}>
              {t('desarrolladores.llaves.listo')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => completa && void copiar(completa)}>
              <Copy aria-hidden="true" className="size-4" />
              {t('desarrolladores.llaves.copiarLlave')}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <AvisoTonal tono="advertencia" rol="alert" titulo={t('desarrolladores.llaves.unaVezTitulo')} descripcion={t('desarrolladores.llaves.unaVezTexto')} />
          <div className="flex items-center gap-2 rounded-lg border border-line bg-subtle p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-fg">{completa}</code>
            <button type="button" aria-label={t('comun.copiar')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => completa && void copiar(completa)}>
              <Copy aria-hidden="true" className="size-4" />
            </button>
          </div>
          <ListaDatos etiqueta={t('desarrolladores.llaves.creadaTitulo')}>
            <FilaDato etiqueta={t('desarrolladores.llaves.nombre')} valor={creada?.nombre ?? ''} />
            <FilaDato etiqueta={t('desarrolladores.llaves.permisos')} valor={creada ? textoAlcances(creada) : ''} />
            {creada?.creada && (
              <FilaDato
                etiqueta={t('desarrolladores.llaves.creadaPorEtiqueta')}
                valor={[creada.creadaPor, formatDateTime(creada.creada)].filter(Boolean).join(' · ')}
              />
            )}
          </ListaDatos>
        </div>
      </PanelAdaptable>

      <ConfirmDialog
        abierto={!!revocar}
        onAbiertoChange={(v) => !v && setRevocar(null)}
        titulo={t('desarrolladores.llaves.revocarTitulo')}
        descripcion={t('desarrolladores.llaves.revocarTexto', { nombre: revocar?.nombre ?? '' })}
        textoConfirmar={t('desarrolladores.llaves.revocar')}
        textoCancelar={t('comun.cancelar')}
        onConfirmar={confirmarRevocar}
        tono="peligro"
      />
      <ConfirmDialog
        abierto={!!borrarLlave}
        onAbiertoChange={(v) => !v && setBorrarLlave(null)}
        titulo={t('desarrolladores.llaves.borrarTitulo', { nombre: borrarLlave?.nombre ?? '' })}
        descripcion={t('desarrolladores.llaves.borrarTexto')}
        textoConfirmar={t('desarrolladores.llaves.borrar')}
        textoCancelar={t('comun.cancelar')}
        onConfirmar={confirmarBorrarLlave}
        tono="peligro"
      />

      {/* Webhook: nuevo · editar · duplicar */}
      <Dialogo
        abierto={dialogoWebhookAbierto}
        onAbiertoChange={(v) => !v && setDialogoWebhook(null)}
        titulo={dialogoWebhook?.modo === 'editar' ? t('desarrolladores.webhooks.editarTitulo') : t('desarrolladores.webhooks.nuevo')}
        icono={Webhook}
        ancho={560}
        primario={{
          etiqueta: dialogoWebhook?.modo === 'editar' ? t('comun.guardar') : t('desarrolladores.webhooks.crear'),
          onClick: () => void guardarWebhook(),
          cargando: guardando,
          deshabilitada: !nombreWebhook.trim() || !urlWebhook.trim() || eventos.length === 0,
          motivo: t('desarrolladores.webhooks.faltan'),
        }}
        textoCancelar={t('comun.cancelar')}
      >
        <FormField etiqueta={t('desarrolladores.webhooks.nombre')} obligatorio>
          {(p) => (
            <input
              id={p.id}
              aria-describedby={p['aria-describedby']}
              aria-invalid={p['aria-invalid']}
              aria-required={p['aria-required']}
              value={nombreWebhook}
              maxLength={80}
              onChange={(e) => setNombreWebhook(e.target.value)}
              placeholder={t('desarrolladores.webhooks.nombreEjemplo')}
              className={CLASE_INPUT}
            />
          )}
        </FormField>
        <FormField etiqueta={t('desarrolladores.webhooks.url')} obligatorio ayuda={t('desarrolladores.webhooks.urlAyuda')} error={errorWebhook}>
          {(p) => (
            <input
              id={p.id}
              type="url"
              inputMode="url"
              aria-describedby={p['aria-describedby']}
              aria-invalid={p['aria-invalid']}
              aria-required={p['aria-required']}
              value={urlWebhook}
              maxLength={2048}
              onChange={(e) => setUrlWebhook(e.target.value)}
              placeholder={t('desarrolladores.webhooks.urlEjemplo')}
              className={`${CLASE_INPUT} font-mono`}
            />
          )}
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">{t('desarrolladores.webhooks.eventosTitulo')}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EVENTOS_WEBHOOK.map((e) => (
              <label key={e} className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-action"
                  checked={eventos.includes(e)}
                  onChange={(ev) => setEventos((prev) => (ev.target.checked ? [...prev, e] : prev.filter((x) => x !== e)))}
                />
                {t(`desarrolladores.webhooks.eventosLista.${claveEventoWebhook(e)}`)}
              </label>
            ))}
          </div>
        </fieldset>
      </Dialogo>

      {/* Secreto de firma, una sola vez (misma hoja que la llave creada) */}
      <PanelAdaptable
        abierto={!!secreto}
        onAbiertoChange={(v) => !v && setSecreto(null)}
        titulo={t('desarrolladores.webhooks.secretoTitulo')}
        icono={Webhook}
        ancho={520}
        pie={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setSecreto(null)}>
              {t('desarrolladores.llaves.listo')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => secreto && void copiar(secreto)}>
              <Copy aria-hidden="true" className="size-4" />
              {t('desarrolladores.webhooks.copiarSecreto')}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <AvisoTonal tono="advertencia" rol="alert" titulo={t('desarrolladores.llaves.unaVezTitulo')} descripcion={t('desarrolladores.webhooks.secretoTexto')} />
          <div className="flex items-center gap-2 rounded-lg border border-line bg-subtle p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-fg">{secreto}</code>
            <button type="button" aria-label={t('comun.copiar')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => secreto && void copiar(secreto)}>
              <Copy aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      </PanelAdaptable>

      <ConfirmDialog
        abierto={!!regenerar}
        onAbiertoChange={(v) => !v && setRegenerar(null)}
        titulo={t('desarrolladores.webhooks.regenerarTitulo')}
        descripcion={t('desarrolladores.webhooks.regenerarTexto')}
        textoConfirmar={t('desarrolladores.webhooks.regenerarSecreto')}
        textoCancelar={t('comun.cancelar')}
        onConfirmar={confirmarRegenerar}
        tono="advertencia"
      />
      <ConfirmDialog
        abierto={!!borrarWebhook}
        onAbiertoChange={(v) => !v && setBorrarWebhook(null)}
        titulo={t('desarrolladores.webhooks.borrarTitulo')}
        descripcion={t('desarrolladores.webhooks.borrarTexto')}
        textoConfirmar={t('desarrolladores.webhooks.borrar')}
        textoCancelar={t('comun.cancelar')}
        onConfirmar={confirmarBorrarWebhook}
        tono="peligro"
      />
    </div>
  );
}
