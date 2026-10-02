// Minimal Google Sheets client for a service account: JWT → access token (WebCrypto,
// no googleapis package) and the handful of Sheets REST calls the sync needs.
// GOOGLE_SHEETS_API_BASE / the key's token_uri can point at a local mock for testing.

import type { CellWrite } from './sync-core.ts';
import type { SheetInfo, SheetsApi } from './sync-runner.ts';

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

export class SheetsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
  /** The sheet isn't shared with the service account, or doesn't exist. */
  get isPermission(): boolean {
    return this.status === 403 || this.status === 404;
  }
}

export function parseServiceAccount(json: string | undefined): ServiceAccount | null {
  if (!json) return null;
  try {
    const sa = JSON.parse(json) as Partial<ServiceAccount>;
    if (!sa.client_email || !sa.private_key) return null;
    return { client_email: sa.client_email, private_key: sa.private_key, token_uri: sa.token_uri || 'https://oauth2.googleapis.com/token' };
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

let cached: { token: string; exp: number; email: string } | null = null;

export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === sa.client_email && cached.exp - 60 > now) return cached.token;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64urlJson(header)}.${b64urlJson(claims)}`;
  const key = await importKey(sa.private_key);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new SheetsError(res.status, `Google sign-in failed (${res.status}). Check GOOGLE_SERVICE_ACCOUNT_JSON.`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { token: data.access_token, exp: now + (data.expires_in ?? 3600), email: sa.client_email };
  return data.access_token;
}

export class GoogleSheets implements SheetsApi {
  constructor(
    private token: string,
    private base = 'https://sheets.googleapis.com/v4',
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      const msg = body?.error?.message ?? res.statusText;
      throw new SheetsError(
        res.status,
        res.status === 403 || res.status === 404 ? `Can’t open the sheet (${res.status}): share it with the service account as Editor. ${msg}` : `Google Sheets error ${res.status}: ${msg}`,
      );
    }
    return (await res.json()) as T;
  }

  async getSheets(spreadsheetId: string): Promise<SheetInfo[]> {
    const data = await this.call<{ sheets?: { properties: { sheetId: number; title: string }; protectedRanges?: { protectedRangeId: number; description?: string }[] }[] }>(
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title),protectedRanges(protectedRangeId,description))`,
    );
    return (data.sheets ?? []).map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      protectedRanges: (s.protectedRanges ?? []).map((p) => ({ id: p.protectedRangeId, description: p.description ?? '' })),
    }));
  }

  async readTab(spreadsheetId: string, range: string): Promise<unknown[][]> {
    const data = await this.call<{ valueRanges?: { values?: unknown[][] }[] }>(
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?ranges=${encodeURIComponent(range)}&valueRenderOption=FORMATTED_VALUE`,
    );
    return data.valueRanges?.[0]?.values ?? [];
  }

  async writeValues(spreadsheetId: string, writes: CellWrite[]): Promise<void> {
    if (writes.length === 0) return;
    // RAW: titles or notes starting with "=" stay text, never formulas
    await this.call(`/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: writes }),
    });
  }

  async batchUpdate(spreadsheetId: string, requests: unknown[]): Promise<{ replies?: unknown[] }> {
    return this.call(`/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });
  }
}
