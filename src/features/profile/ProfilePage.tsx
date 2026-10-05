import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Moon, Phone, ShieldCheck, Sun } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { useTheme } from '@/app/theme';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { UserAvatar } from '@/components/UserAvatar';
import { profileQueryKey, useProfile } from '@/features/auth/AuthProvider';
import { NotificationsCard } from './NotificationsCard';
import { newPasswordSchema, type NewPasswordValues } from '@/features/auth/schemas';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .max(20, 'Too long')
    .refine((v) => v === '' || /^[0-9+() -]{6,20}$/.test(v), 'Use digits, spaces, + ( ) or -'),
});
type PhoneValues = z.infer<typeof phoneSchema>;

export default function ProfilePage() {
  const profile = useProfile();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  const phoneForm = useForm<PhoneValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: profile.phone ?? '' },
  });
  const passwordForm = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const savePhone = useMutation({
    mutationFn: async ({ phone }: PhoneValues) => {
      const { error } = await supabase.from('profiles').update({ phone: phone || null }).eq('id', profile.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileQueryKey(profile.id) });
      toast.success('Phone number saved');
      phoneForm.reset(phoneForm.getValues());
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const changePassword = useMutation({
    mutationFn: async ({ password }: NewPasswordValues) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Password updated');
      passwordForm.reset();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <>
      <PageHeader title="Profile" description="Your account details. Name, email and role are managed by your admin." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardContent className="flex flex-col items-center p-6 text-center sm:p-8">
            <UserAvatar name={profile.full_name} src={profile.avatar_url} className="h-20 w-20 text-2xl" />
            <h2 className="mt-4 font-display text-xl font-semibold">{profile.full_name}</h2>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <span className="mt-3 rounded-full bg-primary/12 px-3 py-1 text-xs font-medium capitalize text-primary-text">
              {profile.role}
            </span>
            <dl className="mt-6 w-full space-y-3 text-left text-sm">
              <div className="flex items-center gap-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
                <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                <dt className="sr-only">Base location</dt>
                <dd>{profile.base_location ?? 'No base location set'}</dd>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
                <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                <dt className="sr-only">Phone</dt>
                <dd className="tabular">{profile.phone ?? 'No phone number'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact number</CardTitle>
              <CardDescription>Used by the studio to reach you on shoot days.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...phoneForm}>
                <form
                  onSubmit={phoneForm.handleSubmit((v) => savePhone.mutate(v))}
                  className="flex flex-col gap-3 sm:flex-row sm:items-start"
                  noValidate
                >
                  <FormField
                    control={phoneForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel className="sr-only">Phone</FormLabel>
                        <FormControl>
                          <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98xxx xxxxx" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" variant="secondary" loading={savePhone.isPending} disabled={!phoneForm.formState.isDirty}>
                    Save
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <NotificationsCard />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary-text" aria-hidden /> Change password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form
                  onSubmit={passwordForm.handleSubmit((v) => changePassword.mutate(v))}
                  className="space-y-4"
                  noValidate
                >
                  <FormField
                    control={passwordForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New password</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormDescription>At least 8 characters, with a letter and a number.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="confirm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm new password</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" loading={changePassword.isPending}>
                    Update password
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon className="h-5 w-5 text-violet-text" aria-hidden /> : <Sun className="h-5 w-5 text-primary-text" aria-hidden />}
                <div>
                  <p id="theme-label" className="text-sm font-medium">Dark mode</p>
                  <p className="text-xs text-muted-foreground">Saved on this device.</p>
                </div>
              </div>
              <Switch
                aria-labelledby="theme-label"
                checked={theme === 'dark'}
                onCheckedChange={(on) => setTheme(on ? 'dark' : 'light')}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
