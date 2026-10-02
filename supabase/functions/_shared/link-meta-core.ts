// Pure helpers for link previews (no I/O, unit-tested with Vitest).

export interface LinkMeta {
  title?: string;
  description?: string;
  thumbnail?: string;
  site_name?: string;
  author?: string;
}

/** Hosts we never fetch from: loopback, link-local, private ranges, metadata endpoints. */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal' || h === 'metadata') return true;
  if (isIpLiteral(h)) return isPrivateAddress(h);
  // single-label names resolve inside the network (e.g. "kong", "db")
  return !h.includes('.');
}

export function isIpLiteral(h: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');
}

export function isPrivateAddress(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (addr.includes(':')) {
    if (addr === '::' || addr === '::1') return true;
    const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(addr);
  }
  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Validate a user-supplied URL for fetching. Returns the parsed URL or null. */
export function safeFetchUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  if (isBlockedHostname(url.hostname)) return null;
  return url;
}

/** oEmbed endpoint for providers that publish one (fixed hosts, so no SSRF surface). */
export function oembedEndpoint(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const target = encodeURIComponent(url.toString());
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
    return `https://www.youtube.com/oembed?format=json&url=${target}`;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    return `https://vimeo.com/api/oembed.json?url=${target}`;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

function clean(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const v = decodeEntities(s).replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, max) : undefined;
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(decodeEntities(href.trim()), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Pull Open Graph / Twitter / <title> metadata out of an HTML document head. */
export function parseHtmlMeta(html: string, baseUrl: string): LinkMeta {
  const head = html.slice(0, 200_000);
  const metas = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    const key = attr('property') ?? attr('name') ?? attr('itemprop');
    const content = attr('content');
    const k = key ? (key[2] ?? key[3] ?? key[4] ?? '').toLowerCase() : '';
    const v = content ? (content[2] ?? content[3] ?? content[4] ?? '') : '';
    if (k && v && !metas.has(k)) metas.set(k, v);
  }
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  return {
    title: clean(metas.get('og:title') ?? metas.get('twitter:title') ?? titleTag, 200),
    description: clean(metas.get('og:description') ?? metas.get('twitter:description') ?? metas.get('description'), 300),
    thumbnail: absolute(
      metas.get('og:image:secure_url') ?? metas.get('og:image') ?? metas.get('twitter:image') ?? metas.get('twitter:image:src'),
      baseUrl,
    ),
    site_name: clean(metas.get('og:site_name'), 80),
  };
}

/** Normalise an oEmbed JSON response. */
export function fromOembed(data: Record<string, unknown>): LinkMeta {
  const s = (v: unknown, max: number) => (typeof v === 'string' ? clean(v, max) : undefined);
  const thumb = typeof data.thumbnail_url === 'string' && /^https:\/\//.test(data.thumbnail_url) ? data.thumbnail_url : undefined;
  return {
    title: s(data.title, 200),
    author: s(data.author_name, 120),
    site_name: s(data.provider_name, 80),
    thumbnail: thumb,
  };
}
