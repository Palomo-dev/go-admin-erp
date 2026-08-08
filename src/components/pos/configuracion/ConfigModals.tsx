'use client';

import { useState, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
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
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
    </div>
  );
}

interface ConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

function ConfigModal({ open, onOpenChange, title, children, maxWidth = 'max-w-4xl' }: ConfigModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${maxWidth} max-h-[90vh] overflow-y-auto`}>
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
    <ConfigModal open={open} onOpenChange={onOpenChange} title="Consecutivos de Ventas" maxWidth="max-w-5xl">
      <ConsecutivosPage embedded />
    </ConfigModal>
  );
}

export function PropinasModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ConfigModal open={open} onOpenChange={onOpenChange} title="Propinas" maxWidth="max-w-5xl">
      <PropinasContent embedded />
    </ConfigModal>
  );
}

export function CargosModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ConfigModal open={open} onOpenChange={onOpenChange} title="Cargos de Servicio" maxWidth="max-w-4xl">
      <CargosServicioContent embedded />
    </ConfigModal>
  );
}

export function ImpresionesModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ConfigModal open={open} onOpenChange={onOpenChange} title="Previsualizar Impresiones" maxWidth="max-w-4xl">
      <ImpresionesPage embedded />
    </ConfigModal>
  );
}

export function AgenteModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ConfigModal open={open} onOpenChange={onOpenChange} title="Agente de Impresión" maxWidth="max-w-4xl">
      <DesktopAgentPanel embedded />
    </ConfigModal>
  );
}

export type { ConfigModalProps };
