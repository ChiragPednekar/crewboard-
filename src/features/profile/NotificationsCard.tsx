import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, Download, MessageCircle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { profileQueryKey, useProfile } from '@/features/auth/AuthProvider';
import { friendlyError } from '@/lib/errors';
import { currentPushSubscription, disablePush, enablePush, needsHomeScreenInstall, pushSupported } from '@/lib/push';
import { supabase } from '@/lib/supabase';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredInstall: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e as BeforeInstallPromptEvent;
  });
}

const PUSH_MESSAGES: Record<string, string> = {
  denied: 'Notifications are blocked for this site. Allow them in your browser settings, then try again.',
  unsupported: 'This browser doesn’t support push notifications.',
  unavailable: 'Push notifications aren’t switched on for CrewBoard yet. Ask your admin.',
  'needs-install': 'On iPhone, first add CrewBoard to your Home Screen (Share → Add to Home Screen), then turn this on from the app.',
};

/** Push on this device, WhatsApp alerts, and "install the app". */
export function NotificationsCard() {
  const profile = useProfile();
  const queryClient = useQueryClient();
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [waNumber, setWaNumber] = useState(profile.whatsapp_number ?? profile.phone ?? '');
  const [installable, setInstallable] = useState(Boolean(deferredInstall));
  const standalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;

  useEffect(() => {
    void currentPushSubscription().then((s) => setPushOn(Boolean(s)));
    const onPrompt = () => setInstallable(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const saveWhatsapp = useMutation({
    mutationFn: async (v: { opt_in: boolean; number: string }) => {
      const digits = v.number.replace(/[^\d+]/g, '');
      if (v.opt_in && !/^\+?\d{10,15}$/.test(digits)) throw new Error('Enter a WhatsApp number with 10–15 digits, e.g. +91 98200 11001');
      const { error } = await supabase
        .from('profiles')
        .update({ whatsapp_opt_in: v.opt_in, whatsapp_number: digits || null })
        .eq('id', profile.id);
      if (error) throw error;
    },
    onSuccess: async (_d, v) => {
      await queryClient.invalidateQueries({ queryKey: profileQueryKey(profile.id) });
      toast.success(v.opt_in ? 'WhatsApp alerts on' : 'WhatsApp alerts off');
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  async function togglePush(on: boolean) {
    setPushBusy(true);
    try {
      if (on) {
        const result = await enablePush();
        if (result === 'subscribed') {
          setPushOn(true);
          toast.success('Push notifications on for this device');
        } else {
          toast.error(PUSH_MESSAGES[result] ?? 'Couldn’t turn on notifications');
        }
      } else {
        await disablePush();
        setPushOn(false);
        toast.success('Push notifications off for this device');
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary-text" aria-hidden /> Notifications
        </CardTitle>
        <CardDescription>New tasks, revision requests, approvals and assessment results.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id="push-label" className="text-sm font-medium">
              Push notifications on this device
            </p>
            <p className="text-xs text-muted-foreground">
              {pushSupported() ? 'Pops up even when CrewBoard isn’t open.' : needsHomeScreenInstall() ? 'Add CrewBoard to your Home Screen first.' : 'Not supported in this browser.'}
            </p>
          </div>
          <Switch aria-labelledby="push-label" checked={pushOn} disabled={pushBusy} onCheckedChange={(v) => void togglePush(v)} />
        </div>

        <div className="space-y-3 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p id="wa-label" className="flex items-center gap-1.5 text-sm font-medium">
                <MessageCircle className="h-4 w-4 text-success-text" aria-hidden /> WhatsApp alerts
              </p>
              <p className="text-xs text-muted-foreground">Get the same alerts on WhatsApp.</p>
            </div>
            <Switch
              aria-labelledby="wa-label"
              checked={profile.whatsapp_opt_in}
              disabled={saveWhatsapp.isPending}
              onCheckedChange={(v) => saveWhatsapp.mutate({ opt_in: v, number: waNumber })}
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="wa-number" className="text-xs">
                WhatsApp number
              </Label>
              <Input id="wa-number" type="tel" inputMode="tel" value={waNumber} onChange={(e) => setWaNumber(e.target.value)} placeholder="+91 98xxx xxxxx" />
            </div>
            <Button
              variant="secondary"
              loading={saveWhatsapp.isPending}
              disabled={waNumber === (profile.whatsapp_number ?? profile.phone ?? '')}
              onClick={() => saveWhatsapp.mutate({ opt_in: profile.whatsapp_opt_in, number: waNumber })}
            >
              Save
            </Button>
          </div>
        </div>

        {!standalone && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2/60 p-3">
            <p className="flex items-center gap-2 text-sm">
              <Smartphone className="h-4 w-4 text-violet-text" aria-hidden />
              {needsHomeScreenInstall() ? 'Install: tap Share → Add to Home Screen.' : 'Install CrewBoard as an app for one-tap access.'}
            </p>
            {installable && (
              <Button
                size="sm"
                onClick={async () => {
                  await deferredInstall?.prompt();
                  deferredInstall = null;
                  setInstallable(false);
                }}
              >
                <Download /> Install
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
