'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Landmark, Trash2 } from 'lucide-react';
import { AvisoTonal, ConfirmDialog, DataTable, ListCard, StatusBadge, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { UNICA_VERIFICADA_CON_PENDIENTES, ESTADOS_DISPERSION_PENDIENTE } from '@/lib/services/integrations/payfac/cuentaAbonoReglas';
import { ErrorApiCobros, motivoNoQuitarCuenta, pedirApi, ultimosDigitos, type CuentaAbono, type Dispersion } from './cobrosLogica';
import { NuevaCuentaAbonoDialogo } from './NuevaCuentaAbonoDialogo';

interface Props {
  cuentas: readonly CuentaAbono[];
  cargando: boolean;
  error: string | null;
  onRecargar: () => void;
  dispersiones: readonly Dispersion[];
  nuevaAbierta: boolean;
  onNuevaAbiertaChange: (abierta: boolean) => void;
}

/**
 * Pestaña «Cuenta de abono» (A9, captura 82-finanzas-r2-09). Quitar pide
 * confirmación y no deja quitar la única cuenta verificada con dispersiones
 * pendientes (la misma regla la aplica el servidor: 409).
 */
export function CuentaAbonoPestana({ cuentas, cargando, error, onRecargar, dispersiones, nuevaAbierta, onNuevaAbiertaChange }: Props) {
  const t = useTranslations('finanzasCobrosR2');
  const [aQuitar, setAQuitar] = useState<CuentaAbono | null>(null);
  const [quitando, setQuitando] = useState(false);

  const pendientes = useMemo(
    () => dispersiones.filter((d) => (ESTADOS_DISPERSION_PENDIENTE as readonly string[]).includes(d.status)).length,
    [dispersiones],
  );

  const tipoCuenta = (tipo: string) => (tipo === 'savings' || tipo === 'checking' ? t(`cuenta.tipos.${tipo}`) : tipo);
  const cuentaEnGoAdmin = (c: CuentaAbono) =>
    c.bank_account ? `${c.bank_account.bank_name || c.bank_account.name} ${ultimosDigitos(c.bank_account.account_number)}` : t('cuenta.sinVincular');
  const estado = (c: CuentaAbono) => (
    <StatusBadge estado={c.is_verified ? 'verificada' : 'pendiente'} etiqueta={c.is_verified ? t('cuenta.estados.verificada') : t('cuenta.estados.pendiente')} tamano="sm" />
  );

  const acciones = (c: CuentaAbono): AccionFila[] => {
    const motivo = motivoNoQuitarCuenta(c, cuentas, pendientes);
    return [
      {
        id: 'quitar',
        etiqueta: t('cuenta.quitar.accion'),
        icono: Trash2,
        destructiva: true,
        deshabilitada: Boolean(motivo),
        motivo: motivo ? t('cuenta.quitar.bloqueada') : undefined,
        onSelect: () => setAQuitar(c),
      },
    ];
  };

  const quitar = async () => {
    if (!aQuitar) return;
    setQuitando(true);
    try {
      await pedirApi(`/api/integrations/payfac/payout-accounts/${encodeURIComponent(aQuitar.id)}`, { method: 'DELETE' });
      toast.success(t('cuenta.quitar.hecho'));
      setAQuitar(null);
      onRecargar();
    } catch (e) {
      console.error('Error quitando la cuenta de abono:', e);
      const codigo = e instanceof ErrorApiCobros ? e.codigo : undefined;
      toast.error(codigo === UNICA_VERIFICADA_CON_PENDIENTES ? t('cuenta.quitar.bloqueada') : t('cuenta.quitar.error'));
    } finally {
      setQuitando(false);
    }
  };

  const columnas: ColumnaTabla<CuentaAbono>[] = [
    { id: 'banco', encabezado: t('cuenta.columnas.banco'), celda: (c) => <span className="font-medium text-fg">{c.bank_name}</span> },
    { id: 'tipo', encabezado: t('cuenta.columnas.tipo'), celda: (c) => tipoCuenta(c.account_type), ocultarDebajo: 'md' },
    { id: 'numero', encabezado: t('cuenta.columnas.numero'), celda: (c) => ultimosDigitos(c.account_number), variante: 'mono' },
    { id: 'titular', encabezado: t('cuenta.columnas.titular'), celda: (c) => c.account_holder_name, ocultarDebajo: 'md' },
    { id: 'documento', encabezado: t('cuenta.columnas.documento'), celda: (c) => `${c.account_holder_id_type} ${ultimosDigitos(c.account_holder_id)}`, ocultarDebajo: 'lg' },
    { id: 'goadmin', encabezado: t('cuenta.columnas.cuentaGoAdmin'), celda: cuentaEnGoAdmin, ocultarDebajo: 'lg' },
    { id: 'estado', encabezado: t('cuenta.columnas.estado'), celda: estado },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AvisoTonal tono="informacion" titulo={t('cuenta.aviso.titulo')} descripcion={t('cuenta.aviso.descripcion')} />

      <DataTable
        etiqueta={t('cuenta.tabla')}
        columnas={columnas}
        filas={cuentas}
        obtenerId={(c) => c.id}
        estado={error ? 'error' : cargando ? 'cargando' : 'listo'}
        etiquetaFila={(c) => `${c.bank_name} ${ultimosDigitos(c.account_number)}`}
        acciones={acciones}
        vacio={{
          titulo: t('cuenta.vacio.titulo'),
          descripcion: t('cuenta.vacio.descripcion'),
          icono: Landmark,
          accion: { etiqueta: t('cuenta.nueva'), onClick: () => onNuevaAbiertaChange(true) },
        }}
        error={{ titulo: t('cuenta.error'), descripcion: error ?? undefined }}
        onReintentar={onRecargar}
        tarjetaMovil={(c) => (
          <ListCard
            icono={Landmark}
            titulo={`${c.bank_name} ${ultimosDigitos(c.account_number)}`}
            subtitulo={`${tipoCuenta(c.account_type)} · ${c.account_holder_name}`}
            meta={cuentaEnGoAdmin(c)}
            estado={estado(c)}
            acciones={acciones(c)}
          />
        )}
      />

      <ConfirmDialog
        abierto={Boolean(aQuitar)}
        onAbiertoChange={(a) => !a && !quitando && setAQuitar(null)}
        titulo={t('cuenta.quitar.titulo')}
        descripcion={t('cuenta.quitar.descripcion', {
          cuenta: aQuitar ? `${aQuitar.bank_name} ${ultimosDigitos(aQuitar.account_number)}` : '',
        })}
        textoConfirmar={t('cuenta.quitar.confirmar')}
        tono="peligro"
        icono={Trash2}
        cargando={quitando}
        onConfirmar={quitar}
      />

      <NuevaCuentaAbonoDialogo abierto={nuevaAbierta} onAbiertoChange={onNuevaAbiertaChange} onCreada={onRecargar} />
    </div>
  );
}
