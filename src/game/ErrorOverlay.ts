/**
 * Runtime crash notice. Uncaught errors and unhandled promise rejections from the game's
 * own code show a small DOM overlay (the canvas may be the thing that broke) with
 * "reload" and "keep playing". Reloading is safe: saves live in localStorage and the
 * game autosaves on map changes.
 *
 * Shown at most once per page load so a per-frame error cannot stack overlays. Errors
 * from other origins (browser extensions, injected scripts) and known-benign browser
 * noise are ignored.
 */

import { t } from '@/systems/LocaleSystem';

const BENIGN = [/ResizeObserver loop/i, /The play\(\) request was interrupted/i, /AbortError/i];

export interface ErrorOverlayOptions {
  /** Called when the overlay is shown, e.g. to pause the game loop. */
  onShow?: () => void;
  /** Called when the player chooses to keep playing. */
  onDismiss?: () => void;
}

export function installErrorOverlay(options: ErrorOverlayOptions = {}): () => void {
  let shown = false;

  const fromOtherOrigin = (filename: string | undefined): boolean => {
    if (!filename) return false;
    try {
      return new URL(filename, location.href).origin !== location.origin;
    } catch {
      return false;
    }
  };

  const show = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    if (BENIGN.some((re) => re.test(message))) return;
    console.error('[ErrorOverlay] unexpected error', error);
    if (shown) return;
    shown = true;
    options.onShow?.();

    const box = document.createElement('div');
    box.className = 'runtime-error';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-label', t('error.runtime'));
    const title = document.createElement('p');
    title.className = 'runtime-error__title';
    title.textContent = t('error.runtime');
    const detail = document.createElement('p');
    detail.textContent = t('error.runtimeDetail');
    const code = document.createElement('p');
    code.className = 'runtime-error__code';
    code.textContent = message.slice(0, 160);
    const actions = document.createElement('div');
    actions.className = 'runtime-error__actions';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = t('error.reload');
    reload.addEventListener('click', () => location.reload());
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = t('error.continue');
    dismiss.addEventListener('click', () => {
      box.remove();
      options.onDismiss?.();
    });
    actions.append(reload, dismiss);
    box.append(title, detail, code, actions);
    document.body.append(box);
    reload.focus();
  };

  const onError = (event: ErrorEvent): void => {
    if (fromOtherOrigin(event.filename)) return;
    show(event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent): void => show(event.reason);

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
