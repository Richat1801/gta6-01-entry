// Solmar Bay input: keyboard state, mouse-look deltas and pointer lock.
// One job: turn raw browser events into clean per-frame answers.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.locked = false;
    this.onPause = null;
    this.onAction = null;
    this.onInteract = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.onPause) this.onPause();
      }
      if (e.code === 'KeyE') {
        if (this.onInteract) this.onInteract();
      }
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      if (e.button === 0 && this.onAction) this.onAction();
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
  }

  /** Ask the canvas for pointer lock (mouse-look). Safe to call repeatedly. */
  requestLock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch {
        // Pointer lock unavailable — mouse-look falls back to drag.
      }
    }
  }

  /** Release pointer lock. */
  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** True only on the frame the key went down (consumed by this call). */
  wasPressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  /** Mouse-look deltas since the last frame; resets to zero. */
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  /** Driving keys as { forward, back, left, right }. */
  driveInput() {
    return {
      forward: this.isDown('KeyW') || this.isDown('ArrowUp'),
      back: this.isDown('KeyS') || this.isDown('ArrowDown'),
      left: this.isDown('KeyA') || this.isDown('ArrowLeft'),
      right: this.isDown('KeyD') || this.isDown('ArrowRight'),
    };
  }

  /** On-foot keys as { forward, back, left, right, sprint, jump }. */
  walkInput() {
    const d = this.driveInput();
    return {
      ...d,
      sprint: this.isDown('ShiftLeft') || this.isDown('ShiftRight'),
      jump: this.isDown('Space'),
    };
  }

  /** Clear per-frame edge state at the end of a frame. */
  endFrame() {
    this.pressed.clear();
  }
}
