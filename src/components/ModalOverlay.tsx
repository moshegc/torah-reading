import React, { useEffect } from 'react';

let lockCount = 0;
let restoreScroll: (() => void) | undefined;

export function lockPageScroll(): () => void {
  if (lockCount === 0) {
    const { body, documentElement } = document;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const properties = ['position', 'top', 'left', 'width', 'overflow'] as const;
    const previous = properties.map((property) => body.style[property]);
    const previousOverflow = documentElement.style.overflow;
    const previousScrollBehavior = documentElement.style.scrollBehavior;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    restoreScroll = () => {
      properties.forEach((property, index) => { body.style[property] = previous[index]; });
      documentElement.style.overflow = previousOverflow;
      documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(scrollX, scrollY);
      documentElement.style.scrollBehavior = previousScrollBehavior;
    };
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount -= 1;
    if (lockCount === 0) {
      restoreScroll?.();
      restoreScroll = undefined;
    }
  };
}

export function ModalOverlay({ children }: React.PropsWithChildren) {
  useEffect(() => lockPageScroll(), []);

  return (
    <div className="modal-overlay fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3">
      {children}
    </div>
  );
}
