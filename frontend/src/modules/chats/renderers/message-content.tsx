import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js';

import type { MessageRenderBlock, MessageRenderPreviewKind } from '@/types/domain';

const PREVIEW_MESSAGE_TYPE = 'tauritavern_html_code_preview_height';
const PREVIEW_INITIAL_HEIGHT = 96;
const PREVIEW_MIN_HEIGHT = 48;
const PREVIEW_MAX_HEIGHT = 640;

const DOCTYPE_PATTERN = /<!doctype\b/i;
const HTML_ROOT_PATTERN = /<\s*html[\s>]/i;
const SCRIPT_PATTERN = /<\s*script\b/i;
const STYLE_PATTERN = /<\s*style\b/i;
const SVG_PATTERN = /<\s*svg\b/i;

const HTML_LANGUAGES = new Set(['html', 'htm', 'xhtml']);
const CSS_LANGUAGES = new Set(['css']);
const SVG_LANGUAGES = new Set(['svg']);
const JAVASCRIPT_LANGUAGES = new Set(['js', 'javascript', 'mjs']);
const INLINE_CODE_PATTERN = /`([^`\n]+)`/g;
const BOLD_PATTERN = /\*\*([^*\n][\s\S]*?[^*\n]?)\*\*/g;
const ITALIC_PATTERN = /(^|[^\w*])\*([^*\n][^*\n]*?)\*(?=[^\w*]|$)/g;
const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const XMLISH_LEADING_PATTERN = /^\s*</;
const XMLISH_CLOSING_TAG_PATTERN = /<\/[A-Za-z_][\w:.-]*\s*>/;

type MessageBlock =
  | {
      kind: 'text';
      content: string;
    }
  | {
      kind: 'code';
      language: string;
      content: string;
      interactive?: boolean;
      previewKind?: MessageRenderPreviewKind;
      previewHash?: string;
      allowInteractivePreview?: boolean;
    };

type StructuredMarkupNode =
  | {
      kind: 'text';
      content: string;
    }
  | {
      kind: 'element';
      tagName: string;
      children: StructuredMarkupNode[];
    };

let previewCounter = 0;
let previewListenerBound = false;
const previewFrames = new Map<string, HTMLIFrameElement>();

function normalizeLanguage(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function cleanupDisconnectedPreviewFrames(): void {
  for (const [previewId, frame] of previewFrames.entries()) {
    if (!frame.isConnected) {
      previewFrames.delete(previewId);
    }
  }
}

function bindPreviewMessageListener(): void {
  if (previewListenerBound || typeof window === 'undefined') {
    return;
  }

  previewListenerBound = true;
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== PREVIEW_MESSAGE_TYPE || typeof data.previewId !== 'string') {
      return;
    }

    const iframe = previewFrames.get(data.previewId);
    if (!iframe) {
      return;
    }

    if (!iframe.isConnected) {
      previewFrames.delete(data.previewId);
      return;
    }

    if (iframe.contentWindow !== event.source) {
      return;
    }

    const height = Number(data.height);
    if (!Number.isFinite(height)) {
      return;
    }

    iframe.style.height = `${Math.min(PREVIEW_MAX_HEIGHT, Math.max(PREVIEW_MIN_HEIGHT, Math.ceil(height)))}px`;
  });
}

function createPreviewId(): string {
  previewCounter += 1;
  return `tt-code-preview-${Date.now()}-${previewCounter}`;
}

function createHeightReporter(previewId: string): string {
  const encodedPreviewId = JSON.stringify(previewId);
  const targetOrigin = typeof window !== 'undefined' && window.location?.origin
    ? JSON.stringify(window.location.origin)
    : '"*"';
  return [
    '<script data-tt-height-reporter="true">',
    '(function(){',
    `const MESSAGE_TYPE = "${PREVIEW_MESSAGE_TYPE}";`,
    `const PREVIEW_ID = ${encodedPreviewId};`,
    `const TARGET_ORIGIN = ${targetOrigin};`,
    `const MIN_HEIGHT = ${PREVIEW_MIN_HEIGHT};`,
    'function getContentHeight(){',
    'const body=document.body;',
    'if(!body) return 0;',
    'const bodyRect=body.getBoundingClientRect();',
    'const range=document.createRange();',
    'range.selectNodeContents(body);',
    'const rangeRect=range.getBoundingClientRect();',
    'let elementHeight=0;',
    'const children=Array.from(body.children).filter((child)=>!child.hasAttribute("data-tt-height-reporter"));',
    'for(const child of children){',
    'const rect=child.getBoundingClientRect();',
    'const style=window.getComputedStyle(child);',
    'const marginTop=Number.parseFloat(style.marginTop)||0;',
    'const marginBottom=Number.parseFloat(style.marginBottom)||0;',
    'const top=rect.top-bodyRect.top-marginTop;',
    'const bottom=rect.bottom-bodyRect.top+marginBottom;',
    'elementHeight=Math.max(elementHeight,Math.max(0,bottom-Math.min(0,top)));',
    '}',
    'return Math.max(0, elementHeight, body.scrollHeight||0);',
    '}',
    'function postHeight(){',
    'try{ parent.postMessage({ type: MESSAGE_TYPE, previewId: PREVIEW_ID, height: Math.max(MIN_HEIGHT, Math.ceil(getContentHeight())) }, TARGET_ORIGIN); }catch{}',
    '}',
    'const schedule=()=>requestAnimationFrame(postHeight);',
    'if(typeof ResizeObserver==="function"){',
    'const ro=new ResizeObserver(schedule);',
    'if(document.documentElement) ro.observe(document.documentElement);',
    'if(document.body) ro.observe(document.body);',
    '}',
    'if(typeof MutationObserver==="function"){',
    'const mo=new MutationObserver(schedule);',
    'mo.observe(document.documentElement||document,{subtree:true,childList:true,attributes:true,characterData:true});',
    '}',
    'document.addEventListener("toggle",schedule,true);',
    'window.addEventListener("load",()=>{postHeight();setTimeout(postHeight,50);setTimeout(postHeight,250);setTimeout(postHeight,1000);});',
    'window.addEventListener("resize",schedule);',
    'postHeight();',
    '})();',
    '</script>',
  ].join('');
}

function injectHeightReporter(srcdoc: string, previewId: string): string {
  const reporter = createHeightReporter(previewId);
  if (/<\/body\s*>/i.test(srcdoc)) {
    return srcdoc.replace(/<\/body\s*>/i, `${reporter}</body>`);
  }
  return `${srcdoc}\n${reporter}`;
}

function buildBaseTag(): string {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return '';
  }
  const origin = window.location.origin.endsWith('/') ? window.location.origin : `${window.location.origin}/`;
  return `<base href="${origin}">`;
}

function escapeInlineStyle(source: string): string {
  return String(source || '').replace(/<\/style/gi, '<\\/style');
}

function escapeInlineScript(source: string): string {
  return String(source || '').replace(/<\/script/gi, '<\\/script');
}

function buildCssPreviewSource(sourceCode: string): string {
  const escapedSource = escapeInlineStyle(sourceCode);
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    buildBaseTag(),
    '<style>',
    'html,body{margin:0;padding:0;min-height:100%;background:#f8fafc;color:#0f172a;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    '.tt-code-preview-stage{display:grid;gap:16px;padding:24px;min-height:160px;background:linear-gradient(180deg,#ffffff 0%,#e2e8f0 100%);}',
    '.tt-code-preview-card{padding:20px;border-radius:20px;background:#ffffff;box-shadow:0 18px 42px rgba(15,23,42,0.12);}',
    '.tt-code-preview-badge{display:inline-flex;align-items:center;border-radius:999px;background:#dbeafe;color:#1d4ed8;padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;}',
    '.tt-code-preview-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px;}',
    '.tt-code-preview-button{border:0;border-radius:999px;background:#0f172a;color:#ffffff;padding:10px 16px;font:inherit;cursor:pointer;}',
    '.tt-code-preview-link{display:inline-flex;align-items:center;color:#1d4ed8;text-decoration:none;font-weight:600;}',
    escapedSource,
    '</style>',
    '</head>',
    '<body>',
    '<main class="tt-code-preview-stage">',
    '<section class="tt-code-preview-card">',
    '<span class="tt-code-preview-badge">CSS Preview</span>',
    '<h1>Sandbox Renderer</h1>',
    '<p>Your stylesheet is applied to this sample layout so visual changes can be inspected safely.</p>',
    '<div class="tt-code-preview-actions">',
    '<button class="tt-code-preview-button" type="button">Action</button>',
    '<a class="tt-code-preview-link" href="#">Secondary Link</a>',
    '</div>',
    '</section>',
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
}

function buildJavaScriptPreviewSource(sourceCode: string): string {
  const escapedSource = escapeInlineScript(sourceCode);
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    buildBaseTag(),
    '<style>html,body{margin:0;padding:0;min-height:0;background:#ffffff;color:#0f172a;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}#tt-sandbox-root{min-height:0;}</style>',
    '</head>',
    '<body>',
    '<div id="tt-sandbox-root"></div>',
    `<script type="module">${escapedSource}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

function buildHtmlPreviewSource(sourceCode: string): string {
  const source = sourceCode.trim();
  if (!source) {
    return '';
  }

  if (DOCTYPE_PATTERN.test(source) || HTML_ROOT_PATTERN.test(source)) {
    return source;
  }

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    buildBaseTag(),
    '<style>html,body{margin:0;padding:0;background:#ffffff;color:#0f172a;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}</style>',
    '</head>',
    '<body>',
    source,
    '</body>',
    '</html>',
  ].join('\n');
}

function buildPreviewSource(previewKind: MessageRenderPreviewKind | undefined, language: string, sourceCode: string): string {
  const normalizedLanguage = normalizeLanguage(language);
  const resolvedPreviewKind = previewKind
    ?? (CSS_LANGUAGES.has(normalizedLanguage)
      ? 'css'
      : JAVASCRIPT_LANGUAGES.has(normalizedLanguage)
        ? 'javascript'
        : SVG_LANGUAGES.has(normalizedLanguage)
          ? 'svg'
          : HTML_LANGUAGES.has(normalizedLanguage)
            ? 'html'
            : undefined);

  if (resolvedPreviewKind === 'css') {
    return buildCssPreviewSource(sourceCode);
  }
  if (resolvedPreviewKind === 'javascript') {
    return buildJavaScriptPreviewSource(sourceCode);
  }
  return buildHtmlPreviewSource(sourceCode);
}

export function parseMessageBlocks(source: string): MessageBlock[] {
  const normalizedSource = String(source ?? '').replace(/\r\n?/g, '\n');
  if (!normalizedSource.includes('```')) {
    return [{ kind: 'text', content: normalizedSource }];
  }

  const blocks: MessageBlock[] = [];
  const textBuffer: string[] = [];
  let codeBuffer: string[] = [];
  let codeLanguage = '';
  let openingFence = '';
  let inCodeBlock = false;

  const flushText = () => {
    if (textBuffer.length === 0) {
      return;
    }

    blocks.push({
      kind: 'text',
      content: textBuffer.join('\n'),
    });
    textBuffer.length = 0;
  };

  const flushCode = () => {
    blocks.push({
      kind: 'code',
      language: codeLanguage,
      content: codeBuffer.join('\n'),
    });
    codeBuffer = [];
    codeLanguage = '';
    openingFence = '';
  };

  for (const line of normalizedSource.split('\n')) {
    const fenceMatch = line.match(/^```([^\s`]*)?.*$/);
    const isClosingFence = /^```\s*$/.test(line);

    if (!inCodeBlock) {
      if (fenceMatch) {
        flushText();
        inCodeBlock = true;
        codeLanguage = normalizeLanguage(fenceMatch[1] ?? '');
        openingFence = line;
      } else {
        textBuffer.push(line);
      }
      continue;
    }

    if (isClosingFence) {
      flushCode();
      inCodeBlock = false;
      continue;
    }

    codeBuffer.push(line);
  }

  if (inCodeBlock) {
    textBuffer.push(openingFence, ...codeBuffer);
  }

  flushText();

  if (blocks.length === 0) {
    return [{ kind: 'text', content: normalizedSource }];
  }

  return blocks;
}

export function isInteractiveCodeBlock(language: string, sourceCode: string): boolean {
  const normalizedLanguage = normalizeLanguage(language);
  const source = String(sourceCode || '').trim();
  if (!source) {
    return false;
  }

  if (
    HTML_LANGUAGES.has(normalizedLanguage)
    || CSS_LANGUAGES.has(normalizedLanguage)
    || SVG_LANGUAGES.has(normalizedLanguage)
    || JAVASCRIPT_LANGUAGES.has(normalizedLanguage)
  ) {
    return true;
  }

  return DOCTYPE_PATTERN.test(source)
    || HTML_ROOT_PATTERN.test(source)
    || SCRIPT_PATTERN.test(source)
    || STYLE_PATTERN.test(source)
    || SVG_PATTERN.test(source);
}

function escapeHtml(source: string): string {
  return String(source ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createStructuredTextNode(content: string): StructuredMarkupNode | null {
  const normalized = String(content ?? '').replace(/\r\n?/g, '\n');
  return normalized.trim()
    ? { kind: 'text', content: normalized.trim() }
    : null;
}

function toStructuredMarkupNode(node: ChildNode): StructuredMarkupNode | null {
  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
    return createStructuredTextNode(node.textContent ?? '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as Element;
  const children = Array.from(element.childNodes)
    .map((child) => toStructuredMarkupNode(child))
    .filter((child): child is StructuredMarkupNode => child !== null);

  return {
    kind: 'element',
    tagName: element.tagName.toLowerCase(),
    children,
  };
}

function collectStructuredNodes(root: ParentNode): StructuredMarkupNode[] {
  return Array.from(root.childNodes)
    .map((child) => toStructuredMarkupNode(child))
    .filter((child): child is StructuredMarkupNode => child !== null);
}

export function parseStructuredMarkupDocument(source: string): StructuredMarkupNode[] | null {
  const normalized = String(source ?? '').replace(/\r\n?/g, '\n');
  const trimmed = normalized.trim();

  if (!trimmed || trimmed.includes('```')) {
    return null;
  }

  if (!XMLISH_LEADING_PATTERN.test(trimmed) || !XMLISH_CLOSING_TAG_PATTERN.test(trimmed)) {
    return null;
  }

  if (typeof DOMParser === 'undefined') {
    return null;
  }

  try {
    const parser = new DOMParser();
    const xmlDocument = parser.parseFromString(`<tt-root>${normalized}</tt-root>`, 'application/xml');
    if (xmlDocument.getElementsByTagName('parsererror').length === 0) {
      const nodes = collectStructuredNodes(xmlDocument.documentElement);
      if (nodes.some((node) => node.kind === 'element')) {
        return nodes;
      }
    }

    const htmlDocument = parser.parseFromString(`<tt-root>${normalized}</tt-root>`, 'text/html');
    const htmlRoot = htmlDocument.body.querySelector('tt-root');
    if (!htmlRoot) {
      return null;
    }

    const nodes = collectStructuredNodes(htmlRoot);
    return nodes.some((node) => node.kind === 'element') ? nodes : null;
  } catch {
    return null;
  }
}

function renderInlineMarkdownHtml(source: string): string {
  let output = escapeHtml(source);
  output = output.replace(LINK_PATTERN, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  output = output.replace(INLINE_CODE_PATTERN, '<code>$1</code>');
  output = output.replace(BOLD_PATTERN, '<strong>$1</strong>');
  output = output.replace(ITALIC_PATTERN, '$1<em>$2</em>');
  return output;
}

export function renderBasicMarkdownHtml(source: string): string {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let listKind: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  let blockquote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    html.push(`<p>${paragraph.map((line) => renderInlineMarkdownHtml(line)).join('<br>')}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listKind || listItems.length === 0) {
      listKind = null;
      listItems = [];
      return;
    }
    html.push(`<${listKind}>${listItems.map((item) => `<li>${renderInlineMarkdownHtml(item)}</li>`).join('')}</${listKind}>`);
    listKind = null;
    listItems = [];
  };

  const flushBlockquote = () => {
    if (blockquote.length === 0) {
      return;
    }
    html.push(`<blockquote>${blockquote.map((line) => renderInlineMarkdownHtml(line)).join('<br>')}</blockquote>`);
    blockquote = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushBlockquote();
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    const unorderedMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    const blockquoteMatch = line.match(/^\s*>\s?(.*)$/);

    if (!trimmed) {
      flushAll();
      continue;
    }

    if (headingMatch) {
      flushAll();
      const level = Math.min(6, headingMatch[1]?.length ?? 1);
      html.push(`<h${level}>${renderInlineMarkdownHtml(headingMatch[2] ?? '')}</h${level}>`);
      continue;
    }

    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      flushBlockquote();
      const nextListKind = unorderedMatch ? 'ul' : 'ol';
      if (listKind && listKind !== nextListKind) {
        flushList();
      }
      listKind = nextListKind;
      listItems.push((unorderedMatch?.[1] ?? orderedMatch?.[1] ?? '').trim());
      continue;
    }

    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      blockquote.push(blockquoteMatch[1] ?? '');
      continue;
    }

    flushList();
    flushBlockquote();
    paragraph.push(line);
  }

  flushAll();
  return html.length > 0 ? html.join('') : '<p></p>';
}

function collectStructuredText(nodes: StructuredMarkupNode[]): string {
  return nodes
    .map((node) => (node.kind === 'text' ? node.content : collectStructuredText(node.children)))
    .filter((value) => value.trim().length > 0)
    .join('\n')
    .trim();
}

function StructuredTextBlock(props: { content: string }): JSX.Element {
  return (
    <div
      class="leading-7 text-inherit [&_a]:text-sky-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600 [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-0 [&_ul]:list-disc [&_ul]:pl-6"
      innerHTML={renderBasicMarkdownHtml(props.content)}
    />
  );
}

function StructuredMarkupContent(props: {
  nodes: StructuredMarkupNode[];
}): JSX.Element {
  const renderNodes = (nodes: StructuredMarkupNode[]): JSX.Element => (
    <div class="space-y-3">
      <For each={nodes}>
        {(node) => {
          if (node.kind === 'text') {
            return <StructuredTextBlock content={node.content} />;
          }

          const summaryNode = node.children.find((child): child is Extract<StructuredMarkupNode, { kind: 'element' }> => (
            child.kind === 'element' && child.tagName === 'summary'
          ));
          const bodyNodes = node.children.filter((child) => child !== summaryNode);
          const summaryText = summaryNode ? collectStructuredText(summaryNode.children) : '';
          const bodyText = collectStructuredText(bodyNodes);
          const hasBody = bodyNodes.length > 0 && bodyText.length > 0;
          const tagLabel = node.tagName.replace(/[-_]+/g, ' ');

          if (node.tagName === 'summary') {
            return (
              <div class="text-base font-semibold tracking-tight text-slate-900">
                {summaryText || collectStructuredText(node.children) || 'Summary'}
              </div>
            );
          }

          if (node.tagName === 'details') {
            return (
              <details class="overflow-hidden rounded-[1.2rem] border border-slate-300/70 bg-white/45 px-3 py-2" open>
                <summary class="cursor-pointer list-none text-sm font-semibold tracking-tight text-slate-900">
                  {summaryText || 'Details'}
                </summary>
                <Show when={hasBody}>
                  <div class="mt-3 space-y-3">
                    {renderNodes(bodyNodes)}
                  </div>
                </Show>
              </details>
            );
          }

          if (!summaryText && !hasBody) {
            return null;
          }

          return (
            <section class="rounded-[1.2rem] border border-slate-300/70 bg-white/35 px-3 py-3">
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <span class="inline-flex rounded-full bg-slate-900/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {tagLabel}
                </span>
                <Show when={summaryText}>
                  <span class="text-sm font-semibold tracking-tight text-slate-900">{summaryText}</span>
                </Show>
              </div>
              <Show when={hasBody}>
                <div class="space-y-3">
                  {renderNodes(bodyNodes)}
                </div>
              </Show>
            </section>
          );
        }}
      </For>
    </div>
  );

  return renderNodes(props.nodes);
}

function InteractiveCodePreview(props: {
  language: string;
  sourceCode: string;
  previewKind?: MessageRenderPreviewKind;
}): JSX.Element {
  let iframeRef: HTMLIFrameElement | undefined;
  const previewId = createPreviewId();
  const srcdoc = createMemo(() => injectHeightReporter(buildPreviewSource(props.previewKind, props.language, props.sourceCode), previewId));

  onMount(() => {
    bindPreviewMessageListener();
    cleanupDisconnectedPreviewFrames();
    if (iframeRef) {
      previewFrames.set(previewId, iframeRef);
    }
  });

  onCleanup(() => {
    previewFrames.delete(previewId);
  });

  return (
    <div class="tt-html-preview">
      <div class="tt-html-preview-frame-wrap">
        <iframe
          ref={iframeRef}
          class="tt-html-preview-frame"
          title="Interactive code preview"
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-forms allow-modals"
          srcdoc={srcdoc()}
          style={{ height: `${PREVIEW_INITIAL_HEIGHT}px` }}
        />
      </div>
    </div>
  );
}

function MessageCodeBlock(props: {
  language: string;
  sourceCode: string;
  interactive?: boolean;
  previewKind?: MessageRenderPreviewKind;
  allowInteractivePreview?: boolean;
}): JSX.Element {
  const interactive = createMemo(() => Boolean(props.allowInteractivePreview) && (props.interactive === true || isInteractiveCodeBlock(props.language, props.sourceCode)));
  const languageLabel = createMemo(() => props.language || 'text');
  const [showSource, setShowSource] = createSignal(false);

  return (
    <div class="tt-message-code-block">
      <Show when={interactive()}>
        <InteractiveCodePreview language={props.language} sourceCode={props.sourceCode} previewKind={props.previewKind} />
      </Show>
      <Show
        when={!interactive() || showSource()}
        fallback={(
          <div class="flex justify-end">
            <button
              type="button"
              class="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition hover:opacity-80"
              style={{
                background: 'rgba(15, 23, 42, 0.08)',
                color: 'var(--tt-renderer-code-label, rgba(71,85,105,0.92))',
              }}
              onClick={() => setShowSource(true)}
            >
              View Source
            </button>
          </div>
        )}
      >
        <div class="overflow-hidden rounded-[1.4rem] text-[var(--tt-renderer-code-fg,#f8fafc)]" style={{ background: 'var(--tt-renderer-code-bg, rgba(2, 6, 23, 0.92))' }}>
          <div class="flex items-center justify-between gap-3 border-b px-4 py-2 text-[11px] uppercase tracking-[0.24em]" style={{ border: '1px solid var(--tt-renderer-code-border, rgba(255,255,255,0.08))', color: 'var(--tt-renderer-code-label, rgba(226,232,240,0.88))' }}>
            <span>{languageLabel()}</span>
            <Show when={interactive()}>
              <button
                type="button"
                class="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition hover:opacity-80"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: 'inherit',
                }}
                onClick={() => setShowSource(false)}
              >
                Hide Source
              </button>
            </Show>
          </div>
          <pre class="m-0 overflow-x-auto px-4 py-3 text-[13px] leading-6"><code>{props.sourceCode}</code></pre>
        </div>
      </Show>
    </div>
  );
}

function ReasoningPanel(props: {
  reasoning: string;
  label?: string | null;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);

  return (
    <section
      class="overflow-hidden rounded-[1.2rem] border px-3 py-2"
      style={{
        background: 'var(--tt-renderer-reasoning-bg, rgba(255,255,255,0.42))',
        border: '1px solid var(--tt-renderer-reasoning-border, rgba(148,163,184,0.28))',
      }}
    >
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 text-left text-xs font-semibold uppercase tracking-[0.2em]"
        style={{ color: 'var(--tt-renderer-reasoning-label, rgba(71,85,105,0.92))' }}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{props.label?.trim() || 'Reasoning'}</span>
        <span>{open() ? 'Hide' : 'Show'}</span>
      </button>
      <Show when={open()}>
        <div class="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{props.reasoning}</div>
      </Show>
    </section>
  );
}

export function MessageContent(props: {
  content: string;
  reasoning?: string | null;
  reasoningDisplayText?: string | null;
  renderBlocks?: MessageRenderBlock[] | null;
  interactivePreviewLimit?: number;
  allowInteractivePreview?: boolean;
}): JSX.Element {
  const blocks = createMemo(() => {
    let previewBudget = props.allowInteractivePreview === false
      ? 0
      : Math.max(0, props.interactivePreviewLimit ?? Number.MAX_SAFE_INTEGER);

    const sourceBlocks: MessageBlock[] = Array.isArray(props.renderBlocks) && props.renderBlocks.length > 0
      ? props.renderBlocks.map((block) => (block.kind === 'code'
        ? {
            kind: 'code' as const,
            language: block.language ?? '',
            content: block.content,
            interactive: block.interactive,
            previewKind: block.preview_kind,
            previewHash: block.preview_hash,
          }
        : {
            kind: 'text' as const,
            content: block.content,
          }))
      : parseMessageBlocks(props.content);

    return sourceBlocks.map((block) => {
      if (block.kind !== 'code') {
        return block;
      }

      const interactive = block.interactive === true || isInteractiveCodeBlock(block.language, block.content);
      const allowInteractivePreview = interactive && previewBudget > 0;
      if (allowInteractivePreview) {
        previewBudget -= 1;
      }

      return {
        ...block,
        interactive,
        allowInteractivePreview,
      };
    });
  });
  const isPlainText = createMemo(() => blocks().length === 1 && blocks()[0]?.kind === 'text');
  const hasReasoning = createMemo(() => Boolean(props.reasoning && props.reasoning.trim()));
  const renderTextBlock = (content: string) => {
    const structured = parseStructuredMarkupDocument(content);
    return structured
      ? <StructuredMarkupContent nodes={structured} />
      : <StructuredTextBlock content={content} />;
  };

  return (
    <div class="space-y-3">
      <Show when={hasReasoning()}>
        <ReasoningPanel reasoning={props.reasoning ?? ''} label={props.reasoningDisplayText} />
      </Show>
      <Show
        when={!isPlainText()}
        fallback={renderTextBlock(blocks()[0]?.kind === 'text' ? blocks()[0].content : props.content)}
      >
        <div class="space-y-3">
          <For each={blocks()}>
            {(block) => (block.kind === 'text'
              ? (
                  <Show when={block.content.length > 0}>
                    {renderTextBlock(block.content)}
                  </Show>
                )
              : (
                  <MessageCodeBlock
                    language={block.language}
                    sourceCode={block.content}
                    interactive={block.interactive}
                    previewKind={block.previewKind}
                    allowInteractivePreview={block.allowInteractivePreview}
                  />
                ))}
          </For>
        </div>
      </Show>
    </div>
  );
}
