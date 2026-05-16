import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('startup markup', () => {
  it('keeps boot splash and app root as sibling body children', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const bootSplash = doc.getElementById('boot-splash');
    const root = doc.getElementById('root');

    expect(bootSplash).toBeTruthy();
    expect(root).toBeTruthy();
    expect(bootSplash?.parentElement).toBe(doc.body);
    expect(root?.parentElement).toBe(doc.body);
    expect(bootSplash?.contains(root as Node)).toBe(false);
  });
});