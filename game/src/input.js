// Input: keyboard state, mouse-look with pointer lock plus a drag fallback,
// and edge-triggered action presses (E, F, 1, P, M, Space).

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, consumed each frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.dragging = false;
    this.pointerLocked = false;
    this.shootHeld = false;
    this.onFirstGesture = null;
    this.attach();
  }

  attach() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.onFirstGesture) this.onFirstGesture();
      // Keep Space / arrows from scrolling the page.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    this.canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      if (e.button === 0) this.shootHeld = true;
      if (this.onFirstGesture) this.onFirstGesture();
      if (!this.pointerLocked) {
        this.dragging = true;
        // Pointer lock on click for real mouse-look; drag still works if it fails.
        try {
          this.canvas.requestPointerLock();
        } catch (err) {
          // Headless or denied: drag fallback stays active.
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseDown = false;
      if (e.button === 0) this.shootHeld = false;
      this.dragging = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once, on the frame the key went down.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  endFrame() {
    this.pressed.clear();
  }

  // Movement axes in camera space: forward/back/left/right, sprint, jump.
  moveAxes() {
    return {
      forward: this.down('KeyW') || this.down('ArrowUp'),
      back: this.down('KeyS') || this.down('ArrowDown'),
      left: this.down('KeyA') || this.down('ArrowLeft'),
      right: this.down('KeyD') || this.down('ArrowRight'),
      sprint: this.down('ShiftLeft') || this.down('ShiftRight'),
      jump: this.down('Space'),
    };
  }
}
