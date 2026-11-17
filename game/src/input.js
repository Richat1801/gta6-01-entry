// Solmar Bay: keyboard + mouse input. One job: raw device state, nothing else.
// The game reads keys by code; mouse-look deltas accumulate until consumed.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.pointerLocked = false;
    this._onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
    };
    this._onMouseUp = (e) => { if (e.button === 0) this.mouseDown = false; };
    this._onLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    };
    this._onBlur = () => { this.keys.clear(); this.mouseDown = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    window.addEventListener('blur', this._onBlur);
  }

  down(code) { return this.keys.has(code); }

  // WASD / arrows as a -1..1 pair, already normalised.
  moveAxes() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }

  // Edge-triggered key: true once per physical press.
  pressed(code) {
    if (this.keys.has(code) && !this._prevPressed.has(code)) {
      this._prevPressed.add(code);
      return true;
    }
    if (!this.keys.has(code)) this._prevPressed.delete(code);
    return false;
  }

  lockPointer() {
    if (!this.pointerLocked && this.canvas.requestPointerLock) {
      try { this.canvas.requestPointerLock(); } catch (e) { /* pointer lock unavailable */ }
    }
  }

  unlockPointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
Input.prototype._prevPressed = new Set();
