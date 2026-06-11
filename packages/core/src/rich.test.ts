// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { inlineImagePaths, serializeSelection } from './rich.js';

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

  it('strips attributes, links, scripts, and event handlers (XSS safety)', () => {
    const { html, text } = serialize(
      '<p onclick="evil()" style="color:red">hi ' +
        '<a href="javascript:alert(1)">link</a></p>' +
        '<script>alert(1)</script>' +
        '<img src=x onerror="alert(1)">',
    );
    expect(html).toBe('<p>hi link</p>');
    expect(text).toBe('hi link');
    // No attribute, URL, handler, or dropped-element text leaks through.
    for (const danger of ['onclick', 'onerror', 'javascript:', 'href', 'style', '<script', '<img']) {
      expect(html).not.toContain(danger);
    }
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
});
