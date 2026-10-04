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

import { loginSchema, type LoginValues } from '../schemas';

/** OAuth failures come back to /login as ?error_description=… (or in the hash). */
function readOAuthError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const message = params.get('error_description') ?? hash.get('error_description');
  return message ? message.replace(/\+/g, ' ') : null;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="h-[18px] w-[18px]">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(readOAuthError);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function signInWithGoogle() {
    setFormError(null);
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // come back to /login: errors show here, a signed-in user is redirected onwards
      options: { redirectTo: `${window.location.origin}/login`, queryParams: { prompt: 'select_account' } },
    });
    if (error) {
      setFormError(friendlyError(error));
      setGoogleLoading(false);
    }
  }
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
        onClick={() => void signInWithGoogle()}
        loading={googleLoading}
      >
        {!googleLoading && <GoogleIcon />} Continue with Google
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
        New here? Continue with Google and you’ll join the crew automatically.
      </p>
    </div>
  );
}
