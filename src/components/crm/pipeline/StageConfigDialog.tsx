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
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { supabase } from "@/lib/supabase/config";
import { Stage } from "@/types/crm";
import { ColorInput } from "./ColorInput";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

interface StageConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  stage: Stage;
  onStageUpdate: (updatedStage: Stage) => void;
}

const formSchema = z.object({
  name: z.string().min(1, "El nombre de la etapa es obligatorio"),
  probability: z.number().min(0).max(100),
  color: z.string().regex(/^#([0-9A-F]{6})$/i, "Color inválido"),
  description: z.string().optional(),
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
      probability: stage.probability || 0,
      color: stage.color || "#3498db",
      description: stage.description || "",
    },
  });

  // Actualizar el formulario cuando cambia la etapa seleccionada
  useEffect(() => {
    if (isOpen) {
      form.reset({
        name: stage.name || "",
        probability: stage.probability || 0,
        color: stage.color || "#3498db",
        description: stage.description || "",
      });
    }
  }, [stage, isOpen, form]);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      // Actualizar la etapa en Supabase
      const { error } = await supabase
        .from("stages")
        .update({
          name: values.name,
          probability: values.probability,
          description: values.description,
          updated_at: new Date().toISOString(),
          // Nota: actualmente el campo color no existe en la tabla stages
          // Añadirlo requeriría una migración
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
                  <FormLabel>Probabilidad (%): {field.value}</FormLabel>
                  <FormControl>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      defaultValue={[field.value]}
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
