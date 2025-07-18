import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/config";
import { Loader2, Save, PlusCircle } from "lucide-react";

interface AccountMappingFormProps {
  initialMapping: Record<string, string>;
  onSave: (mapping: Record<string, string>) => void;
}

interface AccountCategory {
  id: number;
  name: string;
}

interface ChartAccount {
  id: number;
  code: string;
  name: string;
  category_id: number;
}

export default function AccountMappingForm({
  initialMapping,
  onSave
}: AccountMappingFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping || {});
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  
  // Mapeos predeterminados por tipo de operación
  const defaultMappings = [
    { key: "income", label: "Cuenta de Ingresos" },
    { key: "receivable", label: "Cuenta por Cobrar" },
    { key: "bank", label: "Cuenta Bancaria" },
    { key: "cash", label: "Caja Efectivo" }
  ];

  // Cargar categorías y cuentas contables al iniciar
  useEffect(() => {
    const loadAccountingData = async () => {
      try {
        setIsLoading(true);
        
        // Esta es una simulación ya que no tenemos acceso real a las tablas de contabilidad
        // En una implementación real, cargaríamos las categorías y cuentas desde Supabase
        
        // Ejemplo de categorías simuladas
        const mockCategories: AccountCategory[] = [
          { id: 1, name: "Activos" },
          { id: 2, name: "Pasivos" },
          { id: 3, name: "Patrimonio" },
          { id: 4, name: "Ingresos" },
          { id: 5, name: "Gastos" }
        ];
        
        // Ejemplo de cuentas simuladas
        const mockAccounts: ChartAccount[] = [
          { id: 1, code: "1010", name: "Caja General", category_id: 1 },
          { id: 2, code: "1020", name: "Bancos", category_id: 1 },
          { id: 3, code: "1030", name: "Cuentas por Cobrar", category_id: 1 },
          { id: 4, code: "4010", name: "Ingresos por Ventas", category_id: 4 },
          { id: 5, code: "4020", name: "Ingresos por Servicios", category_id: 4 },
          { id: 6, code: "5010", name: "Gastos Financieros", category_id: 5 }
        ];
        
        setCategories(mockCategories);
        setAccounts(mockAccounts);
        
        // Inicializar el mapping con valores por defecto si está vacío
        if (Object.keys(mapping).length === 0) {
          const defaultMapping: Record<string, string> = {};
          defaultMappings.forEach(item => {
            if (!mapping[item.key]) {
              defaultMapping[item.key] = "none";
            }
          });
          setMapping({ ...mapping, ...defaultMapping });
        }
      } catch (error: any) {
        console.error("Error al cargar datos contables:", error.message);
        toast({
          title: "Error",
          description: "No se pudieron cargar las cuentas contables",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAccountingData();
  }, []);

  // Actualizar un mapeo específico
  const updateMapping = (key: string, value: string) => {
    setMapping(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Guardar los mapeos
  const handleSave = () => {
    setIsSaving(true);
    
    try {
      // Filtrar mapeos vacíos o con valor "none"
      const filteredMapping = Object.fromEntries(
        Object.entries(mapping).filter(([_, value]) => value !== "" && value !== "none")
      );
      
      console.log("Guardando mapeo de cuentas:", filteredMapping);
      onSave(filteredMapping);
    } catch (error) {
      console.error("Error al guardar mapeo de cuentas:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Renderizar campo de selección para cada tipo de mapeo
  const renderMappingField = (key: string, label: string) => (
    <div className="grid grid-cols-2 items-center gap-4">
      <Label htmlFor={`mapping-${key}`}>{label}</Label>
      <Select
        value={mapping[key] || "none"}
        onValueChange={(value) => updateMapping(key, value)}
        disabled={isLoading}
      >
        <SelectTrigger id={`mapping-${key}`}>
          <SelectValue placeholder="Selecciona una cuenta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Ninguna</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.code}>
              {account.code} - {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapeo Contable</CardTitle>
        <CardDescription>
          Configura las cuentas contables asociadas con este método de pago
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Cargando cuentas contables...</span>
          </div>
        ) : (
          <>
            {defaultMappings.map((item) => (
              <div key={item.key}>
                {renderMappingField(item.key, item.label)}
              </div>
            ))}
          </>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="text-sm text-muted-foreground">
          * La configuración contable es opcional
        </div>
        <Button 
          onClick={handleSave} 
          disabled={isLoading || isSaving}
          size="sm"
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          Aplicar Mapeo
        </Button>
      </CardFooter>
    </Card>
  );
}
