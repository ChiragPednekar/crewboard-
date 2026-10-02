import { z } from 'zod';

export const CLIENT_TYPES = ['hospital', 'clinic', 'brand', 'corporate', 'education', 'event', 'other'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  hospital: 'Hospital',
  clinic: 'Clinic',
  brand: 'Brand',
  corporate: 'Corporate',
  education: 'Education',
  event: 'Event',
  other: 'Other',
};

export function clientTypeLabel(type: string): string {
  return CLIENT_TYPE_LABEL[type as ClientType] ?? type;
}

const optional = (max: number, message = 'Too long') => z.string().trim().max(max, message);

export const clientSchema = z.object({
  name: z.string().trim().min(2, 'Enter the client’s name').max(160, 'Keep it under 160 characters'),
  type: z.enum(CLIENT_TYPES),
  city: optional(80),
  address: optional(300),
  contact_name: optional(120),
  contact_phone: optional(20).refine((v) => v === '' || /^[0-9+() -]{6,20}$/.test(v), 'Use digits, spaces, + ( ) or -'),
  contact_email: optional(254).refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email'),
  notes: optional(2000, 'Keep notes under 2000 characters'),
});

export type ClientFormValues = z.infer<typeof clientSchema>;

export const emptyClient: ClientFormValues = {
  name: '',
  type: 'hospital',
  city: '',
  address: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  notes: '',
};
