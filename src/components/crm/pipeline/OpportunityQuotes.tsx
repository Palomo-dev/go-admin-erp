"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Upload, Download, Eye, Plus, Calendar } from "lucide-react";
import { toast } from "sonner";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface Quote {
  id: string;
  quote_number: string;
  title: string;
  description?: string;
  file_url?: string;
  file_name?: string;
  status: string;
  sent_at?: string;
  created_at: string;
  created_by?: string;
}

interface OpportunityQuotesProps {
  opportunityId: string;
}

export default function OpportunityQuotes({ opportunityId }: OpportunityQuotesProps) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newQuote, setNewQuote] = useState({
    title: '',
    description: '',
    file: null as File | null
  });

  useEffect(() => {
    loadQuotes();
  }, [opportunityId]);

  const loadQuotes = async () => {
    try {
      setLoading(true);
      
      // Por ahora simulamos datos ya que no existe la tabla quotes
      // En una implementación real, consultaríamos la tabla de cotizaciones
      const mockQuotes: Quote[] = [
        {
          id: '1',
          quote_number: 'COT-2025-001',
          title: 'Cotización Inicial - Servicios de Consultoría',
          description: 'Propuesta inicial para servicios de consultoría empresarial',
          file_url: '/quotes/cot-2025-001.pdf',
          file_name: 'cotizacion_inicial.pdf',
          status: 'sent',
          sent_at: '2025-01-15T10:30:00Z',
          created_at: '2025-01-15T09:15:00Z'
        },
        {
          id: '2',
          quote_number: 'COT-2025-002',
          title: 'Propuesta Revisada - Descuento Aplicado',
          description: 'Cotización revisada con descuento del 15% aplicado',
          file_url: '/quotes/cot-2025-002.pdf',
          file_name: 'propuesta_revisada.pdf',
          status: 'draft',
          created_at: '2025-01-20T14:20:00Z'
        }
      ];
      
      setQuotes(mockQuotes);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar las cotizaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error('Solo se permiten archivos PDF');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB
        toast.error('El archivo no puede ser mayor a 10MB');
        return;
      }
      setNewQuote(prev => ({ ...prev, file }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newQuote.title.trim()) {
      toast.error('El título es requerido');
      return;
    }

    try {
      // Aquí implementaríamos la subida del archivo y creación del registro
      // Por ahora simulamos el proceso
      
      const newQuoteData: Quote = {
        id: Date.now().toString(),
        quote_number: `COT-2025-${String(quotes.length + 1).padStart(3, '0')}`,
        title: newQuote.title,
        description: newQuote.description,
        file_name: newQuote.file?.name,
        status: 'draft',
        created_at: new Date().toISOString()
      };

      setQuotes(prev => [newQuoteData, ...prev]);
      setNewQuote({ title: '', description: '', file: null });
      setIsDialogOpen(false);
      toast.success('Cotización registrada exitosamente');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al registrar la cotización');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Enviada</Badge>;
      case 'viewed':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">Vista</Badge>;
      case 'accepted':
        return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">Aceptada</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">Rechazada</Badge>;
      default:
        return <Badge variant="outline">Borrador</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Cotizaciones Enviadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Cotizaciones Enviadas
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Cotización
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Registrar Nueva Cotización</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    value={newQuote.title}
                    onChange={(e) => setNewQuote(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Ej: Cotización Inicial - Servicios"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    value={newQuote.description}
                    onChange={(e) => setNewQuote(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Descripción opcional de la cotización"
                    rows={3}
                  />
                </div>
                
                <div>
                  <Label htmlFor="file">Archivo PDF</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Solo archivos PDF, máximo 10MB
                  </p>
                  {newQuote.file && (
                    <p className="text-sm text-green-600 mt-1">
                      ✓ {newQuote.file.name}
                    </p>
                  )}
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    Registrar Cotización
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {quotes.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No hay cotizaciones registradas</h3>
            <p className="text-muted-foreground mb-4">
              Registra las cotizaciones enviadas al cliente
            </p>
            <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Registrar Primera Cotización
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cotización</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha Envío</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{quote.title}</p>
                      <p className="text-sm text-muted-foreground">{quote.quote_number}</p>
                      {quote.description && (
                        <p className="text-sm text-muted-foreground">{quote.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(quote.status)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {quote.sent_at 
                          ? new Date(quote.sent_at).toLocaleDateString()
                          : 'No enviada'
                        }
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {quote.file_url && (
                        <>
                          <Button size="sm" variant="ghost" title="Ver PDF">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Descargar PDF">
                            <Download className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
