'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, Save, Share2, Clock, ImageIcon, MessageSquare, HelpCircle, 
  Plus, Trash2, Upload, Star, Facebook, Instagram, Twitter, Linkedin, Youtube
} from 'lucide-react';
import { WebsiteSettings, GalleryImage, Testimonial, FAQItem, FooterLink, SocialLinks, BusinessHours } from '@/lib/services/websiteSettingsService';

interface BrandingContentTabProps {
  settings: WebsiteSettings;
  onSave: (data: Partial<WebsiteSettings>) => Promise<void>;
  onUploadImage: (file: File, type: 'gallery') => Promise<string>;
  isSaving: boolean;
}

const DAYS = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];

const SOCIAL_PLATFORMS = [
  { key: 'facebook', label: 'Facebook', icon: Facebook, placeholder: 'https://facebook.com/...' },
  { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: 'https://instagram.com/...' },
  { key: 'twitter', label: 'Twitter/X', icon: Twitter, placeholder: 'https://twitter.com/...' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, placeholder: 'https://linkedin.com/...' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, placeholder: 'https://youtube.com/...' },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, placeholder: '+57 300 123 4567' },
];

export default function BrandingContentTab({ settings, onSave, onUploadImage, isSaving }: BrandingContentTabProps) {
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(settings.social_links || {});
  const [businessHours, setBusinessHours] = useState<BusinessHours>(settings.business_hours || {});
  const [gallery, setGallery] = useState<GalleryImage[]>(settings.gallery_images || []);
  const [testimonials, setTestimonials] = useState<Testimonial[]>(settings.testimonials || []);
  const [faqItems, setFaqItems] = useState<FAQItem[]>(settings.faq_items || []);
  const [footerText, setFooterText] = useState(settings.footer_text || '');
  const [footerLinks, setFooterLinks] = useState<FooterLink[]>(settings.footer_links || []);
  const [isUploading, setIsUploading] = useState(false);

  const handleSave = async () => {
    await onSave({
      social_links: socialLinks,
      business_hours: businessHours,
      gallery_images: gallery,
      testimonials,
      faq_items: faqItems,
      footer_text: footerText,
      footer_links: footerLinks,
    });
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await onUploadImage(file, 'gallery');
      setGallery([...gallery, { id: crypto.randomUUID(), url, alt: file.name, caption: '' }]);
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const addTestimonial = () => {
    setTestimonials([
      ...testimonials,
      { id: crypto.randomUUID(), name: '', content: '', rating: 5 },
    ]);
  };

  const addFAQ = () => {
    setFaqItems([
      ...faqItems,
      { id: crypto.randomUUID(), question: '', answer: '', order: faqItems.length },
    ]);
  };

  const addFooterLink = () => {
    setFooterLinks([
      ...footerLinks,
      { id: crypto.randomUUID(), label: '', url: '', order: footerLinks.length },
    ]);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="social" className="w-full">
        <TabsList className="grid w-full grid-cols-5 dark:bg-gray-800">
          <TabsTrigger value="social">Redes</TabsTrigger>
          <TabsTrigger value="hours">Horarios</TabsTrigger>
          <TabsTrigger value="gallery">Galería</TabsTrigger>
          <TabsTrigger value="testimonials">Testimonios</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
        </TabsList>

        {/* Redes Sociales */}
        <TabsContent value="social" className="mt-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <Share2 className="h-5 w-5" />
                Redes Sociales
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                Enlaces a tus perfiles en redes sociales
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {SOCIAL_PLATFORMS.map((platform) => {
                const Icon = platform.icon;
                return (
                  <div key={platform.key} className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                      <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <Label className="text-sm dark:text-gray-300">{platform.label}</Label>
                      <Input
                        value={(socialLinks as any)[platform.key] || ''}
                        onChange={(e) => setSocialLinks({ ...socialLinks, [platform.key]: e.target.value })}
                        placeholder={platform.placeholder}
                        className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Horarios */}
        <TabsContent value="hours" className="mt-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <Clock className="h-5 w-5" />
                Horario de Atención
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                Configura los horarios de tu negocio
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {DAYS.map((day) => {
                  const hours = (businessHours as any)[day.key] || { open: '09:00', close: '18:00', closed: false };
                  return (
                    <div key={day.key} className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                      <div className="w-24">
                        <span className="font-medium dark:text-white">{day.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!hours.closed}
                          onCheckedChange={(checked) => 
                            setBusinessHours({ ...businessHours, [day.key]: { ...hours, closed: !checked } })
                          }
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {hours.closed ? 'Cerrado' : 'Abierto'}
                        </span>
                      </div>
                      {!hours.closed && (
                        <>
                          <Input
                            type="time"
                            value={hours.open}
                            onChange={(e) => 
                              setBusinessHours({ ...businessHours, [day.key]: { ...hours, open: e.target.value } })
                            }
                            className="w-32 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          />
                          <span className="dark:text-gray-400">a</span>
                          <Input
                            type="time"
                            value={hours.close}
                            onChange={(e) => 
                              setBusinessHours({ ...businessHours, [day.key]: { ...hours, close: e.target.value } })
                            }
                            className="w-32 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Galería */}
        <TabsContent value="gallery" className="mt-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <ImageIcon className="h-5 w-5" />
                Galería de Imágenes
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                Sube imágenes para mostrar en tu sitio ({gallery.length} imágenes)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {gallery.map((image) => (
                  <div key={image.id} className="relative group">
                    <img
                      src={image.url}
                      alt={image.alt}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => setGallery(gallery.filter((g) => g.id !== image.id))}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg h-32 flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleGalleryUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={isUploading}
                  />
                  {isUploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  ) : (
                    <div className="text-center">
                      <Upload className="h-8 w-8 mx-auto text-gray-400" />
                      <span className="text-sm text-gray-500 dark:text-gray-400">Subir imagen</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Testimonios */}
        <TabsContent value="testimonials" className="mt-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 dark:text-white">
                  <MessageSquare className="h-5 w-5" />
                  Testimonios
                </CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Opiniones de tus clientes ({testimonials.length})
                </CardDescription>
              </div>
              <Button onClick={addTestimonial} size="sm" className="dark:border-gray-600">
                <Plus className="h-4 w-4 mr-2" />
                Agregar
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {testimonials.map((testimonial, index) => (
                  <div key={testimonial.id} className="p-4 border dark:border-gray-700 rounded-lg space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="grid grid-cols-2 gap-3 flex-1">
                        <Input
                          value={testimonial.name}
                          onChange={(e) => {
                            const updated = [...testimonials];
                            updated[index].name = e.target.value;
                            setTestimonials(updated);
                          }}
                          placeholder="Nombre del cliente"
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                        <Input
                          value={testimonial.company || ''}
                          onChange={(e) => {
                            const updated = [...testimonials];
                            updated[index].company = e.target.value;
                            setTestimonials(updated);
                          }}
                          placeholder="Empresa (opcional)"
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTestimonials(testimonials.filter((t) => t.id !== testimonial.id))}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      value={testimonial.content}
                      onChange={(e) => {
                        const updated = [...testimonials];
                        updated[index].content = e.target.value;
                        setTestimonials(updated);
                      }}
                      placeholder="Contenido del testimonio..."
                      rows={2}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => {
                            const updated = [...testimonials];
                            updated[index].rating = star;
                            setTestimonials(updated);
                          }}
                        >
                          <Star
                            className={`h-5 w-5 ${
                              star <= (testimonial.rating || 0)
                                ? 'text-yellow-400 fill-yellow-400'
                                : 'text-gray-300 dark:text-gray-600'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {testimonials.length === 0 && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    No hay testimonios. Haz clic en &quot;Agregar&quot; para crear uno.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FAQ */}
        <TabsContent value="faq" className="mt-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 dark:text-white">
                  <HelpCircle className="h-5 w-5" />
                  Preguntas Frecuentes
                </CardTitle>
                <CardDescription className="dark:text-gray-400">
                  FAQ para tus visitantes ({faqItems.length})
                </CardDescription>
              </div>
              <Button onClick={addFAQ} size="sm" className="dark:border-gray-600">
                <Plus className="h-4 w-4 mr-2" />
                Agregar
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {faqItems.map((faq, index) => (
                  <div key={faq.id} className="p-4 border dark:border-gray-700 rounded-lg space-y-3">
                    <div className="flex justify-between items-start gap-3">
                      <Input
                        value={faq.question}
                        onChange={(e) => {
                          const updated = [...faqItems];
                          updated[index].question = e.target.value;
                          setFaqItems(updated);
                        }}
                        placeholder="Pregunta"
                        className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFaqItems(faqItems.filter((f) => f.id !== faq.id))}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      value={faq.answer}
                      onChange={(e) => {
                        const updated = [...faqItems];
                        updated[index].answer = e.target.value;
                        setFaqItems(updated);
                      }}
                      placeholder="Respuesta"
                      rows={2}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                ))}
                {faqItems.length === 0 && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    No hay preguntas frecuentes. Haz clic en &quot;Agregar&quot; para crear una.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">Contenido del Footer</CardTitle>
          <CardDescription className="dark:text-gray-400">
            Texto y enlaces para el pie de página
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Texto del Footer</Label>
            <Textarea
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="© 2024 Mi Empresa. Todos los derechos reservados."
              rows={2}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="dark:text-gray-300">Enlaces del Footer</Label>
              <Button variant="outline" size="sm" onClick={addFooterLink} className="dark:border-gray-600">
                <Plus className="h-4 w-4 mr-2" />
                Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {footerLinks.map((link, index) => (
                <div key={link.id} className="flex items-center gap-2">
                  <Input
                    value={link.label}
                    onChange={(e) => {
                      const updated = [...footerLinks];
                      updated[index].label = e.target.value;
                      setFooterLinks(updated);
                    }}
                    placeholder="Texto del enlace"
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <Input
                    value={link.url}
                    onChange={(e) => {
                      const updated = [...footerLinks];
                      updated[index].url = e.target.value;
                      setFooterLinks(updated);
                    }}
                    placeholder="URL"
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFooterLinks(footerLinks.filter((f) => f.id !== link.id))}
                    className="text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botón Guardar */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
