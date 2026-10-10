// link-meta: title + thumbnail for a reference or deliverable link.
//   POST { url } → { title?, description?, thumbnail?, site_name?, author? }
//
// Any signed-in user may call it (60 previews per 10 minutes). Because it fetches user-supplied URLs, every hop is
// checked: http(s) only, standard ports, no private/loopback/metadata addresses (also
// after DNS resolution), at most 3 redirects, 5 s timeout and 512 KB of body.

import { requireCaller } from '../_shared/auth.ts';
import { corsHeaders, enforceRateLimit, errorResponse, HttpError, json } from '../_shared/http.ts';
import {
  fromOembed,
  isPrivateAddress,
  type LinkMeta,
  oembedEndpoint,
  parseHtmlMeta,
  safeFetchUrl,
} from '../_shared/link-meta-core.ts';

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;
const UA = 'Mozilla/5.0 (compatible; CrewBoardLinkPreview/1.0)';

async function resolvesPublic(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return !isPrivateAddress(host);
  const addrs: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    try {
      addrs.push(...(await Deno.resolveDns(host, type)));
    } catch {
      /* no records of this type */
    }
  }
  return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a));
}

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(total, MAX_BYTES));
  let offset = 0;
  for (const c of chunks) {
    const slice = c.subarray(0, Math.min(c.byteLength, buf.byteLength - offset));
    buf.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= buf.byteLength) break;
  }
  return new TextDecoder().decode(buf);
}

async function safeFetch(start: URL, signal: AbortSignal): Promise<{ res: Response; url: URL }> {
  let url = start;
  for (let hop = 0; hop <= 3; hop++) {
    if (!(await resolvesPublic(url.hostname))) throw new HttpError(400, 'That address cannot be previewed.');
    const res = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      await res.body?.cancel();
      const nextUrl = next ? safeFetchUrl(new URL(next, url).toString()) : null;
      if (!nextUrl) throw new HttpError(400, 'That link redirects somewhere we cannot preview.');
      url = nextUrl;
      continue;
    }
    return { res, url };
  }
  throw new HttpError(400, 'Too many redirects.');
}

async function getMeta(url: URL): Promise<LinkMeta> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const oembed = oembedEndpoint(url);
    if (oembed) {
      const res = await fetch(oembed, { signal: controller.signal, headers: { 'User-Agent': UA } });
      if (res.ok) return fromOembed((await res.json()) as Record<string, unknown>);
      // private/unlisted videos fall through to the page itself
    }
    const { res, url: finalUrl } = await safeFetch(url, controller.signal);
    if (!res.ok) {
      await res.body?.cancel();
      return {};
    }
    const type = res.headers.get('content-type') ?? '';
    if (type.startsWith('image/')) {
      await res.body?.cancel();
      return { thumbnail: finalUrl.toString() };
    }
    if (!type.includes('html')) {
      await res.body?.cancel();
      return {};
    }
    return parseHtmlMeta(await readLimited(res), finalUrl.toString());
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return {}; // timeouts, TLS errors, etc. — a preview is optional
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const caller = await requireCaller(req);
    await enforceRateLimit(caller.db, 'link-meta', 60, 600);
    const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
    const url = typeof body?.url === 'string' && body.url.length <= 2048 ? safeFetchUrl(body.url) : null;
    if (!url) throw new HttpError(400, 'Enter a public http(s) link.');
    const meta = await getMeta(url);
    return json(meta, 200, { 'Cache-Control': 'private, max-age=3600' });
  } catch (err) {
    return errorResponse(err);
  }
});
