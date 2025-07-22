"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, CalendarIcon, ChevronDownIcon, RefreshCw, TrendingUp, LineChart } from "lucide-react";
import { formatCurrency } from "@/utils/Utils";
import { currencyService } from "@/lib/services/currencyService";
import { MonthlyForecast, ForecastOpportunity, getMonthlyForecast } from "@/lib/services/forecastService";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface MonthlyForecastViewProps {
  pipelineId: string;
}

const MonthlyForecastView: React.FC<MonthlyForecastViewProps> = ({ pipelineId }) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState<boolean>(true);
  const [monthlyForecasts, setMonthlyForecasts] = useState<MonthlyForecast[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [baseCurrency, setBaseCurrency] = useState<string>("USD");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>([]);
  const [includeWon, setIncludeWon] = useState<boolean>(true);
  const [includeLost, setIncludeLost] = useState<boolean>(false);
  const [totalBruto, setTotalBruto] = useState<number>(0);
  const [totalPonderado, setTotalPonderado] = useState<number>(0);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Obtener el ID de la organización y cargar la moneda base
  useEffect(() => {
    const orgId = localStorage.getItem("currentOrganizationId");
    if (orgId) {
      const orgIdNum = Number(orgId);
      setOrganizationId(orgIdNum);
      
      // Cargar la moneda base de la organización
      const loadBaseCurrency = async () => {
        try {
          const baseCurrency = await currencyService.getBaseCurrency(orgIdNum);
          setBaseCurrency(baseCurrency);
          console.log(`Moneda base cargada: ${baseCurrency}`);
          
          // Cargar monedas disponibles
          const currencies = await currencyService.getAvailableCurrencies(orgIdNum);
          setAvailableCurrencies(currencies);
        } catch (error) {
          console.error("Error al cargar información de monedas:", error);
        }
      };
      
      loadBaseCurrency();
    }
  }, []);

  // Cargar datos de pronóstico
  useEffect(() => {
    const loadForecastData = async () => {
      if (!pipelineId || !organizationId) return;
      
      setLoading(true);
      
      try {
        const forecastData = await getMonthlyForecast(pipelineId, {
          baseCurrency,
          includeWon,
          includeLost
        });
        
        if (forecastData) {
          setMonthlyForecasts(forecastData.monthlyForecasts);
          setTotalBruto(forecastData.totals.totalAmount);
          setTotalPonderado(forecastData.totals.weightedAmount);
          
          // Seleccionar el mes actual por defecto si no hay mes seleccionado
          if (!selectedMonth && forecastData.monthlyForecasts.length > 0) {
            const currentDate = new Date();
            const currentMonthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
            
            // Buscar el mes actual en los pronósticos
            const currentMonth = forecastData.monthlyForecasts.find(m => m.month === currentMonthKey);
            
            // Si existe el mes actual, seleccionarlo; de lo contrario, usar el primer mes
            setSelectedMonth(currentMonth ? currentMonth.month : forecastData.monthlyForecasts[0].month);
          }
        }
      } catch (error) {
        console.error("Error al cargar datos de pronóstico mensual:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadForecastData();
  }, [pipelineId, baseCurrency, includeWon, includeLost, refreshTrigger]);

  // Obtener los datos del mes seleccionado
  const selectedMonthData = selectedMonth
    ? monthlyForecasts.find((m) => m.month === selectedMonth)
    : null;

  // Función para manejar la actualización manual
  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Pronóstico Mensual</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Opciones de configuración */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Configuración de pronóstico</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            <div className="flex items-center space-x-2">
              <Switch 
                id="include-won" 
                checked={includeWon} 
                onCheckedChange={setIncludeWon} 
              />
              <Label htmlFor="include-won">Incluir ganadas</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="include-lost" 
                checked={includeLost} 
                onCheckedChange={setIncludeLost} 
              />
              <Label htmlFor="include-lost">Incluir perdidas</Label>
            </div>
            
            <div className="flex-grow"></div>
            
            <Select
              value={baseCurrency}
              onValueChange={(value) => setBaseCurrency(value)}
              disabled={loading}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Moneda" />
              </SelectTrigger>
              <SelectContent>
                {availableCurrencies.length > 0 ? (
                  availableCurrencies.map(currency => (
                    <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="COP">COP</SelectItem>
                    <SelectItem value="MXN">MXN</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Resumen de totales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-blue-50 dark:bg-blue-900/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total bruto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBruto, baseCurrency)}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-green-50 dark:bg-green-900/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total ponderado por probabilidad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPonderado, baseCurrency)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Selector de mes */}
      {!loading && monthlyForecasts.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2 pb-2">
            {monthlyForecasts.map((month) => (
              <Button
                key={month.month}
                variant={selectedMonth === month.month ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedMonth(month.month)}
                className={selectedMonth === month.month ? "bg-blue-600 hover:bg-blue-700" : ""}
              >
                <CalendarIcon className="h-3 w-3 mr-1" />
                {month.monthName}
                <Badge variant="secondary" className="ml-1 text-xs">
                  {month.opportunityCount}
                </Badge>
              </Button>
            ))}
          </div>

          {/* Detalles del mes seleccionado */}
          {selectedMonthData ? (
            <Card>
              <CardHeader>
                <CardTitle>{selectedMonthData.monthName}</CardTitle>
                <CardDescription>
                  {selectedMonthData.opportunityCount} oportunidades
                </CardDescription>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-2 text-sm text-muted-foreground">
                  <span className="flex gap-4 mt-1">
                    <span>Total: {formatCurrency(selectedMonthData.totalValue, baseCurrency)}</span>
                    <span>Ponderado: {formatCurrency(selectedMonthData.weightedValue, baseCurrency)}</span>
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {/* Tabla de oportunidades del mes */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Oportunidad</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Prob.</TableHead>
                      <TableHead>Ponderado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedMonthData.opportunities.map((opp, index) => (
                      <TableRow key={`${opp.id}-${index}`}>
                        <TableCell className="font-medium">{opp.name}</TableCell>
                        <TableCell>{opp.customer_name || "-"}</TableCell>
                        <TableCell>{opp.stage_name}</TableCell>
                        <TableCell>
                          {opp.currency === baseCurrency ? 
                            formatCurrency(opp.amount, opp.currency) :
                            <>
                              <div>{formatCurrency(opp.amount, opp.currency)}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                ({formatCurrency(opp.convertedAmount, baseCurrency)})
                              </div>
                            </>
                          }
                        </TableCell>
                        <TableCell>{Math.round(opp.probability * 100)}%</TableCell>
                        <TableCell>{formatCurrency(opp.weightedAmount, baseCurrency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="border-t pt-3 flex justify-between">
                <div className="text-muted-foreground text-sm">
                  {selectedMonthData.month === "sin-fecha" 
                    ? "Oportunidades sin fecha de cierre estimada" 
                    : `Cierre estimado para ${selectedMonthData.monthName}`
                  }
                </div>
                <Badge variant="outline" className="font-normal">
                  Conversiones en {baseCurrency}
                </Badge>
              </CardFooter>
            </Card>
          ) : null}
        </>
      ) : (
        <Card className="py-8">
          <CardContent className="flex flex-col items-center justify-center">
            {loading ? (
              <LoadingSpinner />
            ) : (
              <>
                <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No hay datos de pronóstico disponibles</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Cree oportunidades con fechas de cierre estimadas para ver el pronóstico
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MonthlyForecastView;
