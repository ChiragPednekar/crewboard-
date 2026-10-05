import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

const UPDATED = '5 October 2026';
const CONTACT = 'chiragpednekar7@gmail.com';

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Link to="/" aria-label="CrewBoard home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20">
        <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to CrewBoard
        </Link>
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}</p>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
    </div>
  );
}

/** /privacy — required by Google before "Sign in with Google" can be published. */
export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy">
      <p>
        CrewBoard is an internal work portal for a video production studio and its crew. This policy explains what we collect, why, and the
        choices you have. It applies to everyone who signs in: studio admins, reviewers and videographers.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details</strong>: your name, email address and profile photo. If you sign in with Google, we receive only these
          basic profile details from Google, never your Google password or other Google data.
        </li>
        <li>
          <strong>Work details</strong>: the plans and tasks assigned to you, links to the videos you deliver, review notes, points and monthly
          assessments, and when you submitted work.
        </li>
        <li>
          <strong>Contact details you add</strong>: phone number, base location and, if you opt in, a WhatsApp number for alerts.
        </li>
        <li>
          <strong>Studio operations</strong>: leave requests and equipment you have checked out.
        </li>
        <li>
          <strong>Device data for notifications</strong>: if you turn on push notifications, a browser push subscription for that device.
        </li>
        <li>
          <strong>Client feedback</strong>: when a studio client reviews a video through an approval link, their decision, rating, comment and
          the name they choose to give.
        </li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To plan, track and review the studio’s work, and to calculate monthly points and assessments.</li>
        <li>To show the crew leaderboard and best work of the month to signed-in team members.</li>
        <li>To send you notifications in the app and, if you choose, by push notification, WhatsApp and email.</li>
        <li>To keep an activity log so the studio can see who changed what.</li>
      </ul>
      <p>We don’t sell your data, show ads, or use it for anything unrelated to running the studio.</p>
      <h2>Who can see it</h2>
      <ul>
        <li>Studio admins can see all work data. Reviewers can see work they review.</li>
        <li>Videographers see their own tasks, feedback and assessments, plus everyone’s leaderboard rank and score. Private remarks stay private.</li>
        <li>
          We use trusted service providers to run CrewBoard: Supabase (database, sign-in and storage), Vercel (hosting), Google (sign-in and the
          optional Sheets sync) and, if enabled, Meta’s WhatsApp Business service. They process data only to provide their service.
        </li>
      </ul>
      <h2>How long we keep it</h2>
      <p>
        Work history and assessments are kept for as long as the studio needs them for its records. If your account is deactivated, your history
        stays for the studio’s records but you can no longer sign in. Push subscriptions are removed when you turn notifications off.
      </p>
      <h2>Your choices</h2>
      <ul>
        <li>Update your phone, photo and notification preferences from your Profile.</li>
        <li>Turn push or WhatsApp alerts off at any time.</li>
        <li>Ask the studio admin to correct or delete your personal data, subject to the studio’s record-keeping needs.</li>
      </ul>
      <h2>Security</h2>
      <p>
        Data is encrypted in transit, access is controlled per role at the database level, and sign-in is handled by Supabase Auth or Google.
      </p>
      <h2>Contact</h2>
      <p>
        Questions or requests: <a className="text-primary-text underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalLayout>
  );
}

/** /terms */
export function TermsPage() {
  return (
    <LegalLayout title="Terms of use">
      <p>
        CrewBoard is provided by the studio to its team for planning, delivering and reviewing video work. By signing in you agree to these
        terms.
      </p>
      <h2>Accounts</h2>
      <ul>
        <li>Accounts are for studio team members added by an admin. Keep your sign-in secure and don’t share it.</li>
        <li>The studio may deactivate accounts, for example when someone leaves the team.</li>
      </ul>
      <h2>Acceptable use</h2>
      <ul>
        <li>Use CrewBoard only for studio work. Don’t upload unlawful content or content you don’t have the right to share.</li>
        <li>Respect client confidentiality: patient, brand and client material stays within the studio and the client.</li>
        <li>Client approval links are private to the client they were sent to; don’t forward them publicly.</li>
      </ul>
      <h2>Content</h2>
      <p>Work delivered through CrewBoard belongs to the studio and its clients as agreed in their contracts.</p>
      <h2>Availability</h2>
      <p>We aim to keep CrewBoard available but can’t guarantee it will always be uninterrupted or error-free.</p>
      <h2>Changes</h2>
      <p>We may update these terms; the date above shows the latest version.</p>
      <h2>Contact</h2>
      <p>
        <a className="text-primary-text underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </LegalLayout>
  );
}
