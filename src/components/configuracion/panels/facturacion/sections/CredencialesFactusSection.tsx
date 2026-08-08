'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Save, TestTube, Loader2, ShieldCheck, Zap } from 'lucide-react';

interface FacturacionConfig {
  provider: string;
  environment: 'sandbox' | 'production';
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  isActive: boolean;
}

interface CredencialesFactusSectionProps {
  config: FacturacionConfig;
  onConfigChange: (config: FacturacionConfig) => void;
  onSave: () => void;
  onTest: () => void;
  saving: boolean;
  testing: boolean;
  eInvoiceAlwaysEnabled: boolean;
  savingEInvoiceToggle: boolean;
  loadingEInvoicePref: boolean;
  onEInvoiceToggle: (checked: boolean) => void;
}

export function CredencialesFactusSection({
  config,
  onConfigChange,
  onSave,
  onTest,
  saving,
  testing,
  eInvoiceAlwaysEnabled,
  savingEInvoiceToggle,
  loadingEInvoicePref,
  onEInvoiceToggle,
}: CredencialesFactusSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-500" />
          Credenciales de Factus
        </CardTitle>
        <CardDescription>
          Las credenciales se obtienen desde el panel de Factus. Use el ambiente sandbox para pruebas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="environment">Ambiente</Label>
            <Select
              value={config.environment}
              onValueChange={(v) => onConfigChange({ ...config, environment: v as 'sandbox' | 'production' })}
            >
              <SelectTrigger id="environment"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (Pruebas)</SelectItem>
                <SelectItem value="production">Producción</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider">Proveedor</Label>
            <Select value={config.provider} onValueChange={(v) => onConfigChange({ ...config, provider: v })}>
              <SelectTrigger id="provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="factus">Factus</SelectItem>
                <SelectItem value="carvajal">Carvajal</SelectItem>
                <SelectItem value="siigo">Siigo</SelectItem>
                <SelectItem value="alegra">Alegra</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="clientId">Client ID</Label>
          <Input id="clientId" value={config.clientId} onChange={(e) => onConfigChange({ ...config, clientId: e.target.value })} placeholder="Ej: a2443431-24c0-4e4b-8289-dd7913d7d5a0" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="clientSecret">Client Secret</Label>
          <Input id="clientSecret" type="password" value={config.clientSecret} onChange={(e) => onConfigChange({ ...config, clientSecret: e.target.value })} placeholder="Client Secret de Factus" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Usuario / Email</Label>
          <Input id="username" value={config.username} onChange={(e) => onConfigChange({ ...config, username: e.target.value })} placeholder="Ej: sandboxv2@factus.com.co" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" value={config.password} onChange={(e) => onConfigChange({ ...config, password: e.target.value })} placeholder="Contraseña de Factus" />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Switch checked={config.isActive} onCheckedChange={(checked) => onConfigChange({ ...config, isActive: checked })} />
          <Label className="text-sm">Configuración activa</Label>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <div>
              <Label className="text-sm font-medium">Facturar siempre como electrónica</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Activa automáticamente el toggle de factura electrónica en POS, pre-cuenta y nuevas facturas</p>
            </div>
          </div>
          <Switch checked={eInvoiceAlwaysEnabled} disabled={savingEInvoiceToggle || loadingEInvoicePref} onCheckedChange={onEInvoiceToggle} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <Button onClick={onSave} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar
          </Button>
          <Button onClick={onTest} disabled={testing} variant="outline" className="flex-1">
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube className="h-4 w-4 mr-2" />}
            Probar conexión
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
