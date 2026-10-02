import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, LinkIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { FullPageLoader } from '@/components/FullPageLoader';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import { useAuth } from '../AuthProvider';
import { newPasswordSchema, type NewPasswordValues } from '../schemas';

/** Used for both password recovery and first-time invite acceptance (?mode=invite). */
export default function ResetPasswordPage() {
  const { status, session, profile } = useAuth();
  const [params] = useSearchParams();
  const isInvite = params.get('mode') === 'invite';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  if (status === 'loading') return <FullPageLoader label="Checking your link" />;

  if (!session) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-surface-2 text-warning-text">
          <LinkIcon className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-semibold">This link has expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reset and invite links work once and expire after a while. Request a fresh one below.
        </p>
        <Button asChild className="mt-8 w-full">
          <Link to="/forgot-password">Send a new link</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit({ password }: NewPasswordValues) {
    setFormError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setFormError(friendlyError(error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    toast.success(isInvite ? 'You’re all set — welcome to CrewBoard!' : 'Password updated');
    navigate('/', { replace: true });
  }

  return (
    <div>
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-border bg-surface-2 text-primary-text">
        <KeyRound className="h-5 w-5" aria-hidden />
      </div>
      <h1 className="font-display text-[28px] font-semibold leading-tight">
        {isInvite ? `Welcome${profile ? `, ${profile.full_name.split(' ')[0]}` : ''}` : 'Choose a new password'}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {isInvite
          ? 'Set a password to finish setting up your CrewBoard account.'
          : `Signed in as ${session.user.email}. Pick something you haven’t used before.`}
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
          <FormField
            control={form.control}
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
            control={form.control}
            name="confirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {formError && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger-text">
              {formError}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            {isInvite ? 'Set password & continue' : 'Update password'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
