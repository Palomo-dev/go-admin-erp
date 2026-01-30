"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase/config";
import { Loader2, Save, Building2, Landmark, Wallet, Info, AlertCircle } from "lucide-react";

interface AccountMappingFormProps {
  initialMapping: Record<string, string>;
  onSave: (mapping: Record<string, string>) => void;
}

interface ChartAccount {
  code: string;
  name: string;
  type: string;
}

interface BankAccount {
  id: number;
  name: string;
  bank_name: string;
  account_number: string;
  account_type: string;
}

export default function AccountMappingForm({
  initialMapping,
  onSave
}: AccountMappingFormProps) {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping || {});
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Cargar cuentas contables y bancarias
  useEffect(() => {
    if (organizationId) {
      loadAccountingData();
    }
  }, [organizationId]);

  // Actualizar mapping cuando cambia initialMapping
  useEffect(() => {
    if (initialMapping && Object.keys(initialMapping).length > 0) {
      setMapping(initialMapping);
    }
  }, [initialMapping]);

  const loadAccountingData = async () => {
    if (!organizationId) return;
    
    try {
      setIsLoading(true);
      
      // Cargar cuentas contables desde chart_of_accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('chart_of_accounts')
        .select('account_code, name, type')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('account_code', { ascending: true });
      
      if (accountsError) {
        console.error("Error al cargar cuentas contables:", accountsError);
      } else {
        setChartAccounts(accountsData?.map(acc => ({
          code: acc.account_code,
          name: acc.name,
          type: acc.type
        })) || []);
      }
      
      // Cargar cuentas bancarias
      const { data: bankData, error: bankError } = await supabase
        .from('bank_accounts')
        .select('id, name, bank_name, account_number, account_type')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('bank_name', { ascending: true });
      
      if (bankError) {
        console.error("Error al cargar cuentas bancarias:", bankError);
      } else {
        setBankAccounts(bankData || []);
      }
      
    } catch (error: any) {
      console.error("Error al cargar datos contables:", error.message);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos contables",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateMapping = (key: string, value: string) => {
    setMapping(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    setIsSaving(true);
    
    try {
      const filteredMapping = Object.fromEntries(
        Object.entries(mapping).filter(([_, value]) => value !== "" && value !== "none")
      );
      
      console.log("Guardando mapeo de cuentas:", filteredMapping);
      onSave(filteredMapping);
      
      toast({
        title: "Mapeo aplicado",
        description: "La configuración contable se aplicará al guardar el método de pago",
      });
    } catch (error) {
      console.error("Error al guardar mapeo de cuentas:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const getAccountTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'asset': 'Activo',
      'liability': 'Pasivo',
      'equity': 'Patrimonio',
      'income': 'Ingreso',
      'expense': 'Gasto'
    };
    return labels[type] || type;
  };

  const renderBankAccountSelect = () => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-blue-600" />
        <Label className="text-sm font-medium dark:text-gray-200">Cuenta Bancaria Destino</Label>
      </div>
      <Select
        value={mapping['bank_account_id'] || "none"}
        onValueChange={(value) => updateMapping('bank_account_id', value)}
        disabled={isLoading}
      >
        <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
          <SelectValue placeholder="Selecciona una cuenta bancaria" />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
          <SelectItem value="none" className="dark:text-gray-300">Sin asignar</SelectItem>
          {bankAccounts.map((account) => (
            <SelectItem key={account.id} value={account.id.toString()} className="dark:text-gray-200">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-500" />
                <span>{account.name}</span>
                <Badge variant="outline" className="ml-2 text-xs">
                  {account.bank_name}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Donde se depositarán los pagos recibidos con este método
      </p>
    </div>
  );

  const renderChartAccountSelect = (key: string, label: string, description: string, filterType?: string) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-green-600" />
        <Label className="text-sm font-medium dark:text-gray-200">{label}</Label>
      </div>
      <Select
        value={mapping[key] || "none"}
        onValueChange={(value) => updateMapping(key, value)}
        disabled={isLoading}
      >
        <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
          <SelectValue placeholder="Selecciona una cuenta" />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
          <SelectItem value="none" className="dark:text-gray-300">Sin asignar</SelectItem>
          {chartAccounts.length > 0 ? (
            <>
              {['asset', 'liability', 'equity', 'income', 'expense'].map(type => {
                const accountsOfType = chartAccounts.filter(acc => acc.type === type);
                if (accountsOfType.length === 0) return null;
                if (filterType && type !== filterType) return null;
                
                return (
                  <SelectGroup key={type}>
                    <SelectLabel className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                      {getAccountTypeLabel(type)}
                    </SelectLabel>
                    {accountsOfType.map((account) => (
                      <SelectItem key={account.code} value={account.code} className="dark:text-gray-200">
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </>
          ) : (
            <div className="p-2 text-sm text-gray-500 dark:text-gray-400 text-center">
              No hay cuentas contables configuradas
            </div>
          )}
        </SelectContent>
      </Select>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );

  return (
    <Card className="dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg text-blue-600 dark:text-blue-400">
          <Landmark className="h-5 w-5" />
          Configuración Contable
        </CardTitle>
        <CardDescription className="dark:text-gray-400">
          Vincula este método de pago con tus cuentas contables y bancarias
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando cuentas...</span>
          </div>
        ) : (
          <>
            {/* Cuentas Bancarias */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Cuentas Bancarias</h3>
                <Badge variant="secondary" className="ml-2">{bankAccounts.length}</Badge>
              </div>
              
              {bankAccounts.length > 0 ? (
                renderBankAccountSelect()
              ) : (
                <Alert className="dark:bg-yellow-900/20 dark:border-yellow-800">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-sm dark:text-yellow-200">
                    No tienes cuentas bancarias configuradas.{" "}
                    <a href="/app/finanzas/bancos/cuentas" className="underline font-medium">
                      Crear cuenta bancaria
                    </a>
                  </AlertDescription>
                </Alert>
              )}
            </div>
            
            <Separator className="dark:bg-gray-700" />
            
            {/* Cuentas Contables */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Cuentas Contables</h3>
                <Badge variant="secondary" className="ml-2">{chartAccounts.length}</Badge>
              </div>
              
              {chartAccounts.length > 0 ? (
                <div className="grid gap-4">
                  {renderChartAccountSelect(
                    'income_account',
                    'Cuenta de Ingresos',
                    'Cuenta donde se registrarán los ingresos por este método',
                    'income'
                  )}
                  {renderChartAccountSelect(
                    'receivable_account',
                    'Cuenta por Cobrar',
                    'Para pagos pendientes o diferidos',
                    'asset'
                  )}
                  {renderChartAccountSelect(
                    'cash_account',
                    'Cuenta de Caja/Efectivo',
                    'Para métodos de pago en efectivo',
                    'asset'
                  )}
                </div>
              ) : (
                <Alert className="dark:bg-blue-900/20 dark:border-blue-800">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-sm dark:text-blue-200">
                    No tienes un plan de cuentas configurado.{" "}
                    <a href="/app/finanzas/contabilidad/plan-cuentas" className="underline font-medium">
                      Configurar plan de cuentas
                    </a>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between border-t dark:border-gray-700 pt-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <Info className="h-3 w-3" />
          La configuración contable es opcional
        </div>
        <Button 
          onClick={handleSave} 
          disabled={isLoading || isSaving}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          Aplicar Configuración
        </Button>
      </CardFooter>
    </Card>
  );
}
