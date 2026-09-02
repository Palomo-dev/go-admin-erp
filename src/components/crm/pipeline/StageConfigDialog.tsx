"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { supabase } from "@/lib/supabase/config";
import { Stage } from "@/types/crm";
import { ColorInput } from "./ColorInput";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Trophy, XCircle } from "lucide-react";

interface StageConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  stage: Stage;
  onStageUpdate: (updatedStage: Stage) => void;
}

const formSchema = z.object({
  name: z.string().min(1, "El nombre de la etapa es obligatorio"),
  probability: z.number().min(0).max(1),
  color: z.string().regex(/^#([0-9A-F]{6})$/i, "Color inválido"),
  description: z.string().optional(),
  is_won: z.boolean(),
  is_lost: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function StageConfigDialog({
  isOpen,
  onClose,
  stage,
  onStageUpdate,
}: StageConfigDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: stage.name || "",
      probability: Number(stage.probability) || 0,
      color: stage.color || "#3498db",
      description: stage.description || "",
      is_won: Boolean(stage.is_won),
      is_lost: Boolean(stage.is_lost),
    },
  });

  // Actualizar el formulario cuando cambia la etapa seleccionada
  useEffect(() => {
    if (isOpen) {
      form.reset({
        name: stage.name || "",
        probability: Number(stage.probability) || 0,
        color: stage.color || "#3498db",
        description: stage.description || "",
        is_won: Boolean(stage.is_won),
        is_lost: Boolean(stage.is_lost),
      });
    }
  }, [stage, isOpen, form]);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      // Actualizar la etapa en Supabase (probability se guarda como decimal 0-1)
      const { error } = await supabase
        .from("stages")
        .update({
          name: values.name,
          probability: values.probability,
          color: values.color,
          description: values.description,
          is_won: values.is_won,
          is_lost: values.is_lost,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stage.id);

      if (error) throw error;

      // Actualizar el estado local
      const updatedStage = {
        ...stage,
        name: values.name,
        probability: values.probability,
        color: values.color,
        description: values.description,
        is_won: values.is_won,
        is_lost: values.is_lost,
      };

      onStageUpdate(updatedStage);
      toast({
        title: "Configuración actualizada",
        description: "La etapa ha sido actualizada correctamente",
        variant: "default",
      });
      onClose();
    } catch (error: any) {
      console.error("Error al actualizar la etapa:", error);
      toast({
        title: "Error",
        description: `No se pudo actualizar la etapa: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Configuración de Etapa</DialogTitle>
          <DialogDescription>
            Personaliza las propiedades de esta etapa del pipeline.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre de la etapa" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="probability"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Probabilidad (%): {Math.round(field.value * 100)}</FormLabel>
                  <FormControl>
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={[field.value]}
                      onValueChange={(values) => field.onChange(values[0])}
                      className="mt-2"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl>
                    <ColorInput
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input placeholder="Descripción opcional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tipo de etapa: ganada / perdida */}
            <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Tipo de etapa
              </p>

              <FormField
                control={form.control}
                name="is_won"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-green-500" />
                      <div>
                        <FormLabel className="text-sm cursor-pointer">Etapa de cierre ganado</FormLabel>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Al mover aquí una oportunidad se abre el formulario de Closed Won
                        </p>
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_lost"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <div>
                        <FormLabel className="text-sm cursor-pointer">Etapa de cierre perdido</FormLabel>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Al mover aquí una oportunidad se abre el dialog de razón de pérdida
                        </p>
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} type="button">
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar cambios"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
