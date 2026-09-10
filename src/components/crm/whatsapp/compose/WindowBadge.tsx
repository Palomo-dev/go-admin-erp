'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { describeWindow } from '@/lib/services/crm/whatsapp/windowService';
import type { WindowInfo } from '../api';

/** Badge accesible (role=status) de la ventana de 24 h; el countdown se recalcula cada minuto. */
export function WindowBadge({ window, error }: { window: WindowInfo | null; error?: string | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  if (error) return <Badge variant="destructive" role="status" className="text-[11px]">{error}</Badge>;
  if (!window) return <Badge variant="outline" role="status" className="text-[11px]">Consultando ventana…</Badge>;
  const label = describeWindow(window);
  return (
    <Badge variant={window.is_open ? 'success' : 'secondary'} role="status" aria-live="polite" className="text-[11px] gap-1">
      <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${window.is_open ? 'bg-emerald-600' : 'bg-gray-400'}`} />
      {label}
    </Badge>
  );
}
