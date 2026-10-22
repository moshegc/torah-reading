import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FetchedPortionText, TextDisplayMode } from '../utils/sefariaApi';
import { TorahTextViewer } from './TorahTextViewer';

const state = vi.hoisted(() => ({
  index: 0,
  overrides: new Map<number, unknown>(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.index++;
      return actual.useState(state.overrides.has(index) ? state.overrides.get(index) : initial);
    },
  };
});

const portion: FetchedPortionText = {
  refs: ['Genesis 1:31-2:1'],
  heRef: '',
  sefariaUrl: 'https://www.sefaria.org/Genesis.1.31-2.1',
  verses: [
    {
      chapter: 1, verse: 31, heChapter: 'FIRST_CHAPTER', heVerse: 'FIRST_VERSE',
      withTaamim: 'ACCENTED_FIRST', nikudOnly: 'VOWELLED_FIRST',
      withoutNikud: 'PLAIN_FIRST', parashaBreak: null,
    },
    {
      chapter: 2, verse: 1, heChapter: 'SECOND_CHAPTER', heVerse: 'SECOND_VERSE',
      withTaamim: 'ACCENTED_SECOND', nikudOnly: 'VOWELLED_SECOND',
      withoutNikud: 'PLAIN_SECOND', parashaBreak: null,
    },
  ],
};

afterEach(() => {
  state.index = 0;
  state.overrides.clear();
});

function renderText(mode: TextDisplayMode, layout: 'inline' | 'list', revealed = false) {
  // Seed the viewer's mode, layout, reveal state and asynchronously fetched text.
  state.overrides.set(0, mode);
  state.overrides.set(2, layout);
  state.overrides.set(7, revealed ? { '1:31': true, '2:1': true } : {});
  state.overrides.set(8, portion);
  return renderToStaticMarkup(<TorahTextViewer parashaName="בראשית" />);
}

describe.each(['inline', 'list'] as const)('portion text in %s layout', (layout) => {
  it.each([false, true])('hides chapter breaks and numbers without nikud and teamim (revealed: %s)', (revealed) => {
    const html = renderText('no_nikud', layout, revealed);
    expect(html).not.toContain('SECOND_CHAPTER');
    expect(html).not.toContain('FIRST_VERSE');
    expect(html).not.toContain('SECOND_VERSE');
    expect(html).toContain(revealed ? 'ACCENTED_FIRST' : 'PLAIN_FIRST');
    expect(html).toContain(revealed ? 'ACCENTED_SECOND' : 'PLAIN_SECOND');
  });

  it.each(['full', 'nikud_only', 'tikkun'] as const)('preserves chapter breaks and numbers in %s mode', (mode) => {
    const html = renderText(mode, layout);
    expect(html).toContain('SECOND_CHAPTER');
    expect(html).toContain('FIRST_VERSE');
    expect(html).toContain('SECOND_VERSE');
    expect(html).toContain(mode === 'nikud_only' ? 'VOWELLED_FIRST' : 'ACCENTED_FIRST');
  });
});
