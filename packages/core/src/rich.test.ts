// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { applyInlineImageUrls, inlineImagePaths, serializeSelection } from './rich.js';

/** Build a fragment the way `Range.cloneContents()` would, then serialize it. */
function serialize(html: string): { html: string; text: string } {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return serializeSelection(tpl.content);
}

/** Same, but opt into inline-image tokens (IMG-*). */
function serializeImg(html: string): { html: string; text: string } {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return serializeSelection(tpl.content, { images: true });
}

describe('serializeSelection', () => {
  it('preserves headings and paragraphs with inline emphasis', () => {
    const { html, text } = serialize('<h2>Title</h2><p>Body <strong>bold</strong>.</p>');
    expect(html).toBe('<h2>Title</h2><p>Body <strong>bold</strong>.</p>');
    expect(text).toBe('Title\nBody bold.');
  });

  it('preserves lists with a bullet in the plain-text rendering', () => {
    const { html, text } = serialize('<ul><li>One</li><li>Two</li></ul>');
    expect(html).toBe('<ul><li>One</li><li>Two</li></ul>');
    expect(text).toBe('• One\n• Two');
  });

  it('preserves <br> as a line break in both renderings', () => {
    const { html, text } = serialize('<p>Line1<br>Line2</p>');
    expect(html).toBe('<p>Line1<br>Line2</p>');
    expect(text).toBe('Line1\nLine2');
  });

  it('normalizes synonym emphasis tags (b→strong, i→em)', () => {
    const { html, text } = serialize('<b>x</b><i>y</i>');
    expect(html).toBe('<strong>x</strong><em>y</em>');
    expect(text).toBe('xy');
  });

  it('returns empty html for structure-free plain text (falls back to text)', () => {
    const { html, text } = serialize('just some plain words');
    expect(html).toBe('');
    expect(text).toBe('just some plain words');
  });

  it('promotes inline-only generic wrappers to paragraphs', () => {
    const { html, text } = serialize('<div>hello</div><div>world</div>');
    expect(html).toBe('<p>hello</p><p>world</p>');
    expect(text).toBe('hello\nworld');
  });

  it('unwraps generic wrappers that already contain blocks', () => {
    const { html } = serialize('<div><h3>H</h3><p>P</p></div>');
    expect(html).toBe('<h3>H</h3><p>P</p>');
  });

  it('strips attributes, scripts, handlers, and unsafe-scheme links (XSS safety)', () => {
    const { html, text } = serialize(
      '<p onclick="evil()" style="color:red">hi ' +
        '<a href="javascript:alert(1)">link</a></p>' +
        '<script>alert(1)</script>' +
        '<img src=x onerror="alert(1)">',
    );
    // The javascript: link fails the scheme allowlist → unwrapped to plain text.
    expect(html).toBe('<p>hi link</p>');
    expect(text).toBe('hi link');
    // No attribute, unsafe URL, handler, or dropped-element text leaks through.
    for (const danger of ['onclick', 'onerror', 'javascript:', 'href', 'style', '<script', '<img']) {
      expect(html).not.toContain(danger);
    }
  });

  // --- Links (<a>): safe hrefs preserved, unsafe schemes neutralized ---------

  it('keeps a safe http(s) link with href, target, and rel; text keeps the label', () => {
    const { html, text } = serialize('<p>See <a href="https://example.com/docs">the docs</a>.</p>');
    expect(html).toBe(
      '<p>See <a href="https://example.com/docs" target="_blank" rel="noopener noreferrer nofollow">the docs</a>.</p>',
    );
    expect(text).toBe('See the docs.');
  });

  it('keeps a lone link as html (MARKUP_RE includes a), not a text fallback', () => {
    expect(serialize('<a href="https://example.com/x">link</a>').html).toBe(
      '<a href="https://example.com/x" target="_blank" rel="noopener noreferrer nofollow">link</a>',
    );
  });

  it('keeps inline emphasis inside a link', () => {
    expect(serialize('<a href="https://e.com/p"><strong>Bold</strong> bit</a>').html).toBe(
      '<a href="https://e.com/p" target="_blank" rel="noopener noreferrer nofollow"><strong>Bold</strong> bit</a>',
    );
  });

  it('keeps mailto: and tel: links', () => {
    expect(serialize('<a href="mailto:hi@example.com">mail</a>').html).toBe(
      '<a href="mailto:hi@example.com" target="_blank" rel="noopener noreferrer nofollow">mail</a>',
    );
    expect(serialize('<a href="tel:+15551234">call</a>').html).toBe(
      '<a href="tel:+15551234" target="_blank" rel="noopener noreferrer nofollow">call</a>',
    );
  });

  it('drops unsafe-scheme links (javascript:, data:) — keeps the text, no href', () => {
    const { html } = serialize(
      '<p>x <a href="javascript:alert(1)">a</a> <a href="data:text/html,evil">b</a></p>',
    );
    expect(html).toBe('<p>x a b</p>');
    expect(html).not.toContain('href');
  });

  it('unwraps an anchor with no href, keeping its text', () => {
    const { html, text } = serialize('<p>a <a>nolink</a> b</p>');
    expect(html).toBe('<p>a nolink b</p>');
    expect(text).toBe('a nolink b');
  });

  it('absolutizes a relative link against opts.baseUrl', () => {
    const tpl = document.createElement('template');
    tpl.innerHTML = '<p><a href="/guide">Guide</a></p>';
    const { html } = serializeSelection(tpl.content, { baseUrl: 'https://site.test/blog/post' });
    expect(html).toBe(
      '<p><a href="https://site.test/guide" target="_blank" rel="noopener noreferrer nofollow">Guide</a></p>',
    );
  });

  it('drops a relative link when no baseUrl is given (cannot be vetted)', () => {
    expect(serialize('<p>see <a href="/guide">guide</a></p>').html).toBe('<p>see guide</p>');
  });

  it('escapes special characters (e.g. &) in a link href', () => {
    const tpl = document.createElement('template');
    const a = document.createElement('a');
    a.setAttribute('href', 'https://x.com/s?a=1&x=2');
    a.textContent = 'q';
    tpl.content.appendChild(a);
    expect(serializeSelection(tpl.content).html).toContain('href="https://x.com/s?a=1&amp;x=2"');
  });

  it('neutralizes attribute-breakout attempts in a link href (URL-encoded + escaped)', () => {
    const tpl = document.createElement('template');
    const a = document.createElement('a');
    a.setAttribute('href', 'https://x.com/"><img src=x onerror=alert(1)>');
    a.textContent = 'x';
    const p = document.createElement('p');
    p.appendChild(a);
    tpl.content.appendChild(p);
    const { html } = serializeSelection(tpl.content);
    expect(html).not.toContain('"><');
    expect(html).not.toContain('<img');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('keeps blockquotes, code, and nested structure', () => {
    const { html, text } = serialize(
      '<blockquote><p>Quoted <code>x = 1</code></p></blockquote>',
    );
    expect(html).toBe('<blockquote><p>Quoted <code>x = 1</code></p></blockquote>');
    expect(text).toBe('Quoted x = 1');
  });

  // --- Inline images (IMG-*): opt-in, attribute-free tokens -----------------

  it('drops images by default (unchanged v0.3 behavior)', () => {
    const { html } = serialize('<p>Before</p><img src="a.png"><p>After</p>');
    expect(html).toBe('<p>Before</p><p>After</p>');
  });

  it('with images on, keeps them inline in document order, interleaved with text', () => {
    const { html, text } = serializeImg('<p>Before</p><img src="a.png"><p>After</p>');
    expect(html).toBe('<p>Before</p><img data-tsr-img="0"><p>After</p>');
    expect(text).toBe('Before\nAfter'); // an image contributes no plain text
  });

  it('indexes multiple images by document order', () => {
    const { html } = serializeImg('<img src="a"><p>mid <img src="b"></p><img src="c">');
    expect(html).toBe(
      '<img data-tsr-img="0"><p>mid <img data-tsr-img="1"></p><img data-tsr-img="2">',
    );
  });

  it('keeps a lone image as html rather than dropping it (MARKUP_RE includes img)', () => {
    expect(serializeImg('<img src="a.png">').html).toBe('<img data-tsr-img="0">');
  });

  it('image token carries NO page attribute — not the page src or handlers (XSS safety)', () => {
    const { html } = serializeImg('<img src="x" onerror="alert(1)" srcset="y 2x" alt="a">');
    expect(html).toBe('<img data-tsr-img="0">');
    for (const danger of ['onerror', 'src=', 'srcset', 'alt=', 'alert']) {
      expect(html).not.toContain(danger);
    }
  });

  it('inlineImagePaths extracts uploaded paths and skips pending (numeric) tokens', () => {
    const html =
      '<p>a</p><img data-tsr-img="u1/s1/0.png"><img data-tsr-img="1"><img data-tsr-img="u1/s1/2.webp">';
    expect(inlineImagePaths(html)).toEqual(['u1/s1/0.png', 'u1/s1/2.webp']);
  });

  it('inlineImagePaths returns [] for empty / image-free html', () => {
    expect(inlineImagePaths('')).toEqual([]);
    expect(inlineImagePaths(undefined)).toEqual([]);
    expect(inlineImagePaths('<p>no images</p>')).toEqual([]);
  });

  it('applyInlineImageUrls injects resolved (escaped) URLs and skeletons for the rest', () => {
    const html = '<p>a</p><img data-tsr-img="u1/s1/0.png"><img data-tsr-img="1">';
    const out = applyInlineImageUrls(html, new Map([['u1/s1/0.png', 'https://x.test/sign?t=a&b=c']]));
    expect(out).toContain('<img src="https://x.test/sign?t=a&amp;b=c"'); // resolved + escaped
    expect(out).toContain('tsr-inline-pending'); // the numeric (still-uploading) token
    expect(out).not.toContain('data-tsr-img'); // every token consumed
  });

  it('applyInlineImageUrls leaves a path as a skeleton until its URL resolves', () => {
    const out = applyInlineImageUrls('<img data-tsr-img="u1/s1/0.png">', new Map());
    expect(out).toContain('tsr-inline-pending');
    expect(out).not.toContain('<img');
  });
});
