'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const ParkingConfigPanel = dynamic(() => import('../panels/parking/ParkingConfigPanel').then((m) => m.ParkingConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const TimelineConfigPanel = dynamic(() => import('../panels/timeline/TimelineConfigPanel').then((m) => m.TimelineConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const IntegracionesConfigPanel = dynamic(() => import('../panels/integraciones/IntegracionesConfigPanel').then((m) => m.IntegracionesConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const RolesConfigPanel = dynamic(() => import('../panels/roles/RolesConfigPanel').then((m) => m.RolesConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const CalendarioConfigPanel = dynamic(() => import('../panels/calendario/CalendarioConfigPanel').then((m) => m.CalendarioConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const GymConfigPanel = dynamic(() => import('../panels/gym/GymConfigPanel').then((m) => m.GymConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const NotificacionesConfigPanel = dynamic(() => import('../panels/notificaciones/NotificacionesConfigPanel').then((m) => m.NotificacionesConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const FacturacionConfigPanel = dynamic(() => import('../panels/facturacion/FacturacionConfigPanel').then((m) => m.FacturacionConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const HRMConfigPanel = dynamic(() => import('../panels/hrm/HRMConfigPanel').then((m) => m.HRMConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const PMSConfigPanel = dynamic(() => import('../panels/pms/PMSConfigPanel').then((m) => m.PMSConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const POSConfigPanel = dynamic(() => import('../panels/pos/POSConfigPanel').then((m) => m.POSConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const ChatConfigPanel = dynamic(() => import('../panels/chat/ChatConfigPanel').then((m) => m.ChatConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const CRMConfigPanel = dynamic(() => import('../panels/crm/CRMConfigPanel').then((m) => m.CRMConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const GeneralConfigPanel = dynamic(() => import('../panels/general/GeneralConfigPanel').then((m) => m.GeneralConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

const WebsiteConfigPanel = dynamic(() => import('../panels/sitioweb/WebsiteConfigPanel').then((m) => m.WebsiteConfigPanel), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

const PANEL_MAP: Record<string, React.ComponentType> = {
  general: GeneralConfigPanel,
  sitioweb: WebsiteConfigPanel,
  parking: ParkingConfigPanel,
  timeline: TimelineConfigPanel,
  integraciones: IntegracionesConfigPanel,
  roles: RolesConfigPanel,
  calendario: CalendarioConfigPanel,
  gym: GymConfigPanel,
  notificaciones: NotificacionesConfigPanel,
  facturacion: FacturacionConfigPanel,
  hrm: HRMConfigPanel,
  pms: PMSConfigPanel,
  pos: POSConfigPanel,
  chat: ChatConfigPanel,
  crm: CRMConfigPanel,
};

interface ConfiguracionPanelRendererProps {
  moduleId: string;
}

export function ConfiguracionPanelRenderer({ moduleId }: ConfiguracionPanelRendererProps) {
  const Panel = PANEL_MAP[moduleId];

  if (!Panel) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Este panel estará disponible en una próxima fase.
        </p>
      </div>
    );
  }

  return <Panel />;
}
