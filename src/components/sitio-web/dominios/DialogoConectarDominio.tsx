'use client';

/**
 * Conectar un dominio que ya tienes (Figma B/07-06…07-12, móvil B/07-26).
 * Diálogo ÚNICO del flujo: lo abren Dominios (cabecera, vacío, «Registros» y
 * «Revisar» de una fila), Sedes en la web y el asistente con
 * `?accion=conectar[&sede=<id>]`. Reemplaza a `AddCustomDomainDialog`.
 *
 * Fases: 1 escribir → 2 registros DNS → 3 verificando, y los resultados que
 * decide el SERVIDOR (`verificacion.ts`): activo con SSL, mal configurado, en
 * uso en otro sitio y propagación pendiente. Los registros nunca se calculan
 * aquí: llegan de la API.
 */
import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AvisoTonal, BarraProgreso, FormField, PanelAdaptable, SettingRow, clasesBoton, useEsEscritorio } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/Utils';
import { DnsRecordRow } from '../ui/DnsRecordRow';
import { DomainStatusBadge } from '../ui/DomainStatusBadge';
import { ProviderGuideTabs, type ProveedorDns } from '../ui/ProviderGuideTabs';
import { GUIAS_PROVEEDOR } from '@/lib/services/website/dominios/proveedores';
import { apiDominios, ErrorApiDominios, mensajeDeError } from './apiDominios';
import { esHostValido, normalizarHost, textoRegistros } from './nombreDns';
import { ICONO_ACCION_DOMINIO as ICONO, ICONO_RESULTADO_CONECTAR as RESULTADO, IconoBoton, IconoDominio } from './iconosDominios';
import { ListaCheck } from './piezasFlujo';
import type { DominioSitio, RegistroDns, RespuestaConectar, RespuestaVerificacion } from './tiposDominios';
import { useTextosDominios } from './textos';
import { useFormatoDominio } from './useFormatoDominio';

/** Nombre visible del proveedor detectado (marcas de terceros, tal cual). */
const NOMBRE_PROVEEDOR: Record<Exclude<ProveedorDns, 'otro'>, string> = {
  godaddy: 'GoDaddy',
  hostinger: 'Hostinger',
  cloudflare: 'Cloudflare',
  namecheap: 'Namecheap',
};

export type InicioConectar = { modo: 'nuevo' } | { modo: 'registros'; dominio: DominioSitio } | { modo: 'revisar'; dominio: DominioSitio };

export interface DialogoConectarDominioProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  inicio: InicioConectar;
  /** Sede preseleccionada (`?sede=`): solo se muestra; el servidor la valida. */
  sede?: { id: number; nombre: string } | null;
  conectar: (host: string, sedeId?: number | null) => Promise<RespuestaConectar>;
  verificar: (id: string) => Promise<RespuestaVerificacion>;
  hacerPrincipal: (id: string) => Promise<DominioSitio>;
  /** Hosts que pasarían a redirigir al nuevo principal («tumarca.com y tu-marca.goadmin.io»). */
  otrosHosts: readonly string[];
  /** «¿No tienes dominio? Cómpralo aquí». */
  onIrAComprar: () => void;
}

type Fase = 'escribir' | 'registros' | 'resultado' | 'en_otra';

export function DialogoConectarDominio({ abierto, onAbiertoChange, inicio, sede, conectar, verificar, hacerPrincipal, otrosHosts, onIrAComprar }: DialogoConectarDominioProps) {
  const t = useTextosDominios();
  const f = useFormatoDominio();
  const escritorio = useEsEscritorio();
  const [fase, setFase] = useState<Fase>('escribir');
  const [entrada, setEntrada] = useState('');
  const [tocado, setTocado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dominio, setDominio] = useState<DominioSitio | null>(null);
  const [registros, setRegistros] = useState<RegistroDns[]>([]);
  const [proveedor, setProveedor] = useState<ProveedorDns>('otro');
  const [conexionAutomatica, setConexionAutomatica] = useState(true);
  const [verificacion, setVerificacion] = useState<RespuestaVerificacion | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [principalOcupado, setPrincipalOcupado] = useState(false);

  // Al abrir: fase según desde dónde se entra.
  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setVerificacion(null);
    setTocado(false);
    setCopiado(false);
    if (inicio.modo === 'nuevo') {
      setFase('escribir');
      setEntrada('');
      setDominio(null);
      setRegistros([]);
      return;
    }
    setDominio(inicio.dominio);
    setEntrada(inicio.dominio.host);
    let vigente = true;
    setOcupado(true);
    if (inicio.modo === 'registros') {
      setFase('registros');
      apiDominios
        .detalle(inicio.dominio.id)
        .then((d) => {
          if (!vigente) return;
          setRegistros(d.registros);
          setProveedor(d.proveedor);
          setConexionAutomatica(d.conexionAutomatica);
        })
        .catch((e: unknown) => vigente && setError(mensajeDeError(t, e)))
        .finally(() => vigente && setOcupado(false));
    } else {
      setFase('resultado');
      verificar(inicio.dominio.id)
        .then((r) => {
          if (!vigente) return;
          setVerificacion(r);
          setRegistros(r.registros);
          setDominio(r.dominio);
        })
        .catch((e: unknown) => vigente && setError(mensajeDeError(t, e)))
        .finally(() => vigente && setOcupado(false));
    }
    return () => {
      vigente = false;
    };
    // `inicio` cambia de identidad con cada render del padre; basta con abrir y el id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, inicio.modo, inicio.modo === 'nuevo' ? null : inicio.dominio.id]);

  const host = normalizarHost(entrada);
  const hostValido = esHostValido(host);
  const errorCampo = error ?? (tocado && !hostValido ? t('conectar.invalido') : null);

  const continuar = async () => {
    setTocado(true);
    if (!hostValido) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await conectar(host, sede?.id ?? null);
      setDominio(r.dominio);
      setRegistros(r.registros);
      setProveedor(r.proveedor);
      setConexionAutomatica(r.conexionAutomatica);
      setFase('registros');
    } catch (e) {
      if (e instanceof ErrorApiDominios && e.codigo === 'en_otra_organizacion') setFase('en_otra');
      else setError(mensajeDeError(t, e));
    } finally {
      setOcupado(false);
    }
  };

  const verificarAhora = async () => {
    if (!dominio) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await verificar(dominio.id);
      setVerificacion(r);
      setRegistros(r.registros);
      setDominio(r.dominio);
      setFase('resultado');
    } catch (e) {
      setError(e instanceof ErrorApiDominios && e.estado === 429 ? t('conectar.demasiados') : mensajeDeError(t, e));
    } finally {
      setOcupado(false);
    }
  };

  const copiarTodo = async () => {
    try {
      await navigator.clipboard.writeText(textoRegistros(registros));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const cambiarPrincipal = async (v: boolean) => {
    if (!v || !dominio || dominio.principal) return;
    setPrincipalOcupado(true);
    try {
      setDominio(await hacerPrincipal(dominio.id));
    } catch (e) {
      setError(mensajeDeError(t, e));
    } finally {
      setPrincipalOcupado(false);
    }
  };

  const hostMostrado = dominio?.host ?? host;
  const nombreProveedor = proveedor === 'otro' ? null : NOMBRE_PROVEEDOR[proveedor];
  const variante = escritorio ? 'fila' : 'tarjeta';
  const resultado = fase === 'resultado' ? verificacion?.resultado ?? null : null;
  const listaRegistros = (rs: readonly RegistroDns[]) => (
    <div className={cn(variante === 'fila' ? 'overflow-hidden rounded-xl border border-line' : 'flex flex-col gap-3')}>
      {rs.map((r) => (
        <DnsRecordRow key={`${r.tipo}-${r.nombre}-${r.valor}`} tipo={r.tipo} nombre={r.nombre} valor={r.valor} estado={r.estado} valorEncontrado={r.encontrado} variante={variante} />
      ))}
    </div>
  );

  // ── Cabecera y contenido por fase ─────────────────────────────────────────
  let titulo = t('conectar.titulo1');
  let descripcion: string | undefined = t('conectar.sub1');
  let antetitulo: string | undefined = t('conectar.paso', { n: 1 });
  let icono: LucideIcon | undefined;
  let tonoIcono: 'exito' | 'peligro' | 'advertencia' | 'marca' | undefined;
  let cuerpo: React.ReactNode = null;
  let pie: React.ReactNode = null;

  const botonVerificar = (texto: string, variante: 'primario' | 'secundario' = 'primario', icon: 'check' | 'refresh' = 'check') => (
    <button type="button" onClick={() => void verificarAhora()} disabled={ocupado || !dominio} className={clasesBoton({ variante, tamano: 'md' })}>
      <IconoBoton icono={icon === 'check' ? ICONO.confirmar : ICONO.verificar} ocupado={ocupado} />
      {texto}
    </button>
  );
  const botonCerrar = (
    <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
      {t('conectar.cerrar')}
    </button>
  );
  const revisado = verificacion ? t('conectar.revisadoHace', { hace: f.hace(verificacion.revisadoEn) }) : null;

  if (fase === 'escribir') {
    cuerpo = (
      <>
        {sede && <p className="text-[13px] font-medium text-link">{t('conectar.paraSede', { sede: sede.nombre })}</p>}
        <FormField
          etiqueta={t('conectar.campo')}
          obligatorio
          ayuda={hostValido ? t('conectar.ayudaCampo', { host }) : t('conectar.ayudaCampoVacio')}
          error={errorCampo}
        >
          <Input
            value={entrada}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
            placeholder="tumarca.com.co"
            onChange={(e) => {
              setEntrada(e.target.value);
              setError(null);
            }}
            onBlur={() => setTocado(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void continuar();
            }}
          />
        </FormField>
        <ListaCheck
          titulo={t('conectar.queHaremos')}
          items={[t('conectar.haremos1', { host: hostValido ? host : 'tumarca.com.co' }), t('conectar.haremos2'), t('conectar.haremos3')]}
        />
        <AvisoTonal tono="informacion" titulo={t('conectar.correoTitulo')} descripcion={t('conectar.correoTexto')} />
      </>
    );
    pie = (
      <>
        <button type="button" onClick={onIrAComprar} className="mr-auto self-start rounded-md text-[13px] text-fg-secondary hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:self-center">
          {t('conectar.sinDominio')}
        </button>
        <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          {t('conectar.cancelar')}
        </button>
        <button type="button" onClick={() => void continuar()} disabled={ocupado} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
          <IconoBoton icono={ICONO.continuar} ocupado={ocupado} />
          {t('conectar.continuar')}
        </button>
      </>
    );
  } else if (fase === 'registros') {
    antetitulo = t('conectar.paso', { n: 2 });
    titulo = !escritorio && nombreProveedor ? t('conectar.titulo2Proveedor', { proveedor: nombreProveedor }) : t('conectar.titulo2');
    descripcion = nombreProveedor ? t('conectar.sub2Detectado', { host: hostMostrado, proveedor: nombreProveedor }) : t('conectar.sub2');
    cuerpo = (
      <>
        {!conexionAutomatica && <AvisoTonal tono="informacion" titulo={t('conectar.sinConexionTitulo')} descripcion={t('conectar.sinConexionTexto')} />}
        {ocupado && registros.length === 0 ? (
          <div className="flex justify-center py-6">
            <IconoDominio icono={ICONO.enCurso} tamano="fila" girando className="text-fg-secondary" />
          </div>
        ) : (
          listaRegistros(registros)
        )}
        {escritorio && <ProviderGuideTabs proveedorInicial={proveedor === 'otro' ? 'godaddy' : proveedor} enlacesGuia={GUIAS_PROVEEDOR} />}
        {(proveedor === 'cloudflare' || proveedor === 'otro') && conexionAutomatica && (
          <AvisoTonal tono="advertencia" titulo={t('conectar.cloudflareTitulo')} descripcion={t('conectar.cloudflareTexto')} />
        )}
        {!escritorio && verificacion === null && dominio && (
          <div className="flex items-center gap-2 rounded-lg bg-info-subtle px-3 py-2 text-[13px]">
            <DomainStatusBadge estado={dominio.estado} />
            {dominio.revisadoEn && <span className="text-fg-secondary">{t('conectar.revisadoHace', { hace: f.hace(dominio.revisadoEn) })}</span>}
          </div>
        )}
        {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}
      </>
    );
    pie = escritorio ? (
      <>
        <button type="button" onClick={() => void copiarTodo()} disabled={registros.length === 0} className={clasesBoton({ variante: 'fantasma', tamano: 'md' })}>
          <IconoDominio icono={copiado ? ICONO.copiado : ICONO.copiar} />
          {copiado ? t('conectar.copiadoTodo') : t('conectar.copiarTodo')}
        </button>
        {inicio.modo === 'nuevo' && (
          <button type="button" onClick={() => setFase('escribir')} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            {t('conectar.atras')}
          </button>
        )}
        {botonVerificar(t('conectar.yaLosCree'))}
      </>
    ) : (
      <button type="button" onClick={() => void verificarAhora()} disabled={ocupado || !dominio} className={clasesBoton({ variante: 'primario', tamano: 'lg', anchoCompleto: true })}>
        <IconoBoton icono={ICONO.confirmar} ocupado={ocupado} tamano="fila" />
        {t('conectar.yaLosCree')}
      </button>
    );
  } else if (fase === 'en_otra') {
    antetitulo = undefined;
    ({ icono, tono: tonoIcono } = RESULTADO.en_uso);
    titulo = t('conectar.enUsoOtraTitulo');
    descripcion = t('conectar.enUsoOtraSub');
    cuerpo = null;
    pie = (
      <>
        <button type="button" onClick={() => setFase('escribir')} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          {t('conectar.atras')}
        </button>
        {botonCerrar}
      </>
    );
  } else if (ocupado && !verificacion) {
    antetitulo = t('conectar.paso', { n: 3 });
    titulo = t('conectar.titulo3', { host: hostMostrado });
    descripcion = t('conectar.sub3');
    cuerpo = (
      <div className="flex justify-center py-6">
        <IconoDominio icono={ICONO.enCurso} tamano="fila" girando className="text-fg-secondary" />
      </div>
    );
    pie = botonCerrar;
  } else if (resultado === 'activo' && dominio) {
    antetitulo = undefined;
    ({ icono, tono: tonoIcono } = RESULTADO.activo);
    titulo = t('conectar.activoTitulo', { host: dominio.host });
    descripcion = t('conectar.activoSub', { host: dominio.host });
    const items = registros.length
      ? registros
          .filter((r) => r.estado === 'correcto')
          .map((r) => (r.tipo === 'A' ? t('conectar.activoA', { host: dominio.host }) : r.tipo === 'CNAME' ? t('conectar.activoCname', { host: dominio.host }) : t('conectar.activoTxt', { host: dominio.host })))
      : [];
    if (dominio.ssl === 'emitido') items.push(t('conectar.activoSsl'));
    const otros = otrosHosts.filter((h) => h !== dominio.host);
    cuerpo = (
      <>
        {items.length > 0 && <ListaCheck items={items} tono="exito" />}
        {dominio.tipo !== 'subdominio' && (
          <div className="rounded-xl border border-line">
            <SettingRow
              titulo={t('conectar.usarPrincipal')}
              htmlFor="dominio-principal"
              descripcion={dominio.principal ? t('conectar.yaEsPrincipal') : otros.length ? t('conectar.usarPrincipalTexto', { otros: otros.join(' y ') }) : undefined}
            >
              <Switch
                id="dominio-principal"
                checked={dominio.principal}
                disabled={dominio.principal || principalOcupado}
                onCheckedChange={(v) => void cambiarPrincipal(v)}
                className="data-[state=checked]:bg-brand-action data-[state=unchecked]:bg-line-strong focus-visible:ring-brand"
              />
            </SettingRow>
          </div>
        )}
        {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}
      </>
    );
    pie = (
      <>
        <a href={`https://${dominio.host}`} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          <IconoDominio icono={ICONO.verSitio} />
          {t('conectar.verSitio')}
        </a>
        <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
          {t('conectar.listo')}
        </button>
      </>
    );
  } else if (resultado === 'mal_configurado') {
    antetitulo = undefined;
    ({ icono, tono: tonoIcono } = RESULTADO.mal_configurado);
    titulo = t('conectar.malTitulo', { host: hostMostrado });
    descripcion = t('conectar.malSub');
    const malo = registros.find((r) => r.estado === 'otro_valor');
    cuerpo = (
      <>
        {listaRegistros(registros)}
        {malo && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-canvas px-4 py-3">
              <p className="text-[13px] font-medium text-fg-secondary">{t('conectar.loQueEncontramos')}</p>
              <p className="font-mono text-sm text-danger-text">
                {malo.tipo} {malo.nombre} → {malo.encontrado ?? '—'}
              </p>
            </div>
            <div className="rounded-lg bg-canvas px-4 py-3">
              <p className="text-[13px] font-medium text-fg-secondary">{t('conectar.loQueDebeDecir')}</p>
              <p className="font-mono text-sm text-success-text">
                {malo.tipo} {malo.nombre} → {malo.valor}
              </p>
            </div>
          </div>
        )}
        {malo?.tipo === 'A' && <AvisoTonal tono="informacion" titulo={t('conectar.borraViejoTitulo')} descripcion={t('conectar.borraViejoTexto')} />}
        {verificacion?.mensaje && <p className="text-[13px] text-fg-secondary">{verificacion.mensaje}</p>}
        {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}
      </>
    );
    pie = (
      <>
        {revisado && <span className="mr-auto text-[13px] text-fg-muted">{revisado}</span>}
        <button type="button" onClick={() => setFase('registros')} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          <IconoDominio icono={ICONO.guia} />
          {t('conectar.verGuiaProveedor')}
        </button>
        {botonVerificar(t('conectar.verificarAhora'), 'primario', 'refresh')}
      </>
    );
  } else if (resultado === 'en_uso') {
    antetitulo = undefined;
    ({ icono, tono: tonoIcono } = RESULTADO.en_uso);
    titulo = t('conectar.enUsoTitulo');
    descripcion = t('conectar.enUsoSub');
    const txt = registros.filter((r) => r.tipo === 'TXT');
    cuerpo = (
      <>
        {listaRegistros(txt.length ? txt : registros)}
        <p className="text-[13px] leading-[18px] text-fg-secondary">{verificacion?.mensaje ?? t('conectar.enUsoTexto')}</p>
        {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}
      </>
    );
    pie = (
      <>
        <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          {t('conectar.cancelar')}
        </button>
        {botonVerificar(t('conectar.yaLoCree'))}
      </>
    );
  } else if (resultado === 'propagando' && verificacion?.propagacion) {
    antetitulo = undefined;
    ({ icono, tono: tonoIcono } = RESULTADO.propagando);
    titulo = t('conectar.propagaTitulo');
    descripcion = t('conectar.propagaSub');
    const { vistos, total } = verificacion.propagacion;
    cuerpo = (
      <div className="flex flex-col gap-2 rounded-lg border border-line-info bg-info-subtle px-4 py-3">
        <p className="text-sm font-medium text-info-text">{t('conectar.propagaVisto', { vistos, total })}</p>
        <BarraProgreso valor={vistos} max={total} etiqueta={t('conectar.propagaVisto', { vistos, total })} tamano="sm" />
        <p className="text-[13px] text-fg-secondary">{t('conectar.propagaRevisado', { hace: f.hace(verificacion.revisadoEn) })}</p>
      </div>
    );
    pie = (
      <>
        <span className="mr-auto text-[13px] text-fg-muted">{t('conectar.propagaPie')}</span>
        {botonVerificar(t('conectar.verificarAhora'), 'secundario', 'refresh')}
        {botonCerrar}
      </>
    );
  } else {
    // Verificando (B/07-08) o error de red al verificar.
    antetitulo = t('conectar.paso', { n: 3 });
    titulo = t('conectar.titulo3', { host: hostMostrado });
    descripcion = t('conectar.sub3');
    cuerpo = (
      <>
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-line-info bg-info-subtle px-4 py-3">
          <IconoDominio icono={ICONO.enCurso} tamano="fila" girando className="mt-0.5 text-info-text" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {revisado && <p className="text-sm font-medium text-info-text">{revisado}</p>}
            <p className="text-[13px] text-fg-secondary">{t('conectar.puedesCerrar')}</p>
          </div>
          <DomainStatusBadge estado="verificando" />
        </div>
        {registros.length > 0 && listaRegistros(registros)}
        {verificacion?.mensaje && <p className="text-[13px] text-fg-secondary">{verificacion.mensaje}</p>}
        <p className="flex items-center gap-2 text-[13px] text-fg-secondary">
          <IconoDominio icono={ICONO.info} />
          {t('conectar.certificado')}
        </p>
        {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}
      </>
    );
    pie = (
      <>
        <button type="button" onClick={() => setFase('registros')} className={clasesBoton({ variante: 'fantasma', tamano: 'md' })}>
          <IconoDominio icono={ICONO.registros} />
          {t('conectar.verRegistros')}
        </button>
        {botonVerificar(t('conectar.verificarAhora'), 'secundario', 'refresh')}
        {botonCerrar}
      </>
    );
  }

  // Móvil (B/07-26): el título del flujo va en la cabecera de la hoja a pantalla completa.
  const tituloMovil = useMemo(() => (hostMostrado ? t('conectar.hojaTitulo', { host: hostMostrado }) : titulo), [hostMostrado, t, titulo]);
  const enHojaMovil = !escritorio && fase === 'registros';

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={enHojaMovil ? tituloMovil : titulo}
      descripcion={enHojaMovil ? antetitulo : descripcion}
      antetitulo={enHojaMovil ? undefined : antetitulo}
      icono={icono}
      tonoIcono={tonoIcono}
      pantallaCompletaMovil={fase === 'registros'}
      ocupado={ocupado && fase === 'escribir'}
      ancho={560}
      pie={pie}
    >
      {enHojaMovil && (
        <>
          <h3 className="text-base font-semibold text-fg">{titulo}</h3>
          {descripcion && <p className="-mt-2 text-[13px] text-fg-secondary">{descripcion}</p>}
        </>
      )}
      {cuerpo}
    </PanelAdaptable>
  );
}
