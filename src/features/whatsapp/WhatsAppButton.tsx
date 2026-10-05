import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

import { whatsappNumber } from '../../../supabase/functions/_shared/notify-core';

/** wa.me click-to-chat link (no API needed). */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const to = whatsappNumber(phone);
  return to ? `https://wa.me/${to}?text=${encodeURIComponent(text)}` : null;
}

/**
 * Opens WhatsApp (app or web) with a pre-filled message to a crew member.
 * Works without the WhatsApp Business API; hidden when there's no usable number.
 */
export function WhatsAppButton({ profileId, text, compact = false, className }: { profileId: string; text: string; compact?: boolean; className?: string }) {
  const contact = useQuery({
    queryKey: ['profiles', 'whatsapp', profileId],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('phone, whatsapp_number').eq('id', profileId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const href = whatsappLink(contact.data?.whatsapp_number || contact.data?.phone, text);
  if (!href) return null;
  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('inline-flex items-center gap-1 text-success-text underline-offset-2 hover:underline', className)}
      >
        · <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
        <span className="sr-only">(opens WhatsApp)</span>
      </a>
    );
  }
  return (
    <Button asChild variant="secondary" size="sm" className={className}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="text-success-text" /> WhatsApp
        <span className="sr-only">(opens WhatsApp)</span>
      </a>
    </Button>
  );
}
