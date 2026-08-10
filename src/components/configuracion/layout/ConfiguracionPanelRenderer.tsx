'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const ParkingConfigPanel = dynamic(() => import('../panels/parking/ParkingConfigPanel').then((m) => m.ParkingConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const TimelineConfigPanel = dynamic(() => import('../panels/timeline/TimelineConfigPanel').then((m) => m.TimelineConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const IntegracionesConfigPanel = dynamic(() => import('../panels/integraciones/IntegracionesConfigPanel').then((m) => m.IntegracionesConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const RolesConfigPanel = dynamic(() => import('../panels/roles/RolesConfigPanel').then((m) => m.RolesConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const CalendarioConfigPanel = dynamic(() => import('../panels/calendario/CalendarioConfigPanel').then((m) => m.CalendarioConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const GymConfigPanel = dynamic(() => import('../panels/gym/GymConfigPanel').then((m) => m.GymConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const NotificacionesConfigPanel = dynamic(() => import('../panels/notificaciones/NotificacionesConfigPanel').then((m) => m.NotificacionesConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const FacturacionConfigPanel = dynamic(() => import('../panels/facturacion/FacturacionConfigPanel').then((m) => m.FacturacionConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const HRMConfigPanel = dynamic(() => import('../panels/hrm/HRMConfigPanel').then((m) => m.HRMConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const PMSConfigPanel = dynamic(() => import('../panels/pms/PMSConfigPanel').then((m) => m.PMSConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const POSConfigPanel = dynamic(() => import('../panels/pos/POSConfigPanel').then((m) => m.POSConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const ChatConfigPanel = dynamic(() => import('../panels/chat/ChatConfigPanel').then((m) => m.ChatConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const CRMConfigPanel = dynamic(() => import('../panels/crm/CRMConfigPanel').then((m) => m.CRMConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const GeneralConfigPanel = dynamic(() => import('../panels/general/GeneralConfigPanel').then((m) => m.GeneralConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const WebsiteConfigPanel = dynamic(() => import('../panels/sitioweb/WebsiteConfigPanel').then((m) => m.WebsiteConfigPanel), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
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
