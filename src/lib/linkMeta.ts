import { invokeFunction } from './functions';
import type { LinkMeta } from './links';

/** Title + thumbnail for a link. Optional: falls back to {} if the service is slow or down. */
export async function fetchLinkMeta(url: string): Promise<LinkMeta> {
  try {
    return await Promise.race([
      invokeFunction<LinkMeta>('link-meta', { url }),
      new Promise<LinkMeta>((resolve) => setTimeout(() => resolve({}), 8000)),
    ]);
  } catch {
    return {};
  }
}
