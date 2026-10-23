import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockPageScroll } from './ModalOverlay';

afterEach(() => vi.unstubAllGlobals());

function mockPage() {
  const body = { style: { position: 'relative', top: '3px', left: '', width: '90%', overflow: 'auto' } };
  const documentElement = { style: { overflow: 'scroll', scrollBehavior: 'smooth' } };
  const scrollTo = vi.fn();
  vi.stubGlobal('document', { body, documentElement });
  vi.stubGlobal('window', { scrollX: 12, scrollY: 450, scrollTo });
  return { body, documentElement, scrollTo };
}

describe('modal scroll locking', () => {
  it('fixes the background on mobile and restores styles and scroll position on close', () => {
    const { body, documentElement, scrollTo } = mockPage();
    const original = { ...body.style };
    const release = lockPageScroll();
    expect(body.style).toEqual({ position: 'fixed', top: '-450px', left: '-12px', width: '100%', overflow: 'hidden' });
    expect(documentElement.style.overflow).toBe('hidden');
    release();
    expect(body.style).toEqual(original);
    expect(documentElement.style).toEqual({ overflow: 'scroll', scrollBehavior: 'smooth' });
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith(12, 450);
  });

  it.each([true, false])('keeps overlapping modals locked (close first modal first: %s)', (firstFirst) => {
    const { body, scrollTo } = mockPage();
    const releaseFirst = lockPageScroll();
    const releaseSecond = lockPageScroll();
    const release = firstFirst ? releaseFirst : releaseSecond;
    release();
    release();
    expect(body.style.position).toBe('fixed');
    expect(scrollTo).not.toHaveBeenCalled();
    (firstFirst ? releaseSecond : releaseFirst)();
    expect(body.style.position).toBe('relative');
    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it('captures the current scroll position again when reopening a modal', () => {
    mockPage();
    lockPageScroll()();
    const { body, scrollTo } = mockPage();
    const release = lockPageScroll();
    expect(body.style.top).toBe('-450px');
    release();
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith(12, 450);
  });
});
