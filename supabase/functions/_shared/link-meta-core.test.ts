import { describe, expect, it } from 'vitest';

import { fromOembed, isBlockedHostname, isPrivateAddress, oembedEndpoint, parseHtmlMeta, safeFetchUrl } from './link-meta-core';

describe('SSRF guards', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '999.1.1.1',
  ])('treats %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '142.250.183.14', '172.32.0.1', '2607:f8b0:4004:800::200e'])('treats %s as public', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it('blocks internal hostnames', () => {
    for (const h of ['localhost', 'api.localhost', 'printer.local', 'metadata.google.internal', 'kong', 'db', '[::1]']) {
      expect(isBlockedHostname(h)).toBe(true);
    }
    expect(isBlockedHostname('youtube.com')).toBe(false);
  });

  it('only accepts public http(s) URLs on standard ports', () => {
    expect(safeFetchUrl('https://vimeo.com/123')?.hostname).toBe('vimeo.com');
    expect(safeFetchUrl('ftp://example.com/x')).toBeNull();
    expect(safeFetchUrl('http://127.0.0.1/admin')).toBeNull();
    expect(safeFetchUrl('http://example.com:8080/')).toBeNull();
    expect(safeFetchUrl('https://user:pw@example.com/')).toBeNull();
    expect(safeFetchUrl('not a url')).toBeNull();
  });
});

describe('oembedEndpoint', () => {
  it('uses fixed provider hosts', () => {
    expect(oembedEndpoint(new URL('https://youtu.be/abc'))).toMatch(/^https:\/\/www\.youtube\.com\/oembed/);
    expect(oembedEndpoint(new URL('https://www.youtube.com/watch?v=abc'))).toMatch(/youtube\.com\/oembed/);
    expect(oembedEndpoint(new URL('https://vimeo.com/76979871'))).toMatch(/^https:\/\/vimeo\.com\/api\/oembed/);
    expect(oembedEndpoint(new URL('https://drive.google.com/file/d/x/view'))).toBeNull();
  });
});

describe('parseHtmlMeta', () => {
  const html = `<!doctype html><html><head>
    <title>Fallback &amp; title</title>
    <meta property="og:title" content="Kesar Diwali &#8211; Film">
    <meta content='Short description' name='description'>
    <meta property="og:image" content="/img/cover.jpg">
    <meta property="og:site_name" content="Kesar Foods">
  </head><body></body></html>`;

  it('prefers Open Graph tags and resolves relative images', () => {
    expect(parseHtmlMeta(html, 'https://kesar.example/films/diwali')).toEqual({
      title: 'Kesar Diwali – Film',
      description: 'Short description',
      thumbnail: 'https://kesar.example/img/cover.jpg',
      site_name: 'Kesar Foods',
    });
  });

  it('falls back to <title>', () => {
    expect(parseHtmlMeta('<title> Just a page </title>', 'https://x.example').title).toBe('Just a page');
  });

  it('drops non-http images', () => {
    expect(parseHtmlMeta('<meta property="og:image" content="javascript:alert(1)">', 'https://x.example').thumbnail).toBeUndefined();
  });
});

describe('fromOembed', () => {
  it('keeps https thumbnails only', () => {
    expect(fromOembed({ title: 'Clip', author_name: 'Studio', thumbnail_url: 'https://i.ytimg.com/vi/a/hq.jpg' })).toMatchObject({
      title: 'Clip',
      author: 'Studio',
      thumbnail: 'https://i.ytimg.com/vi/a/hq.jpg',
    });
    expect(fromOembed({ thumbnail_url: 'http://insecure.example/a.jpg' }).thumbnail).toBeUndefined();
  });
});
