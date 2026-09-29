'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Dialogo } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import {
  BasculasService,
  codigoErrorBasculas,
  type BasculaConfigurada,
  type BasculaPayload,
} from '@/lib/services/basculasService';
import { PosTerminalsService } from '@/lib/services/posTerminalsService';
import { basculaPreferida, entornoBascula, fijarBasculaPreferida } from '@/lib/pos/bascula/useBasculaDelEquipo';
import { BasculasVista, type EstadoBasculasVista } from './BasculasVista';
import { BasculaFormDialog } from './BasculaFormDialog';

/**
 * Configuración › POS › «Básculas» (docs/design/PRODUCTOS-POR-PESO-BASCULA.md
 * §2.8, Figma K1–K8). Carga por `pos_basculas_listar`, que dice si la persona
 * puede configurar (permiso `pos.basculas.configurar` resuelto en el servidor);
 * guarda, archiva y registra la prueba por RPC.
 *
 * «Usar en este equipo» se guarda en este navegador: la báscula que el POS de
 * esta caja abre al pesar.
 */
export function BasculasSection({ branches }: { branches: { id: number; name: string }[] }) {
  const t = useTranslations('posBascula.config');
  const { organization } = useOrganization();
  const { selectedBranchId } = useBranch();
  const { formatDateTime } = useFormatDate();
  const orgId = organization?.id as number | undefined;

  const [estado, setEstado] = useState<EstadoBasculasVista>('cargando');
  const [basculas, setBasculas] = useState<BasculaConfigurada[]>([]);
  const [editando, setEditando] = useState<BasculaConfigurada | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [archivando, setArchivando] = useState<BasculaConfigurada | null>(null);
  const [preferidas, setPreferidas] = useState<Record<number, string | null>>({});
  const entorno = useMemo(() => entornoBascula(), []);

  const mensajeError = useCallback(
    (error: unknown) => {
      const codigo = codigoErrorBasculas(error);
      return codigo ? t(`errores.${codigo}`) : t('errores.generico');
    },
    [t],
  );

  const cargar = useCallback(async () => {
    if (!orgId) return;
    setEstado('cargando');
    try {
      const r = await BasculasService.listar(orgId);
      setBasculas(r.basculas);
      setEstado(r.puedeConfigurar ? 'listo' : 'sinPermiso');
    } catch (error) {
      console.error('Error cargando básculas:', error);
      setEstado(codigoErrorBasculas(error) === 'sin_permiso' ? 'sinPermiso' : 'error');
    }
  }, [orgId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Báscula elegida en este navegador, por sucursal.
  useEffect(() => {
    if (!orgId) return;
    const mapa: Record<number, string | null> = {};
    for (const b of basculas) {
      if (!(b.branch_id in mapa)) mapa[b.branch_id] = basculaPreferida(orgId, b.branch_id);
    }
    setPreferidas(mapa);
  }, [orgId, basculas]);

  const cargarCajas = useCallback(async (sucursalId: number) => {
    const lista = await PosTerminalsService.listTerminals(sucursalId);
    return lista.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name }));
  }, []);

  const guardar = async (payload: BasculaPayload, resultadoPrueba: boolean | null) => {
    if (!orgId) return;
    setGuardando(true);
    setErrorServidor(null);
    try {
      const guardada = await BasculasService.guardar(orgId, payload);
      if (resultadoPrueba !== null) {
        await BasculasService.registrarPrueba(orgId, guardada.id, resultadoPrueba).catch((err) =>
          console.warn('No se pudo registrar la prueba de lectura:', err),
        );
      }
      toast.success(t(payload.id ? 'toasts.actualizada' : 'toasts.creada', { nombre: guardada.name }));
      setFormAbierto(false);
      await cargar();
    } catch (error) {
      setErrorServidor(mensajeError(error));
    } finally {
      setGuardando(false);
    }
  };

  const archivar = async (b: BasculaConfigurada, archivar: boolean) => {
    if (!orgId) return;
    try {
      await BasculasService.archivar(orgId, b.id, archivar);
      toast.success(t(archivar ? 'toasts.archivada' : 'toasts.reactivada', { nombre: b.name }));
      if (archivar && preferidas[b.branch_id] === b.id) fijarBasculaPreferida(orgId, b.branch_id, null);
      setArchivando(null);
      await cargar();
    } catch (error) {
      toast.error(mensajeError(error));
    }
  };

  const usarEnEsteEquipo = (b: BasculaConfigurada) => {
    if (!orgId) return;
    fijarBasculaPreferida(orgId, b.branch_id, b.id);
    setPreferidas((prev) => ({ ...prev, [b.branch_id]: b.id }));
    toast.success(t('toasts.enEsteEquipo', { nombre: b.name }));
  };

  return (
    <>
      <BasculasVista
        estado={estado}
        basculas={basculas}
        preferidas={preferidas}
        formatearFecha={formatDateTime}
        onNueva={() => {
          setEditando(null);
          setErrorServidor(null);
          setFormAbierto(true);
        }}
        onEditar={(b) => {
          setEditando(b);
          setErrorServidor(null);
          setFormAbierto(true);
        }}
        onArchivar={setArchivando}
        onReactivar={(b) => void archivar(b, false)}
        onUsarEnEsteEquipo={usarEnEsteEquipo}
        onReintentar={() => void cargar()}
      />

      <BasculaFormDialog
        abierto={formAbierto}
        onAbiertoChange={(v) => !guardando && setFormAbierto(v)}
        bascula={editando}
        sucursales={branches}
        sucursalPorDefecto={selectedBranchId ?? branches[0]?.id ?? null}
        cargarCajas={cargarCajas}
        entorno={entorno}
        guardando={guardando}
        errorServidor={errorServidor}
        onGuardar={(p, r) => void guardar(p, r)}
      />

      <Dialogo
        abierto={archivando !== null}
        onAbiertoChange={(v) => !v && setArchivando(null)}
        titulo={t('confirmarArchivar.titulo', { nombre: archivando?.name ?? '' })}
        descripcion={t('confirmarArchivar.texto')}
        ancho={440}
        primario={{ etiqueta: t('confirmarArchivar.accion'), destructiva: true, onClick: () => archivando && void archivar(archivando, true) }}
      />
    </>
  );
}
