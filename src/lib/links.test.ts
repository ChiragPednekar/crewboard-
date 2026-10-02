import { describe, expect, it } from 'vitest';

import { asLinkMeta, derivedThumbnail, embedUrl, isHttpUrl, parseLink } from './links';

describe('isHttpUrl', () => {
  it('accepts http(s) with a real host', () => {
    expect(isHttpUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(isHttpUrl('  http://example.com/a ')).toBe(true);
  });
  it('rejects other schemes and junk', () => {
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('example.com')).toBe(false);
    expect(isHttpUrl('https://localhost')).toBe(false);
  });
});

describe('parseLink', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('YouTube %s', (url, id) => {
    expect(parseLink(url)).toMatchObject({ provider: 'youtube', id });
  });

  it('Vimeo', () => {
    expect(parseLink('https://vimeo.com/76979871')).toMatchObject({ provider: 'vimeo', id: '76979871' });
    expect(parseLink('https://player.vimeo.com/video/76979871')).toMatchObject({ id: '76979871' });
  });

  it('Google Drive file and open?id= links', () => {
    expect(parseLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing')).toMatchObject({
      provider: 'drive',
      id: '1AbCdEfGhIjKlMnOp',
    });
    expect(parseLink('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')?.id).toBe('1AbCdEfGhIjKlMnOp');
    expect(parseLink('https://drive.google.com/drive/folders/1Zz')?.id).toBeUndefined();
  });

  it('Instagram, Dropbox, Frame.io, WeTransfer and others', () => {
    expect(parseLink('https://www.instagram.com/reel/C1a2b3c4/')).toMatchObject({ provider: 'instagram', id: 'C1a2b3c4' });
    expect(parseLink('https://www.dropbox.com/s/abc/file.mp4')?.provider).toBe('dropbox');
    expect(parseLink('https://app.frame.io/reviews/xyz')?.provider).toBe('frameio');
    expect(parseLink('https://we.tl/t-abc')?.provider).toBe('wetransfer');
    expect(parseLink('https://www.kesar.example/film')).toMatchObject({ provider: 'other', providerLabel: 'kesar.example' });
  });

  it('returns null for non-links', () => {
    expect(parseLink('not a link')).toBeNull();
  });
});

describe('thumbnails and embeds', () => {
  it('derives YouTube and Drive thumbnails', () => {
    expect(derivedThumbnail(parseLink('https://youtu.be/dQw4w9WgXcQ')!)).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(derivedThumbnail(parseLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view')!)).toContain('thumbnail?id=1AbCdEfGhIjKlMnOp');
    expect(derivedThumbnail(parseLink('https://vimeo.com/76979871')!)).toBeUndefined();
  });
  it('builds privacy-friendly embed URLs', () => {
    expect(embedUrl(parseLink('https://youtu.be/dQw4w9WgXcQ')!)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
    expect(embedUrl(parseLink('https://vimeo.com/76979871')!)).toBe('https://player.vimeo.com/video/76979871');
    expect(embedUrl(parseLink('https://example.com/x')!)).toBeUndefined();
  });
});

describe('asLinkMeta', () => {
  it('keeps only non-empty strings', () => {
    expect(asLinkMeta({ title: 'A', thumbnail: '', author: 3 })).toEqual({ title: 'A' });
    expect(asLinkMeta(null)).toEqual({});
    expect(asLinkMeta(['x'])).toEqual({});
  });
});
