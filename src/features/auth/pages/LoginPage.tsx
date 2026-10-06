import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import { GoogleIcon, readOAuthError, useGoogleSignIn } from '../google';
import { loginSchema, type LoginValues } from '../schemas';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(readOAuthError);
  const google = useGoogleSignIn(setFormError);

  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    const { error } = await supabase.auth.signInWithPassword(values);
    // On success the auth listener updates state and RedirectIfSignedIn navigates.
    if (error) setFormError(friendlyError(error));
  }

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Sign in to see your plan, tasks and standings.</p>

      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="mt-8 w-full bg-background/40"
        onClick={() => void google.start()}
        loading={google.loading}
      >
        {!google.loading && <GoogleIcon />} Continue with Google
      </Button>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or sign in with email
        <span className="h-px flex-1 bg-border" />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" inputMode="email" placeholder="you@studio.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link to="/forgot-password" className="text-xs font-medium text-primary-text hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="pr-11"
                      {...field}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-0.5 top-0.5"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
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
            {!form.formState.isSubmitting && <LogIn />} Sign in
          </Button>
        </form>
      </Form>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <span className="block text-sm">
          New to CrewBoard?{' '}
          <Link to="/signup" className="font-medium text-primary-text hover:underline">
            Create an account
          </Link>
        </span>
        <span className="mt-3 block">
          <Link to="/privacy" className="hover:text-foreground hover:underline">
            Privacy
          </Link>
          {' · '}
          <Link to="/terms" className="hover:text-foreground hover:underline">
            Terms
          </Link>
        </span>
      </p>
    </div>
  );
}
