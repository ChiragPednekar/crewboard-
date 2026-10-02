import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .max(20, 'Too long')
  .refine((v) => v === '' || /^[0-9+() -]{6,20}$/.test(v), 'Use digits, spaces, + ( ) or -');

export const videographerDetailsSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter their full name').max(120, 'Keep it under 120 characters'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  phone,
  base_location: z.string().trim().max(120, 'Too long'),
});
export type VideographerDetailsValues = z.infer<typeof videographerDetailsSchema>;

export const inviteSchema = videographerDetailsSchema.extend({
  client_ids: z.array(z.string().uuid()),
});
export type InviteValues = z.infer<typeof inviteSchema>;

export const emptyInvite: InviteValues = { full_name: '', email: '', phone: '', base_location: '', client_ids: [] };
