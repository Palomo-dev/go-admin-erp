'use client';

/**
 * Pagina de gestion de consentimientos Open Finance.
 * Cumplimiento Decreto 0368 de 2026.
 * Lista consentimientos, permite filtrar, revocar y renovar.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Clock,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** Tipo de consentimiento */
type ConsentType = 'data_access' | 'payment_initiation' | 'account_validation';

/** Consentimiento con informacion del link asociado */
interface ConsentRow {
  id: string;
  organization_id: number;
  link_id: string | null;
  consent_type: ConsentType;
  purpose: string | null;
  scope: string[] | string | null;
  granted_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  granted_by: string | null;
  status: 'active' | 'revoked' | 'expired';
  created_at?: string;
  updated_at?: string;
  link?: { id: string; institution_name: string | null; status: string | null } | null;
}

/** Estadisticas de consentimientos */
interface ConsentStats {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  byType: { data_access: number; payment_initiation: number; account_validation: number };
}

/** Etiquetas legibles para tipos de consentimiento */
const CONSENT_TYPE_LABELS: Record<ConsentType, string> = {
  data_access: 'Acceso a datos',
  payment_initiation: 'Iniciacion de pago',
  account_validation: 'Validacion de cuenta',
};

/** Variantes de badge por estado */
const STATUS_BADGE_VARIANT: Record<string, 'success' | 'destructive' | 'secondary'> = {
  active: 'success',
  revoked: 'destructive',
  expired: 'secondary',
};

/** Etiquetas legibles para estados */
const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  revoked: 'Revocado',
  expired: 'Expirado',
};

/** Dias de antelacion para mostrar boton de renovacion */
const RENEW_THRESHOLD_DAYS = 7;

/** Formatea una fecha ISO a formato legible */
function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Determina si un consentimiento esta proximo a expirar */
function isNearExpiry(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  const now = Date.now();
  const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= RENEW_THRESHOLD_DAYS;
}

export default function ConsentsPage() {
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [stats, setStats] = useState<ConsentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [revokeTarget, setRevokeTarget] = useState<ConsentRow | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);

  /** Carga la lista de consentimientos segun filtros */
  const loadConsents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('consentType', typeFilter);

      const res = await fetch(
        `/api/integrations/open-finance/consents?${params.toString()}`,
      );
      if (!res.ok) throw new Error('Error al cargar consentimientos');
      const json = await res.json() as { data: ConsentRow[] };
      setConsents(json.data || []);
    } catch (error) {
      console.error('Error cargando consentimientos:', error);
      toast.error('Error al cargar los consentimientos');
    }
  }, [statusFilter, typeFilter]);

  /** Carga las estadisticas de consentimientos */
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/open-finance/consents/stats');
      if (!res.ok) throw new Error('Error al cargar estadisticas');
      const json = await res.json() as { data: ConsentStats };
      setStats(json.data);
    } catch (error) {
      console.error('Error cargando estadisticas:', error);
    }
  }, []);

  /** Carga inicial y cuando cambian los filtros */
  useEffect(() => {
    setIsLoading(true);
    Promise.all([loadConsents(), loadStats()]).finally(() => setIsLoading(false));
  }, [loadConsents, loadStats]);

  /** Confirma la revocacion de un consentimiento */
  const handleConfirmRevoke = async () => {
    if (!revokeTarget || !revokeReason.trim()) {
      toast.error('Debe ingresar un motivo de revocacion');
      return;
    }
    setIsRevoking(true);
    try {
      const res = await fetch(`/api/integrations/open-finance/consents/${revokeTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revokeReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || 'Error al revocar consentimiento');
      }
      toast.success('Consentimiento revocado correctamente');
      setRevokeTarget(null);
      setRevokeReason('');
      await Promise.all([loadConsents(), loadStats()]);
    } catch (error) {
      console.error('Error revocando consentimiento:', error);
      toast.error(error instanceof Error ? error.message : 'Error al revocar');
    } finally {
      setIsRevoking(false);
    }
  };

  /** Renueva un consentimiento proximo a expirar */
  const handleRenew = async (consentId: string) => {
    setRenewingId(consentId);
    try {
      const res = await fetch(
        `/api/integrations/open-finance/consents/${consentId}/renew`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || 'Error al renovar consentimiento');
      }
      toast.success('Consentimiento renovado por 90 dias mas');
      await Promise.all([loadConsents(), loadStats()]);
    } catch (error) {
      console.error('Error renovando consentimiento:', error);
      toast.error(error instanceof Error ? error.message : 'Error al renovar');
    } finally {
      setRenewingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Consentimientos Open Finance
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gestion de autorizaciones de acceso a datos financieros
          </p>
        </div>
      </div>

      {/* Banner informativo sobre derechos del usuario */}
      <Alert variant="info">
        <ShieldCheck className="h-5 w-5" />
        <AlertTitle>Tus derechos sobre los datos financieros</AlertTitle>
        <AlertDescription className="text-sm">
          Conforme al Decreto 0368 de 2026, tienes derecho a autorizar, revocar
          y renovar el acceso a tus datos financieros en cualquier momento.
          Los consentimientos tienen una duracion maxima de 90 dias y puedes
          revocarlos cuando lo desees sin afectar otros servicios.
        </AlertDescription>
      </Alert>

      {/* Estadisticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.total ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Activos</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.active ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Revocados</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.revoked ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-gray-500 dark:text-gray-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Expirados</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.expired ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">
            Lista de consentimientos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="revoked">Revocados</SelectItem>
                <SelectItem value="expired">Expirados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="sm:w-56">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="data_access">Acceso a datos</SelectItem>
                <SelectItem value="payment_initiation">Iniciacion de pago</SelectItem>
                <SelectItem value="account_validation">Validacion de cuenta</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabla */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Proposito</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Autorizado</TableHead>
                <TableHead>Expiracion</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                    Cargando consentimientos...
                  </TableCell>
                </TableRow>
              ) : consents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                    No hay consentimientos registrados
                  </TableCell>
                </TableRow>
              ) : (
                consents.map((consent) => (
                  <TableRow key={consent.id}>
                    <TableCell className="font-medium">
                      {CONSENT_TYPE_LABELS[consent.consent_type] ?? consent.consent_type}
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={consent.purpose ?? ''}>
                      {consent.purpose ?? '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[consent.status] ?? 'secondary'}>
                        {STATUS_LABELS[consent.status] ?? consent.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(consent.granted_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{formatDate(consent.expires_at)}</span>
                        {isNearExpiry(consent.expires_at) && consent.status === 'active' && (
                          <Clock className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {consent.status === 'active' && isNearExpiry(consent.expires_at) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRenew(consent.id)}
                            disabled={renewingId === consent.id}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Renovar
                          </Button>
                        )}
                        {consent.status === 'active' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setRevokeTarget(consent);
                              setRevokeReason('');
                            }}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Revocar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog de confirmacion de revocacion */}
      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeTarget(null);
            setRevokeReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
              Revocar consentimiento
            </DialogTitle>
            <DialogDescription>
              Estas a punto de revocar el consentimiento{' '}
              <strong>{revokeTarget?.purpose ?? ''}</strong>. Esta accion
              interrumpira el acceso a los datos financieros asociados y no
              puede deshacerse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Motivo de revocacion
            </label>
            <textarea
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Describe el motivo de la revocacion..."
              className="w-full min-h-[80px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRevokeTarget(null);
                setRevokeReason('');
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRevoke}
              disabled={isRevoking || !revokeReason.trim()}
            >
              {isRevoking ? 'Revocando...' : 'Revocar consentimiento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
