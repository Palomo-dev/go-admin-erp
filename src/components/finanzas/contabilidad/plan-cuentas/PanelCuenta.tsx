'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormField, clasesBoton, useEsEscritorio } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { SaldoCuenta } from '@/lib/finanzas/planCuentasAlta';
import { presentacionDeCodigo, type PresentacionNiif } from '@/lib/finanzas/pucPrefijo';
import {
  claseDe,
  esCodigoPuc,
  naturalezaDe,
  nivelDe,
  prefijoPadre,
  tipoDeClase,
  validarHijo,
  type NaturalezaPuc,
} from '@/lib/finanzas/pucJerarquia';
import { ContabilidadService, type ChartAccount } from '../ContabilidadService';

const SELECT = 'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg disabled:opacity-60';

type ModoCentro = 'obligatorio' | 'opcional' | 'no_aplica';

function modoCentroDe(codigo: string, modo?: string | null, requiere?: boolean | null): ModoCentro {
  if (modo === 'obligatorio' || modo === 'opcional' || modo === 'no_aplica') return modo;
  if (requiere === true) return 'obligatorio';
  return ['4', '5', '6', '7'].includes(codigo[0] ?? '') ? 'obligatorio' : 'no_aplica';
}

function textoDeHtml(valor: string | null | undefined): string {
  return (valor ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface PanelCuentaProps {
  /** Null: cuenta nueva. */
  cuenta: ChartAccount | null;
  cuentas: readonly ChartAccount[];
  saldo: SaldoCuenta | null;
  textoSaldo: string;
  puedeEditar: boolean;
  onCerrar: () => void;
  onGuardada: (cuenta: ChartAccount, esNueva: boolean) => void;
  onCambiarActiva: (cuenta: ChartAccount) => void;
}

/**
 * Panel lateral de una cuenta (Figma «más opciones»). Lo que no hace falta para
 * crear un auxiliar en la fila vive aquí, y el árbol sigue detrás en el mismo
 * lugar. También es el camino de «Nueva cuenta» para los demás niveles.
 */
export function PanelCuenta({
  cuenta,
  cuentas,
  saldo,
  textoSaldo,
  puedeEditar,
  onCerrar,
  onGuardada,
  onCambiarActiva,
}: PanelCuentaProps) {
  const t = useTranslations('planCuentas');
  const escritorio = useEsEscritorio();
  const { formatDate } = useFormatDate();
  const nueva = !cuenta;

  const [codigo, setCodigo] = useState(cuenta?.account_code ?? '');
  const [nombre, setNombre] = useState(cuenta?.name ?? '');
  const [naturaleza, setNaturaleza] = useState<NaturalezaPuc>(
    cuenta ? naturalezaDe(cuenta.account_code, cuenta.naturaleza) ?? 'debito' : 'debito',
  );
  const [presentacion, setPresentacion] = useState<PresentacionNiif | ''>(cuenta?.presentacion_niif ?? '');
  const [centro, setCentro] = useState<ModoCentro>(
    modoCentroDe(cuenta?.account_code ?? '', cuenta?.centro_costo_modo, cuenta?.requiere_centro_costo),
  );
  const [tercero, setTercero] = useState(cuenta?.requiere_tercero ?? false);
  const [exogena, setExogena] = useState(cuenta?.concepto_exogena ?? '');
  const [descripcion, setDescripcion] = useState(textoDeHtml(cuenta?.description));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [autor, setAutor] = useState<{ creadaPor: string | null; creadaEn: string | null } | null>(null);

  useEffect(() => {
    if (!cuenta) return;
    let vivo = true;
    ContabilidadService.autorCuenta(cuenta.account_code)
      .then((dato) => vivo && setAutor(dato))
      .catch(() => vivo && setAutor(null));
    return () => {
      vivo = false;
    };
  }, [cuenta]);

  const ruta = useMemo(() => {
    if (!cuenta) return '';
    const nombres: string[] = [];
    let actual = cuenta.parent_code;
    const vistos = new Set<string>();
    while (actual && !vistos.has(actual)) {
      vistos.add(actual);
      const padre = cuentas.find((c) => c.account_code === actual);
      if (!padre) break;
      nombres.unshift(padre.name);
      actual = padre.parent_code;
    }
    return nombres.join(' › ');
  }, [cuenta, cuentas]);

  const cambiarCodigo = (valor: string) => {
    const limpio = valor.replace(/[^0-9]/g, '');
    setCodigo(limpio);
    setError(null);
    const clase = claseDe(limpio);
    if (clase != null) setNaturaleza(naturalezaDe(limpio, null) ?? 'debito');
    if (esCodigoPuc(limpio)) setPresentacion(presentacionDeCodigo(limpio) ?? '');
    setCentro(modoCentroDe(limpio));
  };

  const guardar = async () => {
    const limpio = codigo.trim();
    if (!nombre.trim()) {
      setError(t('panel.errores.nombre'));
      return;
    }
    const padre = nueva && limpio.length > 1 ? prefijoPadre(limpio) : cuenta?.parent_code ?? null;
    if (nueva) {
      if (!esCodigoPuc(limpio)) {
        setError(t('panel.errores.codigo'));
        return;
      }
      if (cuentas.some((c) => c.account_code === limpio)) {
        setError(t('panel.errores.ocupado'));
        return;
      }
      if (padre && (!cuentas.some((c) => c.account_code === padre) || validarHijo(padre, limpio))) {
        setError(t('panel.errores.padre', { padre }));
        return;
      }
    }
    const esTitulo = nivelDe(limpio) === 'clase' || nivelDe(limpio) === 'grupo';
    const clase = claseDe(limpio);
    const datos: Partial<ChartAccount> = {
      name: nombre.trim(),
      description: descripcion.trim() || null,
      naturaleza,
      presentacion_niif: presentacion || null,
      requiere_tercero: tercero,
      centro_costo_modo: centro,
      requiere_centro_costo: centro === 'obligatorio',
      concepto_exogena: exogena.trim() || null,
    };
    setGuardando(true);
    setError(null);
    try {
      const guardada = nueva
        ? await ContabilidadService.crearCuenta({
            ...datos,
            account_code: limpio,
            parent_code: padre,
            type: tipoDeClase(clase ?? 1),
            es_movimiento: !esTitulo,
          })
        : await ContabilidadService.actualizarCuenta(limpio, datos);
      toastSuccess(t(nueva ? 'panel.creada' : 'panel.actualizada'));
      onGuardada(guardada, nueva);
    } catch (causa) {
      console.error('Error guardando la cuenta:', causa);
      const texto = causa && typeof causa === 'object' && 'message' in causa ? String(causa.message) : '';
      if (texto.includes('padre_invalido') || texto.includes('prefijo_ausente')) setError(t('panel.errores.padre', { padre: padre ?? '' }));
      else if (texto.includes('codigo_puc_invalido')) setError(t('panel.errores.codigo'));
      else {
        setError(t('panel.errores.guardar'));
        toastError(t('panel.errores.guardar'));
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet open onOpenChange={(abierto) => !abierto && !guardando && onCerrar()}>
      <SheetContent
        side={escritorio ? 'right' : 'bottom'}
        className="flex max-h-dvh w-full flex-col gap-0 p-0 sm:max-w-[480px]"
      >
        <div className="px-6 pb-3 pt-5">
          <SheetTitle className="pr-8 text-lg font-semibold text-fg">
            {cuenta ? `${cuenta.account_code} · ${cuenta.name}` : t('panel.tituloNueva')}
          </SheetTitle>
          <SheetDescription className="text-[13px] text-fg-secondary">
            {cuenta ? ruta || t('panel.sinRuta') : t('panel.descripcionNueva')}
          </SheetDescription>
        </div>

        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 pb-4">
          {nueva ? (
            <FormField etiqueta={t('panel.codigo')} obligatorio error={error ?? undefined} ayuda={t('panel.codigoAyuda')}>
              <Input inputMode="numeric" value={codigo} onChange={(e) => cambiarCodigo(e.target.value)} />
            </FormField>
          ) : null}
          <FormField etiqueta={t('panel.nombre')} obligatorio error={!nueva ? error ?? undefined : undefined}>
            <Input value={nombre} maxLength={200} disabled={!puedeEditar} onChange={(e) => setNombre(e.target.value)} />
          </FormField>
          <FormField etiqueta={t('panel.naturaleza')}>
            <select className={SELECT} value={naturaleza} disabled={!puedeEditar} onChange={(e) => setNaturaleza(e.target.value as NaturalezaPuc)}>
              <option value="debito">{t('naturaleza.debito')}</option>
              <option value="credito">{t('naturaleza.credito')}</option>
              <option value="orden">{t('naturaleza.orden')}</option>
            </select>
          </FormField>
          <FormField etiqueta={t('panel.presentacion')} ayuda={t('panel.presentacionAyuda')}>
            <select className={SELECT} value={presentacion} disabled={!puedeEditar} onChange={(e) => setPresentacion(e.target.value as PresentacionNiif | '')}>
              <option value="">{t('panel.presentacionGrupo')}</option>
              <option value="corriente">{t('panel.corriente')}</option>
              <option value="no_corriente">{t('panel.noCorriente')}</option>
              <option value="segun_plazo">{t('panel.segunPlazo')}</option>
            </select>
          </FormField>
          <FormField etiqueta={t('panel.centro')}>
            <select className={SELECT} value={centro} disabled={!puedeEditar} onChange={(e) => setCentro(e.target.value as ModoCentro)}>
              <option value="obligatorio">{t('panel.centroObligatorio')}</option>
              <option value="opcional">{t('panel.centroOpcional')}</option>
              <option value="no_aplica">{t('panel.centroNoAplica')}</option>
            </select>
          </FormField>
          <FormField etiqueta={t('panel.exogena')}>
            <Input value={exogena} maxLength={40} disabled={!puedeEditar} onChange={(e) => setExogena(e.target.value)} />
          </FormField>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="cuenta-requiere-tercero" className="text-sm font-medium text-fg">{t('panel.tercero')}</label>
            <Switch id="cuenta-requiere-tercero" checked={tercero} disabled={!puedeEditar} onCheckedChange={setTercero} />
          </div>
          <FormField etiqueta={t('panel.descripcion')}>
            <Textarea value={descripcion} rows={2} maxLength={500} disabled={!puedeEditar} onChange={(e) => setDescripcion(e.target.value)} />
          </FormField>

          {cuenta ? (
            <div className="flex flex-col gap-1 rounded-lg bg-subtle px-3 py-2.5 text-[13px] text-fg-secondary">
              <span>{t('panel.uso', { saldo: textoSaldo, movimientos: saldo?.movimientos ?? 0 })}</span>
              {autor?.creadaPor ? (
                <span>{t('panel.creadaPor', { nombre: autor.creadaPor, fecha: formatDate(autor.creadaEn) })}</span>
              ) : autor?.creadaEn ? (
                <span>{t('panel.creadaEl', { fecha: formatDate(autor.creadaEn) })}</span>
              ) : null}
              <Link
                href={`/app/reportes/contabilidad/mayor-cuenta?periodo=anual&cuenta=${encodeURIComponent(cuenta.account_code)}`}
                className="text-link hover:underline"
              >
                {t('fila.verMayor')}
              </Link>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line bg-subtle px-6 py-4">
          {cuenta && puedeEditar ? (
            <button type="button" onClick={() => onCambiarActiva(cuenta)} className={clasesBoton({ variante: 'fantasma' })}>
              {t(cuenta.is_active === false ? 'fila.activar' : 'fila.desactivar')}
            </button>
          ) : (
            <span />
          )}
          {puedeEditar ? (
            <button type="button" onClick={() => void guardar()} disabled={guardando} className={clasesBoton({ variante: 'primario' })}>
              {guardando ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {t(nueva ? 'panel.crear' : 'panel.guardar')}
            </button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
