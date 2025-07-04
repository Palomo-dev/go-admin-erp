import React, { useState, useEffect } from "react";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { ArrowPathIcon, CurrencyDollarIcon, KeyIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase/config";

interface ConfiguracionOpenExchange {
  id: string;
  api_key: string | null;
  last_update: string | null;
  created_at: string;
  updated_at: string;
}

export default function AutoUpdateSettings() {
  const { organization } = useOrganization();
  const [cargando, setCargando] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [editandoApiKey, setEditandoApiKey] = useState(false);
  const [configuracion, setConfiguracion] = useState<ConfiguracionOpenExchange | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);
  const [actualizacionAutomatica, setActualizacionAutomatica] = useState(false);

  // Cargar configuración actual
  useEffect(() => {
    const cargarConfiguracion = async () => {
      if (!organization?.id) return;
      
      setCargando(true);
      
      try {
        const { data, error } = await supabase
          .from("openexchangerates_config")
          .select("*")
          .single();
        
        if (error) {
          console.error("Error al cargar configuración:", error);
          toast({
            title: "Error al cargar configuración",
            description: error.message,
            variant: "destructive"
          });
          return;
        }
        
        if (data) {
          setConfiguracion(data);
          setApiKey(data.api_key || "");
          setUltimaActualizacion(data.last_update);
        }
      } catch (error) {
        console.error("Error al cargar configuración:", error);
      } finally {
        setCargando(false);
      }
    };
    
    cargarConfiguracion();
  }, [organization?.id]);
  
  // Cargar estado de actualización automática
  useEffect(() => {
    const cargarEstadoActualizacionAutomatica = async () => {
      if (!organization?.id) return;
      
      try {
        const { data, error } = await supabase
          .from("organization_preferences")
          .select("settings")
          .eq("organization_id", organization.id)
          .single();
        
        if (error) {
          console.error("Error al cargar preferencias:", error);
          return;
        }
        
        if (data?.settings?.finance?.autoUpdateExchangeRates) {
          setActualizacionAutomatica(data.settings.finance.autoUpdateExchangeRates);
        }
      } catch (error) {
        console.error("Error al cargar preferencias:", error);
      }
    };
    
    cargarEstadoActualizacionAutomatica();
  }, [organization?.id]);

  // Guardar API key
  const guardarApiKey = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "API Key requerida",
        description: "Por favor ingrese una API Key válida",
        variant: "destructive"
      });
      return;
    }
    
    setCargando(true);
    
    try {
      const { data, error } = await supabase
        .from("openexchangerates_config")
        .upsert(
          { 
            id: configuracion?.id || undefined,
            api_key: apiKey,
            updated_at: new Date().toISOString() 
          },
          { onConflict: "id" }
        )
        .select()
        .single();
      
      if (error) {
        console.error("Error al guardar API key:", error);
        toast({
          title: "Error al guardar API key",
          description: error.message,
          variant: "destructive"
        });
        return;
      }
      
      setConfiguracion(data);
      setEditandoApiKey(false);
      
      toast({
        title: "API Key guardada",
        description: "La API Key se guardó correctamente"
      });
    } catch (error) {
      console.error("Error al guardar API key:", error);
      toast({
        title: "Error al guardar API key",
        description: "Ocurrió un error al guardar la API Key",
        variant: "destructive"
      });
    } finally {
      setCargando(false);
    }
  };

  // Actualizar tasas de cambio manualmente
  const actualizarTasas = async () => {
    if (!organization?.id) return;
    
    setActualizando(true);
    
    try {
      const { error } = await supabase.rpc(
        "update_exchange_rates", 
        { org_id: organization.id }
      );
      
      if (error) {
        console.error("Error al actualizar tasas:", error);
        toast({
          title: "Error al actualizar tasas",
          description: error.message,
          variant: "destructive"
        });
        return;
      }
      
      // Actualizar última actualización
      const { data } = await supabase
        .from("openexchangerates_config")
        .select("last_update")
        .single();
        
      if (data) {
        setUltimaActualizacion(data.last_update);
      }
      
      toast({
        title: "Tasas actualizadas",
        description: "Las tasas de cambio se actualizaron correctamente"
      });
    } catch (error) {
      console.error("Error al actualizar tasas:", error);
      toast({
        title: "Error al actualizar tasas",
        description: "Ocurrió un error al actualizar las tasas de cambio",
        variant: "destructive"
      });
    } finally {
      setActualizando(false);
    }
  };

  // Cambiar estado de actualización automática
  const cambiarActualizacionAutomatica = async (estado: boolean) => {
    if (!organization?.id) return;
    
    setCargando(true);
    
    try {
      const { data: preferenciasActuales, error: errorConsulta } = await supabase
        .from("organization_preferences")
        .select("settings")
        .eq("organization_id", organization.id)
        .single();
      
      if (errorConsulta && errorConsulta.code !== "PGRST116") { // No se encontró registro
        console.error("Error al consultar preferencias:", errorConsulta);
        return;
      }
      
      // Preparar ajustes actualizados
      const settingsActualizados = {
        ...(preferenciasActuales?.settings || {}),
        finance: {
          ...(preferenciasActuales?.settings?.finance || {}),
          autoUpdateExchangeRates: estado
        }
      };
      
      // Guardar preferencias
      const { error } = await supabase
        .from("organization_preferences")
        .upsert({
          organization_id: organization.id,
          settings: settingsActualizados
        })
        .select();
      
      if (error) {
        console.error("Error al actualizar preferencias:", error);
        toast({
          title: "Error al guardar preferencias",
          description: error.message,
          variant: "destructive"
        });
        return;
      }

      setActualizacionAutomatica(estado);

      toast({
        title: "Configuración guardada",
        description: `Actualización automática ${estado ? "activada" : "desactivada"}`
      });
    } catch (error) {
      console.error("Error al actualizar preferencias:", error);
      toast({
        title: "Error al guardar preferencias",
        description: "Ocurrió un error al guardar las preferencias",
        variant: "destructive"
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CurrencyDollarIcon className="w-5 h-5" />
          Configuración de actualización automática
        </CardTitle>
        <CardDescription>
          Configura la API key para OpenExchangeRates y la actualización automática de tasas de cambio
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* API Key */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="apiKey" className="text-base font-semibold">API Key de OpenExchangeRates</Label>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setEditandoApiKey(!editandoApiKey)}
              disabled={cargando}
            >
              <PencilSquareIcon className="w-4 h-4 mr-1" />
              {editandoApiKey ? "Cancelar" : "Editar"}
            </Button>
          </div>

          {editandoApiKey ? (
            <div className="flex items-center space-x-2">
              <Input
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Ingrese su API key"
                disabled={cargando}
              />
              <Button 
                onClick={guardarApiKey} 
                disabled={cargando}
              >
                <KeyIcon className="w-4 h-4 mr-1" />
                Guardar
              </Button>
            </div>
          ) : (
            <div className="text-sm p-2 bg-muted rounded-md">
              {apiKey ? 
                `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}` : 
                "No configurado"}
            </div>
          )}
        </div>

        {/* Última actualización */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">Última actualización</Label>
          <div className="text-sm p-2 bg-muted rounded-md">
            {ultimaActualizacion ? 
              format(new Date(ultimaActualizacion), "PPpp", { locale: es }) : 
              "No hay datos de actualización"}
          </div>
        </div>

        {/* Actualización manual */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">Actualización manual</Label>
          <Button
            variant="outline"
            onClick={actualizarTasas}
            disabled={actualizando || cargando || !apiKey}
            className="w-full"
          >
            {actualizando ? (
              <>
                <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                Actualizando...
              </>
            ) : (
              <>
                <ArrowPathIcon className="w-4 h-4 mr-2" />
                Actualizar tasas ahora
              </>
            )}
          </Button>
        </div>

        {/* Actualización automática */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label className="text-base font-semibold">Actualización automática</Label>
            <Switch
              checked={actualizacionAutomatica}
              onCheckedChange={cambiarActualizacionAutomatica}
              disabled={cargando}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Actualiza automáticamente las tasas de cambio diariamente
          </p>
        </div>
      </CardContent>
      
      <CardFooter>
        <p className="text-xs text-muted-foreground w-full text-center">
          Las tasas se actualizan automáticamente a las 2:00 AM UTC
        </p>
      </CardFooter>
    </Card>
  );
}
