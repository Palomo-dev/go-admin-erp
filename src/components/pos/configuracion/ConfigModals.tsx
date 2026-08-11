'use client';

import { lazy, Suspense } from 'react';
import { CardListSkeleton } from '@/components/common/PageSkeletons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const ConsecutivosPage = lazy(() =>
  import('./consecutivos-ventas/ConsecutivosPage').then((m) => ({ default: m.ConsecutivosPage })),
);
const PropinasContent = lazy(() =>
  import('@/components/pos/propinas/PropinasContent').then((m) => ({ default: m.PropinasContent })),
);
const CargosServicioContent = lazy(() =>
  import('@/components/pos/cargos-servicio/CargosServicioContent').then((m) => ({
    default: m.CargosServicioContent,
  })),
);
const ImpresionesPage = lazy(() =>
  import('./impresiones/ImpresionesPage').then((m) => ({ default: m.ImpresionesPage })),
);
const DesktopAgentPanel = lazy(() =>
  import('./agente-impresion/DesktopAgentPanel').then((m) => ({ default: m.DesktopAgentPanel })),
);

function ModalSkeleton() {
  return <CardListSkeleton cards={4} columns="2" />;
}

interface ConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

function ConfigModal({ open, onOpenChange, title, children }: ConfigModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-xl md:max-w-2xl lg:max-w-5xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Suspense fallback={<ModalSkeleton />}>{children}</Suspense>
      </DialogContent>
    </Dialog>
  );
}

export function ConsecutivosModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ConfigModal open={open} onOpenChange={onOpenChange} title="Consecutivos de Ventas">
      <ConsecutivosPage embedded />
    </ConfigModal>
  );
}

export function PropinasModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ConfigModal open={open} onOpenChange={onOpenChange} title="Propinas">
      <PropinasContent embedded />
    </ConfigModal>
  );
}

export function CargosModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ConfigModal open={open} onOpenChange={onOpenChange} title="Cargos de Servicio">
      <CargosServicioContent embedded />
    </ConfigModal>
  );
}

export function ImpresionesModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ConfigModal open={open} onOpenChange={onOpenChange} title="Previsualizar Impresiones">
      <ImpresionesPage embedded />
    </ConfigModal>
  );
}

export function AgenteModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ConfigModal open={open} onOpenChange={onOpenChange} title="Agente de Impresión">
      <DesktopAgentPanel embedded />
    </ConfigModal>
  );
}

export type { ConfigModalProps };
