/* Bounded, cancellable image loading shared by the canvas, directory and lightbox. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlutonoCImages = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  function abortError() { return new DOMException('Image loading cancelled', 'AbortError'); }

  function attempt(source, { signal, timeout, priority }) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(abortError()); return; }
      const image = new Image();
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        image.onload = image.onerror = null;
        if (error) {
          image.removeAttribute('src');
          reject(error);
        } else resolve(image);
      };
      const cancel = () => finish(abortError());
      const timer = setTimeout(() => finish(new Error('Image loading timed out')), timeout);
      signal?.addEventListener('abort', cancel, { once: true });
      image.decoding = 'async';
      image.fetchPriority = priority;
      image.onload = () => {
        // Keep the deadline active during decoding as well as transfer.
        Promise.resolve().then(() => image.decode?.()).then(() => finish(), error => finish(error));
      };
      image.onerror = () => finish(new Error('Image loading failed'));
      image.src = source;
    });
  }

  async function load(source, { signal, timeout = 12000, retries = 1, priority = 'auto' } = {}) {
    for (let index = 0; ; index += 1) {
      try { return await attempt(source, { signal, timeout, priority }); }
      catch (error) {
        if (signal?.aborted || error.name === 'AbortError' || index >= retries) throw error;
      }
    }
  }

  // Load into the actual DOM image so <picture> keeps native source selection.
  async function loadElement(image, { apply, clear, signal, timeout = 12000, retries = 1 } = {}) {
    for (let index = 0; ; index += 1) {
      try {
        return await new Promise((resolve, reject) => {
          if (signal?.aborted) { reject(abortError()); return; }
          let settled = false, decoding = false;
          const finish = error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
            image.removeEventListener('load', ready);
            image.removeEventListener('error', failed);
            if (error) { clear?.(); reject(error); } else resolve(image);
          };
          const ready = () => {
            if (decoding || settled) return;
            decoding = true;
            Promise.resolve().then(() => image.decode?.()).then(() => finish(), finish);
          };
          const failed = () => finish(new Error('Image loading failed'));
          const cancel = () => finish(abortError());
          const timer = setTimeout(() => finish(new Error('Image loading timed out')), timeout);
          signal?.addEventListener('abort', cancel, { once: true });
          image.addEventListener('load', ready);
          image.addEventListener('error', failed);
          try { apply(index); if (image.complete && image.naturalWidth) queueMicrotask(ready); }
          catch (error) { finish(error); }
        });
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError' || index >= retries) throw error;
      }
    }
  }

  return { load, loadElement };
});
