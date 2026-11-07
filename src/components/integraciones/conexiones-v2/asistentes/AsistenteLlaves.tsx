'use client';

/**
 * Asistente «llaves» (diseño 85-03…12): Wompi y las pasarelas que se conectan pegando llaves.
 * Ambiente → Dónde están las llaves → Pegar y probar → Webhook → Dónde se usa.
 *
 * Las llaves viven solo en el estado de este diálogo: se borran al cerrarlo, nunca van a
 * localStorage ni a los registros. Se prueban y guardan en el SERVIDOR
 * (`POST /api/integrations/conexiones/llaves`); si el proveedor no las acepta, no se guarda nada.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { AvisoTonal, FormField, StatusBadge, TarjetaSeleccionable } from '@/components/kit';
import { SelectorSucursalesMetodoPago } from '@/components/finanzas/metodos-pago/SucursalesMetodoPago';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { apiConexiones, ErrorApiConexiones, type ItemCatalogo, type Prueba } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { LLAVES, prefijoEsperado, validarFormatoLlaves, type Ambiente, type ErrorFormato } from '@/lib/services/integrations/conexiones/definicionesLlaves';
import { CampoCopiar, ListaNumerada, MarcoAsistente, type BotonMarco } from './MarcoAsistente';
import { claveFalloPrueba, estadoTrasPrueba, pasoAnterior, pasosLlaves, pasoSiguiente, verificacionesDePrueba, type EstadoPruebaUI, type PasoLlaves } from './pasosLogica';
import { useNombreServicio } from './useNombreServicio';

/** Panel del proveedor donde están las llaves (se abre en otra pestaña). */
const PANEL_PROVEEDOR: Record<string, string> = {
  wompi: 'https://comercios.wompi.co',
  mercadopago: 'https://www.mercadopago.com.co/developers/panel/app',
  payu: 'https://merchants.payulatam.com',
  stripe: 'https://dashboard.stripe.com/apikeys',
  paypal: 'https://developer.paypal.com/dashboard/applications',
  sendgrid: 'https://app.sendgrid.com/settings/api_keys',
};

export interface AsistenteLlavesProps {
  item: ItemCatalogo;
  abierto: boolean;
  onCerrar: () => void;
  onConectado: (conexionId: string | null) => void;
  /** Reemplazar las llaves de esta conexión (85-12). */
  conexionId?: string;
}

export function AsistenteLlaves({ item, abierto, onCerrar, onConectado, conexionId: conexionReemplazo }: AsistenteLlavesProps) {
  const t = useTranslations('integracionesConexiones');
  const nombre = useNombreServicio(item);
  const proveedor = item.llaves ?? 'wompi';
  const def = LLAVES[proveedor];
  const reemplazo = !!conexionReemplazo;
  const pasos = useMemo(() => pasosLlaves(def, reemplazo), [def, reemplazo]);

  const [paso, setPaso] = useState<PasoLlaves>(pasos[0]);
  const [ambiente, setAmbiente] = useState<Ambiente>(def.ambientes.includes('production') ? 'production' : def.ambientes[0]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [erroresFormato, setErroresFormato] = useState<ErrorFormato[]>([]);
  const [estadoPrueba, setEstadoPrueba] = useState<EstadoPruebaUI>('editando');
  const [prueba, setPrueba] = useState<Prueba | null>(null);
  const [aviso, setAviso] = useState<{ tono: 'peligro' | 'advertencia'; titulo: string; descripcion?: string } | null>(null);
  const [conexionId, setConexionId] = useState<string | null>(conexionReemplazo ?? null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [eventoRecibido, setEventoRecibido] = useState(false);
  const [uso, setUso] = useState<{ tienda: boolean; pos: boolean; sucursales: number[] | null }>({ tienda: def.usos.includes('tienda'), pos: def.usos.includes('pos'), sucursales: null });
  const [guardandoUso, setGuardandoUso] = useState(false);
  const [errorUso, setErrorUso] = useState<{ codigo: string; mensaje: string } | null>(null);
  const [listo, setListo] = useState(false);

  // Al cerrar se olvida todo, empezando por las llaves.
  const reiniciar = useCallback(() => {
    setPaso(pasos[0]);
    setValores({});
    setErroresFormato([]);
    setEstadoPrueba('editando');
    setPrueba(null);
    setAviso(null);
    setConexionId(conexionReemplazo ?? null);
    setWebhookUrl(null);
    setEventoRecibido(false);
    setErrorUso(null);
    setListo(false);
  }, [pasos, conexionReemplazo]);

  useEffect(() => {
    if (!abierto) reiniciar();
  }, [abierto, reiniciar]);

  // Reemplazo: el ambiente es el de la conexión.
  useEffect(() => {
    if (!abierto || !conexionReemplazo) return;
    let vivo = true;
    apiConexiones
      .detalle(conexionReemplazo)
      .then((d) => {
        if (vivo) setAmbiente(d.conexion.ambiente === 'production' ? 'production' : 'sandbox');
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [abierto, conexionReemplazo]);

  // Paso «Webhook»: se espera el primer evento ENTRANTE del proveedor.
  useEffect(() => {
    if (!abierto || paso !== 'webhook' || !conexionId || eventoRecibido) return;
    let vivo = true;
    const revisar = () =>
      apiConexiones
        .eventos({ conexion: conexionId, limite: 5 })
        .then((r) => {
          if (vivo && r.eventos.some((e) => e.sentido === 'inbound')) setEventoRecibido(true);
        })
        .catch(() => undefined);
    void revisar();
    const reloj = setInterval(revisar, 5000);
    return () => {
      vivo = false;
      clearInterval(reloj);
    };
  }, [abierto, paso, conexionId, eventoRecibido]);

  const cerrar = () => {
    reiniciar();
    onCerrar();
  };
  const irA = (p: PasoLlaves | null) => p && setPaso(p);
  const terminar = () => setListo(true);

  const probar = async () => {
    const errores = validarFormatoLlaves(proveedor, ambiente, valores);
    setErroresFormato(errores);
    setAviso(null);
    if (errores.length > 0) return;
    setEstadoPrueba('probando');
    try {
      const r = await apiConexiones.guardarLlaves({ proveedor, ambiente, valores, conexionId: conexionReemplazo ?? null });
      setPrueba(r.prueba);
      const estado = estadoTrasPrueba(r.prueba.resultado);
      setEstadoPrueba(estado);
      if (estado === 'correcta') {
        setValores({}); // ya están guardadas en el servidor: el navegador las olvida
        setConexionId(r.conexionId || conexionReemplazo || null);
        setWebhookUrl(r.webhookUrl);
        const sig = pasoSiguiente(pasos, 'prueba');
        if (sig) setPaso(sig);
        else terminar();
      }
    } catch (err) {
      setEstadoPrueba('editando');
      if (err instanceof ErrorApiConexiones) {
        if (err.codigo === 'FORMATO' && Array.isArray(err.extra.errores)) {
          setErroresFormato(err.extra.errores as ErrorFormato[]);
          return;
        }
        if (err.codigo === 'PENDIENTE_ACTIVAR') {
          setAviso({ tono: 'advertencia', titulo: t('asistente.llaves.pendienteActivar.titulo'), descripcion: t('asistente.llaves.pendienteActivar.descripcion') });
          return;
        }
        setAviso({ tono: 'peligro', titulo: t('asistente.llaves.errorGuardar'), descripcion: err.message });
        return;
      }
      setAviso({ tono: 'peligro', titulo: t('asistente.llaves.errorGuardar') });
    }
  };

  const guardarUso = async () => {
    if (!conexionId) return terminar();
    setGuardandoUso(true);
    setErrorUso(null);
    try {
      await apiConexiones.enlazarUso(conexionId, { tienda: uso.tienda, pos: uso.pos, sucursales: uso.sucursales ?? [] });
      terminar();
    } catch (err) {
      setErrorUso({
        codigo: err instanceof ErrorApiConexiones ? err.codigo : 'ERROR',
        mensaje: err instanceof Error ? err.message : t('comun.errorCarga'),
      });
    } finally {
      setGuardandoUso(false);
    }
  };

  const etiquetaPaso = (p: PasoLlaves) => t(`asistente.llaves.pasos.${p}`);
  const pasosStepper = pasos.map((p) => ({ valor: p, etiqueta: etiquetaPaso(p) }));
  const numero = pasos.indexOf(paso) + 1;
  const titulo = reemplazo ? t('asistente.llaves.tituloReemplazo', { nombre }) : t('asistente.comun.titulo', { nombre });
  const subtituloPaso = listo
    ? t('asistente.llaves.listo.subtitulo')
    : estadoPrueba === 'fallo' && paso === 'prueba'
      ? t('asistente.comun.pasoDe', { n: numero, total: pasos.length, texto: t('asistente.llaves.fallo.subtitulo') })
      : t('asistente.comun.pasoDe', { n: numero, total: pasos.length, texto: t(`asistente.llaves.subtitulos.${paso}`, { nombre }) });

  // ─── Contenido por paso ────────────────────────────────────────────────────

  let contenido: ReactNode;
  let botones: BotonMarco[];

  if (listo) {
    contenido = (
      <div className="flex flex-col gap-3">
        <AvisoTonal tono="exito" titulo={reemplazo ? t('asistente.llaves.listo.reemplazadas') : t('asistente.llaves.listo.titulo', { nombre })} descripcion={t('asistente.llaves.listo.descripcion')} />
        {!eventoRecibido && webhookUrl && <p className="text-sm text-fg-secondary">{t('asistente.llaves.listo.webhookPendiente')}</p>}
      </div>
    );
    botones = [{ etiqueta: t('asistente.llaves.listo.verConexion'), onClick: () => { const id = conexionId; reiniciar(); onConectado(id); } }];
  } else if (paso === 'ambiente') {
    contenido = (
      <div className="flex flex-col gap-3" role="radiogroup" aria-label={t('asistente.llaves.pasos.ambiente')}>
        {def.ambientes.map((a) => (
          <TarjetaSeleccionable
            key={a}
            rol="radio"
            orientacion="horizontal"
            titulo={t(`asistente.llaves.ambientes.${a}.titulo`)}
            descripcion={t(`asistente.llaves.ambientes.${a}.descripcion`, { nombre })}
            seleccionada={ambiente === a}
            onSeleccionar={() => setAmbiente(a)}
          />
        ))}
      </div>
    );
    botones = [
      { etiqueta: t('comun.cancelar'), onClick: cerrar },
      { etiqueta: t('comun.siguiente'), onClick: () => irA(pasoSiguiente(pasos, 'ambiente')) },
    ];
  } else if (paso === 'llaves') {
    const instrucciones = [1, 2, 3, 4]
      .map((n) => `asistente.llaves.donde.${proveedor}.p${n}`)
      .filter((k) => t.has(k))
      .map((k) => t(k, { ambiente: t(`asistente.llaves.ambientes.${ambiente}.titulo`) }));
    contenido = (
      <div className="flex flex-col gap-4">
        <ListaNumerada items={instrucciones} />
        {PANEL_PROVEEDOR[proveedor] && (
          <a
            href={PANEL_PROVEEDOR[proveedor]}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-subtle px-3 py-2.5 text-sm font-medium text-brand hover:underline"
          >
            {t('asistente.llaves.abrirPanel', { nombre })}
            <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        )}
        <AvisoTonal tono="advertencia" titulo={t('asistente.llaves.nuncaCompartas.titulo')} descripcion={t('asistente.llaves.nuncaCompartas.descripcion')} />
      </div>
    );
    botones = [
      { etiqueta: pasoAnterior(pasos, 'llaves') ? t('comun.atras') : t('comun.cancelar'), onClick: () => (pasoAnterior(pasos, 'llaves') ? irA(pasoAnterior(pasos, 'llaves')) : cerrar()) },
      { etiqueta: t('asistente.llaves.yaLasTengo'), onClick: () => irA('prueba') },
    ];
  } else if (paso === 'prueba' && estadoPrueba === 'fallo' && prueba) {
    const clave = claveFalloPrueba(prueba.resultado);
    const filas = verificacionesDePrueba(def.campos.map((c) => c.proposito), prueba);
    contenido = (
      <div className="flex flex-col gap-3">
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={t(`asistente.llaves.fallo.${clave}.titulo`, { nombre, http: prueba.http ?? '' })}
          descripcion={t(`asistente.llaves.fallo.${clave}.descripcion`, { nombre })}
        />
        <ul className="flex flex-col gap-2">
          {filas.map((f) => (
            <li key={f.proposito} className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-sm text-fg">
              <span>{t(`asistente.llaves.campos.${f.proposito}`)}</span>
              <StatusBadge
                estado={f.estado}
                tono={f.estado === 'listo' ? 'exito' : f.estado === 'rechazada' ? 'peligro' : 'neutro'}
                etiqueta={t(`asistente.llaves.verificacion.${f.estado}`)}
              />
            </li>
          ))}
        </ul>
      </div>
    );
    botones = [
      { etiqueta: t('asistente.llaves.cambiarLlaves'), onClick: () => { setEstadoPrueba('editando'); setPrueba(null); } },
      { etiqueta: t('comun.reintentar'), onClick: () => void probar(), variante: 'secundario', deshabilitado: Object.keys(valores).length === 0 },
    ];
  } else if (paso === 'prueba') {
    const errorDe = (p: string) => erroresFormato.find((e) => e.proposito === p);
    contenido = (
      <div className="flex flex-col gap-4">
        {aviso && <AvisoTonal tono={aviso.tono} titulo={aviso.titulo} descripcion={aviso.descripcion} rol="alert" />}
        {estadoPrueba === 'probando' && <AvisoTonal tono="informacion" rol="status" titulo={t('asistente.llaves.probando', { nombre })} />}
        {def.campos.map((c) => {
          const prefijo = prefijoEsperado(c, ambiente);
          const err = errorDe(c.proposito);
          const ayuda = [prefijo ? t('asistente.llaves.empiezaPor', { prefijo }) : null, c.secreto ? t('asistente.llaves.seCifra') : null].filter(Boolean).join(' · ');
          return (
            <FormField
              key={c.proposito}
              etiqueta={t(`asistente.llaves.campos.${c.proposito}`)}
              obligatorio={c.requerido}
              ayuda={ayuda || undefined}
              error={err ? t(`asistente.llaves.formato.${err.motivo}`, { prefijo: prefijo ?? '' }) : null}
            >
              <input
                type={c.secreto ? 'password' : 'text'}
                autoComplete="off"
                spellCheck={false}
                disabled={estadoPrueba === 'probando'}
                value={valores[c.proposito] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [c.proposito]: e.target.value }))}
                className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-tertiary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 aria-[invalid=true]:border-danger"
              />
            </FormField>
          );
        })}
        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('asistente.llaves.notaServidor')}</p>
      </div>
    );
    botones = [
      { etiqueta: t('comun.atras'), onClick: () => irA(pasoAnterior(pasos, 'prueba')), deshabilitado: estadoPrueba === 'probando' },
      { etiqueta: t('asistente.llaves.probarLlaves'), onClick: () => void probar(), cargando: estadoPrueba === 'probando' },
    ];
  } else if (paso === 'webhook') {
    contenido = (
      <div className="flex flex-col gap-4">
        <ListaNumerada
          items={[t('asistente.llaves.webhook.p1'), t(`asistente.llaves.webhook.donde.${proveedor}`), t('asistente.llaves.webhook.p3', { nombre })]}
        />
        {webhookUrl ? (
          <CampoCopiar valor={webhookUrl} etiquetaCopiar={t('comun.copiar')} etiquetaCopiado={t('comun.copiado')} />
        ) : (
          <AvisoTonal tono="advertencia" titulo={t('asistente.llaves.webhook.sinUrl')} />
        )}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-sm text-fg-secondary" role="status">
          <span>{eventoRecibido ? t('asistente.llaves.webhook.recibido', { nombre }) : t('asistente.llaves.webhook.esperando', { nombre })}</span>
          <StatusBadge
            estado={eventoRecibido ? 'recibido' : 'pendiente'}
            tono={eventoRecibido ? 'exito' : 'advertencia'}
            etiqueta={eventoRecibido ? t('asistente.llaves.webhook.conEventos') : t('asistente.llaves.webhook.sinEventos')}
          />
        </div>
      </div>
    );
    const sig = pasoSiguiente(pasos, 'webhook');
    botones = [
      { etiqueta: t('asistente.llaves.webhook.despues'), onClick: () => (sig ? irA(sig) : terminar()), variante: 'fantasma' },
      { etiqueta: t('comun.siguiente'), onClick: () => (sig ? irA(sig) : terminar()) },
    ];
  } else {
    // paso === 'uso'
    const organizationId = getOrganizationId();
    contenido = (
      <div className="flex flex-col gap-4">
        {def.usos.map((u) => (
          <TarjetaSeleccionable
            key={u}
            rol="checkbox"
            orientacion="horizontal"
            titulo={t(`asistente.llaves.uso.${u}.titulo`)}
            descripcion={t(`asistente.llaves.uso.${u}.descripcion`)}
            seleccionada={u === 'tienda' ? uso.tienda : uso.pos}
            onSeleccionar={() => setUso((x) => (u === 'tienda' ? { ...x, tienda: !x.tienda } : { ...x, pos: !x.pos }))}
          />
        ))}
        <p className="text-sm text-fg-secondary">{t('asistente.llaves.uso.metodo', { metodo: def.metodoPago ?? '' })}</p>
        {organizationId ? (
          <SelectorSucursalesMetodoPago organizationId={organizationId} valor={uso.sucursales} onChange={(v) => setUso((x) => ({ ...x, sucursales: v }))} />
        ) : null}
        <AvisoTonal tono="informacion" titulo={t('asistente.llaves.uso.cuentaDinero.titulo')} descripcion={t('asistente.llaves.uso.cuentaDinero.descripcion')} accion={{ etiqueta: t('asistente.llaves.uso.irMetodos'), href: '/app/finanzas/metodos-pago' }} />
        {errorUso && (
          <AvisoTonal
            tono={errorUso.codigo === 'METODO_EN_USO' ? 'advertencia' : 'peligro'}
            rol="alert"
            titulo={errorUso.codigo === 'METODO_EN_USO' ? t('asistente.llaves.uso.enUso') : t('asistente.llaves.uso.error')}
            descripcion={errorUso.mensaje}
            accion={errorUso.codigo === 'METODO_EN_USO' ? { etiqueta: t('asistente.llaves.uso.irMetodos'), href: '/app/finanzas/metodos-pago' } : undefined}
          />
        )}
      </div>
    );
    botones = [
      { etiqueta: t('asistente.llaves.uso.omitir'), onClick: terminar, variante: 'fantasma', deshabilitado: guardandoUso },
      { etiqueta: t('asistente.llaves.uso.guardar'), onClick: () => void guardarUso(), cargando: guardandoUso, deshabilitado: !uso.tienda && !uso.pos },
    ];
  }

  return (
    <MarcoAsistente
      abierto={abierto}
      onCerrar={cerrar}
      servicioId={item.id}
      titulo={titulo}
      subtitulo={subtituloPaso}
      pasos={listo ? undefined : pasosStepper}
      actual={paso}
      botones={botones}
      ocupado={estadoPrueba === 'probando' || guardandoUso}
    >
      {contenido}
    </MarcoAsistente>
  );
}
