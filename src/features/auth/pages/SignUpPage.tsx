import { useState } from 'react';
import { CheckCircle2, Clock, MailPlus } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

import { GoogleIcon, readOAuthError, useGoogleSignIn } from '../google';

const STEPS = [
  {
    icon: GoogleIcon,
    text: 'Sign up with the Google account you use for work.',
  },
  {
    icon: () => <Clock className="h-[18px] w-[18px] text-warning-text" aria-hidden />,
    text: 'Your studio admin gets a request and approves you as crew.',
  },
  {
    icon: () => <CheckCircle2 className="h-[18px] w-[18px] text-success-text" aria-hidden />,
    text: 'You’re let in automatically and see your tasks once your plan is published.',
  },
];

export default function SignUpPage() {
  const [formError, setFormError] = useState<string | null>(readOAuthError);
  const google = useGoogleSignIn(setFormError, '/signup');

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Join your studio’s CrewBoard. An admin approves every new account before it can see the team’s work.
      </p>

      <ol className="mt-7 space-y-3.5">
        {STEPS.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-background/40">
              <s.icon />
            </span>
            <span className="pt-1.5">{s.text}</span>
          </li>
        ))}
      </ol>

      <Button type="button" size="lg" className="mt-8 w-full" onClick={() => void google.start()} loading={google.loading}>
        {!google.loading && <GoogleIcon />} Sign up with Google
      </Button>

      {formError && (
        <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger-text">
          {formError}
        </p>
      )}

      <p className="mt-6 flex gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-xs text-muted-foreground">
        <MailPlus className="mt-px h-4 w-4 shrink-0" aria-hidden />
        No Google account? Ask your studio admin to invite you by email instead.
      </p>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary-text hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
