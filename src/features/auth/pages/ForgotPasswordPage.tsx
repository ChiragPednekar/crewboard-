import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import { forgotPasswordSchema, type ForgotPasswordValues } from '../schemas';

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  async function onSubmit({ email }: ForgotPasswordValues) {
    setFormError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    // Same response whether or not the account exists (no account enumeration),
    // except for real failures like rate limits or network errors.
    if (error && !/not found|user/i.test(error.message)) {
      setFormError(friendlyError(error));
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-surface-2 text-success-text">
          <MailCheck className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-semibold">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If <span className="font-medium text-foreground">{sentTo}</span> has a CrewBoard account, we’ve sent a link to
          reset the password. The link expires in an hour.
        </p>
        <Button asChild variant="secondary" className="mt-8 w-full">
          <Link to="/login">
            <ArrowLeft /> Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to sign in
      </Link>
      <h1 className="font-display text-[28px] font-semibold leading-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Enter your work email and we’ll send you a reset link.</p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" inputMode="email" {...field} />
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
            Send reset link
          </Button>
        </form>
      </Form>
    </div>
  );
}
