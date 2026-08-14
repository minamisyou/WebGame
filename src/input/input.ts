import { SIZE, type RotateDir } from '../core/types';
import type { BoardView } from '../render/renderer';

/** Horizontal travel that turns a drag into a rotate instead of a drop. */
const SWIPE_PX = 44;
/** How much more horizontal than vertical a swipe must be to count. */
const SWIPE_BIAS = 1.4;

export interface InputHandlers {
  preview: (col: number | null) => void;
  drop: (col: number) => void;
  rotate: (dir: RotateDir) => void;
  /** Fires on the first real gesture — the only place audio can be unlocked. */
  gesture: () => void;
}

/**
 * Pointer Events cover mouse, touch and pen with no 300ms tap delay. A press
 * previews the landing spot; releasing commits it; a horizontal swipe rotates.
 */
export function attachBoardInput(
  canvas: HTMLCanvasElement,
  view: BoardView,
  handlers: InputHandlers,
): () => void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let swiping = false;

  const reset = () => {
    pointerId = null;
    swiping = false;
    handlers.preview(null);
  };

  const onDown = (e: PointerEvent) => {
    if (pointerId !== null) return;
    handlers.gesture();
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    swiping = false;
    canvas.setPointerCapture(e.pointerId);
    handlers.preview(view.columnAt(e.clientX, e.clientY));
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!swiping && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_BIAS) {
      swiping = true;
      handlers.preview(null);
    }
    if (!swiping) handlers.preview(view.columnAt(e.clientX, e.clientY));
  };

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    if (swiping) {
      handlers.rotate(dx > 0 ? 'cw' : 'ccw');
    } else {
      const col = view.columnAt(e.clientX, e.clientY);
      if (col !== null) handlers.drop(col);
    }
    reset();
  };

  const onCancel = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    reset();
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
  };
}

/** Keyboard play for desktop and for anyone who can't use touch. */
export function attachKeyboardInput(handlers: InputHandlers): () => void {
  let cursor = Math.floor(SIZE / 2);

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowLeft':
        cursor = Math.max(0, cursor - 1);
        handlers.preview(cursor);
        break;
      case 'ArrowRight':
        cursor = Math.min(SIZE - 1, cursor + 1);
        handlers.preview(cursor);
        break;
      case 'ArrowDown':
      case ' ':
      case 'Enter':
        handlers.gesture();
        handlers.drop(cursor);
        break;
      case 'z':
      case 'Z':
        handlers.gesture();
        handlers.rotate('ccw');
        break;
      case 'x':
      case 'X':
        handlers.gesture();
        handlers.rotate('cw');
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
