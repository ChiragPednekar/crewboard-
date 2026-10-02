/**
 * Recognise the links a video crew shares (YouTube, Vimeo, Drive, Instagram, …) so the
 * UI can show the right icon, a thumbnail without a network call, and an embeddable player.
 */

export type LinkProvider =
  | 'youtube'
  | 'vimeo'
  | 'drive'
  | 'dropbox'
  | 'instagram'
  | 'frameio'
  | 'wetransfer'
  | 'other';

export interface ParsedLink {
  url: string;
  hostname: string;
  provider: LinkProvider;
  providerLabel: string;
  /** Provider-specific id (video id, Drive file id). */
  id?: string;
}

export const PROVIDER_LABEL: Record<LinkProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  drive: 'Google Drive',
  dropbox: 'Dropbox',
  instagram: 'Instagram',
  frameio: 'Frame.io',
  wetransfer: 'WeTransfer',
  other: 'Link',
};

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function youtubeId(u: URL, host: string): string | undefined {
  if (host === 'youtu.be') {
    const id = u.pathname.split('/')[1];
    return id && YT_ID.test(id) ? id : undefined;
  }
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v && YT_ID.test(v)) return v;
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    return m?.[1];
  }
  return undefined;
}

function driveId(u: URL): string | undefined {
  const m = u.pathname.match(/\/(?:file\/d|document\/d|presentation\/d|spreadsheets\/d)\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  const id = u.searchParams.get('id');
  return id && /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : undefined;
}

export function parseLink(raw: string): ParsedLink | null {
  if (!isHttpUrl(raw)) return null;
  const u = new URL(raw.trim());
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  const base = { url: u.toString(), hostname: host };

  const yt = youtubeId(u, host);
  if (yt || host === 'youtube.com' || host === 'youtu.be') {
    return { ...base, provider: 'youtube', providerLabel: PROVIDER_LABEL.youtube, id: yt };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = u.pathname.match(/\/(?:video\/)?(\d{5,})/)?.[1];
    return { ...base, provider: 'vimeo', providerLabel: PROVIDER_LABEL.vimeo, id };
  }
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    return { ...base, provider: 'drive', providerLabel: PROVIDER_LABEL.drive, id: driveId(u) };
  }
  if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
    return { ...base, provider: 'dropbox', providerLabel: PROVIDER_LABEL.dropbox };
  }
  if (host === 'instagram.com' || host === 'instagr.am') {
    const id = u.pathname.match(/^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1];
    return { ...base, provider: 'instagram', providerLabel: PROVIDER_LABEL.instagram, id };
  }
  if (host === 'frame.io' || host.endsWith('.frame.io') || host === 'f.io') {
    return { ...base, provider: 'frameio', providerLabel: PROVIDER_LABEL.frameio };
  }
  if (host === 'wetransfer.com' || host === 'we.tl') {
    return { ...base, provider: 'wetransfer', providerLabel: PROVIDER_LABEL.wetransfer };
  }
  return { ...base, provider: 'other', providerLabel: host };
}

/** A thumbnail we can derive from the URL alone (may 404 for private files). */
export function derivedThumbnail(link: ParsedLink): string | undefined {
  if (link.provider === 'youtube' && link.id) return `https://i.ytimg.com/vi/${link.id}/hqdefault.jpg`;
  if (link.provider === 'drive' && link.id) return `https://drive.google.com/thumbnail?id=${link.id}&sz=w640`;
  return undefined;
}

/** Player URL for an <iframe>, when the provider allows embedding. */
export function embedUrl(link: ParsedLink): string | undefined {
  if (link.provider === 'youtube' && link.id) return `https://www.youtube-nocookie.com/embed/${link.id}?rel=0`;
  if (link.provider === 'vimeo' && link.id) return `https://player.vimeo.com/video/${link.id}`;
  if (link.provider === 'drive' && link.id) return `https://drive.google.com/file/d/${link.id}/preview`;
  if (link.provider === 'instagram' && link.id) return `https://www.instagram.com/p/${link.id}/embed`;
  return undefined;
}

/** Metadata stored with a reference (from the link-meta function). */
export interface LinkMeta {
  title?: string;
  description?: string;
  thumbnail?: string;
  site_name?: string;
  author?: string;
}

export function asLinkMeta(value: unknown): LinkMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  const s = (k: string) => (typeof v[k] === 'string' && v[k] ? (v[k] as string) : undefined);
  return { title: s('title'), description: s('description'), thumbnail: s('thumbnail'), site_name: s('site_name'), author: s('author') };
}
