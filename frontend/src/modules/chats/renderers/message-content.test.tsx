import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';

import { MessageContent, isInteractiveCodeBlock, parseMessageBlocks, parseStructuredMarkupDocument, renderBasicMarkdownHtml } from './message-content';

describe('parseMessageBlocks', () => {
  it('keeps plain text as a single block', () => {
    expect(parseMessageBlocks('hello')).toEqual([
      { kind: 'text', content: 'hello' },
    ]);
  });

  it('splits fenced code blocks from surrounding text', () => {
    expect(parseMessageBlocks('before\n```html\n<div>demo</div>\n```\nafter')).toEqual([
      { kind: 'text', content: 'before' },
      { kind: 'code', language: 'html', content: '<div>demo</div>' },
      { kind: 'text', content: 'after' },
    ]);
  });
});

describe('isInteractiveCodeBlock', () => {
  it('detects html, css and javascript previews', () => {
    expect(isInteractiveCodeBlock('html', '<div>demo</div>')).toBe(true);
    expect(isInteractiveCodeBlock('css', 'body { color: red; }')).toBe(true);
    expect(isInteractiveCodeBlock('javascript', 'document.body.textContent = "demo";')).toBe(true);
    expect(isInteractiveCodeBlock('', 'plain text')).toBe(false);
  });
});

describe('renderBasicMarkdownHtml', () => {
  it('renders a safe generic markdown subset without stripping XML-like tags', () => {
    const html = renderBasicMarkdownHtml('# Title\n\n- first\n- second\n\n<summary>tag</summary>\n\n**bold** and `code`');

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<ul><li>first</li><li>second</li></ul>');
    expect(html).toContain('&lt;summary&gt;tag&lt;/summary&gt;');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('escapes unsafe HTML input', () => {
    expect(renderBasicMarkdownHtml('<script>alert(1)</script>')).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('parseStructuredMarkupDocument', () => {
  it('parses XML-like content into a structured document tree', () => {
    expect(parseStructuredMarkupDocument('<details><summary>State</summary><outlines>1. step</outlines></details>')).toMatchObject([
      {
        kind: 'element',
        tagName: 'details',
      },
    ]);
  });

  it('falls back to the relaxed HTML parser when markup is malformed', () => {
    expect(parseStructuredMarkupDocument('<details><summary>Broken</details>')).toMatchObject([
      {
        kind: 'element',
        tagName: 'details',
      },
    ]);
  });
});

describe('MessageContent', () => {
  it('renders XML-like structured content as generic sections instead of raw tags', () => {
    render(() => <MessageContent content={'<summary>state</summary>\n\n<outlines>\n1. step\n</outlines>'} />);

    expect(screen.getByText('state')).toBeTruthy();
    expect(screen.getByText('outlines')).toBeTruthy();
    expect(screen.getByText('step')).toBeTruthy();
  });

  it('uses the relaxed structured renderer when XML-like content is malformed', () => {
    render(() => <MessageContent content={'<details><summary>broken</details>'} />);

    expect(screen.getByText('broken')).toBeTruthy();
  });

  it('renders sandbox preview for html code fences', () => {
    render(() => <MessageContent content={'Before\n```html\n<div class="card">demo</div>\n```\nAfter'} />);

    expect(screen.getByText('Before')).toBeTruthy();
    expect(screen.getByText('After')).toBeTruthy();

    const iframe = screen.getByTitle('Interactive code preview') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe.getAttribute('srcdoc')).toContain('<div class="card">demo</div>');
    expect(screen.queryByText('html')).toBeNull();
    expect(screen.getByRole('button', { name: 'View Source' })).toBeTruthy();
  });

  it('reveals html source only after an explicit toggle', () => {
    render(() => <MessageContent content={'```html\n<div class="card">demo</div>\n```'} />);

    fireEvent.click(screen.getByRole('button', { name: 'View Source' }));

    expect(screen.getByText('html')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide Source' })).toBeTruthy();
  });

  it('builds a css preview shell for css code fences', () => {
    render(() => <MessageContent content={'```css\nbody { background: rgb(255, 0, 0); }\n```'} />);

    const iframe = screen.getByTitle('Interactive code preview') as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toContain('CSS Preview');
    expect(iframe.getAttribute('srcdoc')).toContain('body { background: rgb(255, 0, 0); }');
  });

  it('skips iframe mounting when interactive previews are disabled for the message', () => {
    render(() => <MessageContent content={'```html\n<div>demo</div>\n```'} allowInteractivePreview={false} />);

    expect(screen.queryByTitle('Interactive code preview')).toBeNull();
    expect(screen.getByText('html')).toBeTruthy();
  });

  it('prefers backend render blocks when provided', () => {
    render(() => <MessageContent content={'ignored'} renderBlocks={[
      {
        kind: 'text',
        content: 'Before',
        language: '',
        interactive: false,
        preview_hash: '',
      },
      {
        kind: 'code',
        language: 'javascript',
        content: 'document.getElementById("tt-sandbox-root").textContent = "JS Demo";',
        interactive: true,
        preview_kind: 'javascript',
        preview_hash: 'hash-js-demo',
      },
    ]} />);

    expect(screen.getByText('Before')).toBeTruthy();
    const iframe = screen.getByTitle('Interactive code preview') as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toContain('type="module"');
    expect(iframe.getAttribute('srcdoc')).toContain('JS Demo');
  });
});
