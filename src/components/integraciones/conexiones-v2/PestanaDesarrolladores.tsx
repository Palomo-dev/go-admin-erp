'use client';

/**
 * Desarrolladores (diseño 85-15): llaves de API (creadas en el servidor con `crypto.randomBytes`;
 * se ve la llave completa UNA vez) y webhooks salientes con «Probar» real (envío firmado desde el
 * servidor y su código HTTP). Crear o editar un webhook sigue en su página existente.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ban, Copy, KeyRound, Send } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  DataTable,
  Dialogo,
  FormField,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ALCANCES_LLAVE } from '@/lib/services/integrations/conexiones/alcancesLlave';
import {
  apiConexiones,
  type LlaveApiResumen,
  type WebhookSalienteResumen,
} from '@/lib/services/integrations/conexiones/clienteConexiones';

const claveAlcance = (a: string) => a.replace(':', '_');

export function PestanaDesarrolladores() {
  const t = useTranslations('integracionesConexiones');
  const { formatDate, formatDateTime } = useFormatDate();
  const [llaves, setLlaves] = useState<LlaveApiResumen[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSalienteResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [nombre, setNombre] = useState('');
  const [alcances, setAlcances] = useState<string[]>([]);
  const [creando, setCreando] = useState(false);
  const [completa, setCompleta] = useState<string | null>(null);
  const [revocar, setRevocar] = useState<LlaveApiResumen | null>(null);
  const [probando, setProbando] = useState<string | null>(null);

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

  const crear = async () => {
    if (!nombre.trim() || alcances.length === 0) return;
    setCreando(true);
    try {
      const r = await apiConexiones.crearLlaveApi({ nombre: nombre.trim(), alcances });
      setNueva(false);
      setNombre('');
      setAlcances([]);
      setCompleta(r.completa);
      void cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('comun.errorCarga'));
    } finally {
      setCreando(false);
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
      toast.error(e instanceof Error ? e.message : t('comun.errorCarga'));
    }
  };

  const probarWebhook = async (w: WebhookSalienteResumen) => {
    setProbando(w.id);
    try {
      const r = await apiConexiones.probarWebhook(w.id);
      if (r.ok) toast.success(t('desarrolladores.webhooks.pruebaOk', { http: r.http ?? 0, ms: r.ms }));
      else if (r.motivo === 'tiempo') toast.error(t('desarrolladores.webhooks.pruebaTiempo'));
      else if (r.motivo === 'red') toast.error(t('desarrolladores.webhooks.pruebaRed'));
      else toast.error(t('desarrolladores.webhooks.pruebaFallo', { http: r.http ?? 0 }));
      void cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('comun.errorCarga'));
    } finally {
      setProbando(null);
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(t('comun.copiado'));
    } catch {
      toast.error(t('desarrolladores.llaves.noCopiada'));
    }
  };

  const estadoLlaves: EstadoTabla = cargando ? 'cargando' : error ? 'error' : llaves.length === 0 ? 'vacio' : 'listo';
  const estadoWebhooks: EstadoTabla = cargando ? 'cargando' : error ? 'error' : webhooks.length === 0 ? 'vacio' : 'listo';

  const columnasLlaves: ColumnaTabla<LlaveApiResumen>[] = [
    {
      id: 'nombre',
      encabezado: t('desarrolladores.llaves.col.nombre'),
      celda: (k) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{k.nombre}</p>
          {k.creada && <p className="truncate text-xs text-fg-muted">{t('desarrolladores.llaves.creada', { fecha: formatDate(k.creada) })}</p>}
        </div>
      ),
    },
    { id: 'llave', encabezado: t('desarrolladores.llaves.col.llave'), celda: (k) => k.mascara, variante: 'mono', ocultarDebajo: 'sm' },
    {
      id: 'permisos',
      encabezado: t('desarrolladores.llaves.col.permisos'),
      celda: (k) => k.alcances.map((a) => (t.has(`desarrolladores.alcances.${claveAlcance(a)}`) ? t(`desarrolladores.alcances.${claveAlcance(a)}`) : a)).join(' · '),
      ocultarDebajo: 'md',
    },
    {
      id: 'uso',
      encabezado: t('desarrolladores.llaves.col.ultimoUso'),
      celda: (k) => (k.ultimoUso ? formatDateTime(k.ultimoUso) : <span className="text-fg-muted">{t('desarrolladores.llaves.sinUso')}</span>),
      ocultarDebajo: 'lg',
    },
    {
      id: 'estado',
      encabezado: t('desarrolladores.llaves.col.estado'),
      celda: (k) => (
        <StatusBadge estado={k.activa ? 'activa' : 'revocada'} etiqueta={t(k.activa ? 'desarrolladores.llaves.activa' : 'desarrolladores.llaves.revocadaEstado')} tono={k.activa ? 'exito' : 'neutro'} />
      ),
    },
  ];

  const accionesLlave = (k: LlaveApiResumen): AccionFila[] =>
    k.activa ? [{ id: 'revocar', etiqueta: t('desarrolladores.llaves.revocar'), icono: Ban, destructiva: true, onSelect: () => setRevocar(k) }] : [];

  const columnasWebhooks: ColumnaTabla<WebhookSalienteResumen>[] = [
    {
      id: 'url',
      encabezado: t('desarrolladores.webhooks.col.direccion'),
      celda: (w) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-[13px] text-fg">{w.url}</p>
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
    {
      id: 'estado',
      encabezado: t('desarrolladores.webhooks.col.estado'),
      celda: (w) => {
        const fallando = w.activo && w.fallosSeguidos > 0;
        const clave = !w.activo ? 'inactivo' : fallando ? 'fallando' : 'activo';
        return <StatusBadge estado={clave} etiqueta={t(`desarrolladores.webhooks.estado.${clave}`)} tono={!w.activo ? 'neutro' : fallando ? 'peligro' : 'exito'} />;
      },
    },
  ];

  const accionesWebhook = (w: WebhookSalienteResumen): AccionFila[] => [
    { id: 'probar', etiqueta: t('desarrolladores.webhooks.probar'), icono: Send, onSelect: () => void probarWebhook(w), deshabilitada: probando === w.id },
  ];

  return (
    <div className="flex flex-col gap-6">
      <AvisoTonal tono="informacion" titulo={t('desarrolladores.avisoTitulo')} descripcion={t('desarrolladores.avisoTexto')} />

      <section aria-labelledby="dev-llaves" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="dev-llaves" className="text-base font-semibold text-fg">{t('desarrolladores.llaves.titulo')}</h2>
          <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} onClick={() => setNueva(true)}>
            <KeyRound aria-hidden="true" className="mr-1.5 size-4" />
            {t('desarrolladores.llaves.nueva')}
          </button>
        </div>
        <DataTable
          etiqueta={t('desarrolladores.llaves.titulo')}
          columnas={columnasLlaves}
          filas={llaves}
          obtenerId={(k) => k.id}
          estado={estadoLlaves}
          acciones={accionesLlave}
          etiquetaFila={(k) => k.nombre}
          onReintentar={() => void cargar()}
          error={{ titulo: t('comun.errorCarga'), descripcion: error ?? undefined }}
          vacio={{ titulo: t('desarrolladores.llaves.vacio'), compacto: true }}
        />
        <p className="text-xs text-fg-muted">{t('desarrolladores.llaves.nota')}</p>
      </section>

      <section aria-labelledby="dev-webhooks" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="dev-webhooks" className="text-base font-semibold text-fg">{t('desarrolladores.webhooks.titulo')}</h2>
          <Link href="/app/integraciones/webhooks-salientes" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            {t('desarrolladores.webhooks.nuevo')}
          </Link>
        </div>
        <DataTable
          etiqueta={t('desarrolladores.webhooks.titulo')}
          columnas={columnasWebhooks}
          filas={webhooks}
          obtenerId={(w) => w.id}
          estado={estadoWebhooks}
          acciones={accionesWebhook}
          etiquetaFila={(w) => w.url}
          onReintentar={() => void cargar()}
          error={{ titulo: t('comun.errorCarga'), descripcion: error ?? undefined }}
          vacio={{ titulo: t('desarrolladores.webhooks.vacio'), compacto: true }}
        />
      </section>

      <Dialogo
        abierto={nueva}
        onAbiertoChange={setNueva}
        titulo={t('desarrolladores.llaves.nueva')}
        icono={KeyRound}
        primario={{
          etiqueta: t('desarrolladores.llaves.crear'),
          onClick: () => void crear(),
          cargando: creando,
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
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          )}
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

      <Dialogo
        abierto={!!completa}
        onAbiertoChange={(v) => !v && setCompleta(null)}
        titulo={t('desarrolladores.llaves.unaVezTitulo')}
        descripcion={t('desarrolladores.llaves.unaVezTexto')}
        icono={KeyRound}
        primario={{ etiqueta: t('comun.copiar'), onClick: () => completa && void copiar(completa) }}
        textoCancelar={t('comun.cerrar')}
      >
        <div className="flex items-center gap-2 rounded-lg border border-line bg-subtle p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-fg">{completa}</code>
          <button type="button" aria-label={t('comun.copiar')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => completa && void copiar(completa)}>
            <Copy aria-hidden="true" className="size-4" />
          </button>
        </div>
      </Dialogo>

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
    </div>
  );
}
