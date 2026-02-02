'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  Download,
  Loader2,
  X
} from 'lucide-react';
import { GymClass, Instructor, createClass } from '@/lib/services/gymService';
import { Branch } from '@/types/branch';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { toast } from 'sonner';

interface ClassImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
  branches: Branch[];
  instructors: Instructor[];
}

interface ParsedClass {
  title: string;
  class_type: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  room?: string;
  instructor_name?: string;
  branch_name?: string;
  description?: string;
  difficulty_level?: string;
  isValid: boolean;
  errors: string[];
}

const CLASS_TYPES_MAP: Record<string, string> = {
  'spinning': 'spinning',
  'yoga': 'yoga',
  'pilates': 'pilates',
  'crossfit': 'crossfit',
  'zumba': 'zumba',
  'boxeo': 'boxing',
  'boxing': 'boxing',
  'funcional': 'functional',
  'functional': 'functional',
  'estiramiento': 'stretching',
  'stretching': 'stretching',
  'aerobicos': 'aerobics',
  'aerobics': 'aerobics',
  'natacion': 'swimming',
  'swimming': 'swimming',
  'otro': 'other',
  'other': 'other',
};

export function ClassImportDialog({ 
  open, 
  onOpenChange, 
  onImportComplete,
  branches,
  instructors 
}: ClassImportDialogProps) {
  const { organization } = useOrganization();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedClasses, setParsedClasses] = useState<ParsedClass[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [defaultBranchId, setDefaultBranchId] = useState<string>('');
  const [importedCount, setImportedCount] = useState(0);
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Por favor selecciona un archivo CSV');
      return;
    }

    setFile(selectedFile);
    setIsParsing(true);

    try {
      const text = await selectedFile.text();
      const parsed = parseCSV(text);
      setParsedClasses(parsed);
      setStep('preview');
    } catch (error) {
      console.error('Error parsing CSV:', error);
      toast.error('Error al leer el archivo CSV');
    } finally {
      setIsParsing(false);
    }
  };

  const parseCSV = (text: string): ParsedClass[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const classes: ParsedClass[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const errors: string[] = [];

      const getValue = (keys: string[]): string => {
        for (const key of keys) {
          const index = headers.indexOf(key);
          if (index !== -1 && values[index]) {
            return values[index].trim();
          }
        }
        return '';
      };

      const title = getValue(['titulo', 'title', 'nombre', 'name', 'clase']);
      const classType = getValue(['tipo', 'type', 'class_type', 'tipo_clase']);
      const date = getValue(['fecha', 'date']);
      const startTime = getValue(['hora_inicio', 'start_time', 'hora', 'inicio']);
      const endTime = getValue(['hora_fin', 'end_time', 'fin']);
      const capacityStr = getValue(['capacidad', 'capacity', 'cupos']);
      const room = getValue(['sala', 'room', 'ubicacion', 'location']);
      const instructorName = getValue(['instructor', 'instructor_name', 'profesor']);
      const branchName = getValue(['sede', 'branch', 'sucursal']);
      const description = getValue(['descripcion', 'description']);
      const difficultyLevel = getValue(['dificultad', 'difficulty', 'nivel']);

      if (!title) errors.push('Título requerido');
      if (!date) errors.push('Fecha requerida');
      if (!startTime) errors.push('Hora de inicio requerida');

      const capacity = parseInt(capacityStr) || 20;

      classes.push({
        title,
        class_type: CLASS_TYPES_MAP[classType.toLowerCase()] || 'other',
        date,
        start_time: startTime,
        end_time: endTime || calculateEndTime(startTime, 60),
        capacity,
        room,
        instructor_name: instructorName,
        branch_name: branchName,
        description,
        difficulty_level: difficultyLevel || 'all_levels',
        isValid: errors.length === 0,
        errors,
      });
    }

    return classes;
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    if (!startTime) return '';
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  };

  const findInstructorId = (name: string): string | undefined => {
    if (!name) return undefined;
    const nameLower = name.toLowerCase();
    const instructor = instructors.find(i => {
      const fullName = `${i.profiles?.first_name || ''} ${i.profiles?.last_name || ''}`.toLowerCase();
      return fullName.includes(nameLower) || nameLower.includes(fullName);
    });
    return instructor?.user_id;
  };

  const findBranchId = (name: string): number | undefined => {
    if (!name) return defaultBranchId ? parseInt(defaultBranchId) : undefined;
    const nameLower = name.toLowerCase();
    const branch = branches.find(b => b.name.toLowerCase().includes(nameLower));
    return branch?.id || (defaultBranchId ? parseInt(defaultBranchId) : undefined);
  };

  const handleImport = async () => {
    const validClasses = parsedClasses.filter(c => c.isValid);
    if (validClasses.length === 0) {
      toast.error('No hay clases válidas para importar');
      return;
    }

    setIsLoading(true);
    let imported = 0;

    try {
      for (const classData of validClasses) {
        const startAt = new Date(`${classData.date}T${classData.start_time}`);
        const endAt = new Date(`${classData.date}T${classData.end_time}`);

        await createClass({
          title: classData.title,
          class_type: classData.class_type as GymClass['class_type'],
          capacity: classData.capacity,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          room: classData.room,
          description: classData.description,
          difficulty_level: classData.difficulty_level as GymClass['difficulty_level'],
          instructor_id: findInstructorId(classData.instructor_name || ''),
          branch_id: findBranchId(classData.branch_name || ''),
        });
        imported++;
      }

      setImportedCount(imported);
      setStep('complete');
      toast.success(`${imported} clases importadas correctamente`);
    } catch (error) {
      console.error('Error importing classes:', error);
      toast.error('Error al importar las clases');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedClasses([]);
    setStep('upload');
    setImportedCount(0);
    setDefaultBranchId('');
    onOpenChange(false);
    if (step === 'complete') {
      onImportComplete();
    }
  };

  const downloadTemplate = () => {
    const template = `titulo,tipo,fecha,hora_inicio,hora_fin,capacidad,sala,instructor,sede,descripcion,dificultad
Spinning Matutino,spinning,2025-02-01,07:00,08:00,20,Sala A,Juan Pérez,Principal,Clase de spinning para todos los niveles,all_levels
Yoga Relajante,yoga,2025-02-01,09:00,10:00,15,Sala B,María García,Principal,Yoga para principiantes,beginner
CrossFit Intenso,crossfit,2025-02-01,18:00,19:00,12,Box CrossFit,Carlos López,Principal,Entrenamiento de alta intensidad,advanced`;

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_clases.csv';
    link.click();
  };

  const validCount = parsedClasses.filter(c => c.isValid).length;
  const invalidCount = parsedClasses.filter(c => !c.isValid).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Importar Clases desde CSV
          </DialogTitle>
          <DialogDescription>
            Importa múltiples clases desde un archivo CSV
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div 
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                {isParsing ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Procesando archivo...
                  </span>
                ) : (
                  <>
                    Arrastra un archivo CSV aquí o <span className="text-blue-600">haz clic para seleccionar</span>
                  </>
                )}
              </p>
            </div>

            <div className="flex justify-between items-center">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Descargar Plantilla
              </Button>
              
              <p className="text-xs text-gray-500">
                Columnas: titulo, tipo, fecha, hora_inicio, hora_fin, capacidad, sala, instructor, sede
              </p>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {validCount} válidas
                </Badge>
                {invalidCount > 0 && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {invalidCount} con errores
                  </Badge>
                )}
              </div>

              <Button variant="ghost" size="sm" onClick={() => { setStep('upload'); setFile(null); setParsedClasses([]); }}>
                <X className="h-4 w-4 mr-1" />
                Cambiar archivo
              </Button>
            </div>

            {branches.length > 0 && (
              <div className="flex items-center gap-4">
                <Label className="text-sm">Sede por defecto:</Label>
                <Select value={defaultBranchId} onValueChange={setDefaultBranchId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Seleccionar sede" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.filter(b => b.id).map(branch => (
                      <SelectItem key={branch.id} value={branch.id!.toString()}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="max-h-[300px] overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">Estado</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Horario</TableHead>
                    <TableHead>Capacidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedClasses.map((classData, index) => (
                    <TableRow key={index} className={!classData.isValid ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                      <TableCell>
                        {classData.isValid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <span title={classData.errors.join(', ')}>
                            <AlertCircle className="h-4 w-4 text-red-500" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{classData.title || '-'}</TableCell>
                      <TableCell>{classData.class_type}</TableCell>
                      <TableCell>{classData.date || '-'}</TableCell>
                      <TableCell>{classData.start_time} - {classData.end_time}</TableCell>
                      <TableCell>{classData.capacity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Importación Completada
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Se importaron <strong>{importedCount}</strong> clases correctamente.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}
          
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={isLoading || validCount === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Importar {validCount} Clases
              </Button>
            </>
          )}
          
          {step === 'complete' && (
            <Button onClick={handleClose} className="bg-blue-600 hover:bg-blue-700">
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
