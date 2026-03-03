/**
 * Minimal DOM polyfills for pdfjs-dist in serverless environments (Vercel).
 *
 * pdfjs-dist v5 references DOMMatrix, Path2D and ImageData at module scope
 * (e.g. `const SCALE_MATRIX = new DOMMatrix()`). In Node.js / serverless
 * these globals don't exist, so the import crashes before any code can run.
 *
 * These polyfills provide just enough for text extraction to work.
 * Canvas-based rendering paths won't be used, so stubs are fine there.
 */

// ─── DOMMatrix ──────────────────────────────────────────────────────────────

class DOMMatrixPolyfill {
  m11: number;
  m12: number;
  m13 = 0;
  m14 = 0;
  m21: number;
  m22: number;
  m23 = 0;
  m24 = 0;
  m31 = 0;
  m32 = 0;
  m33 = 1;
  m34 = 0;
  m41: number;
  m42: number;
  m43 = 0;
  m44 = 1;

  constructor(init?: number[] | Float32Array | Float64Array | string) {
    const arr = init instanceof Float32Array || init instanceof Float64Array
      ? Array.from(init)
      : Array.isArray(init)
        ? init
        : undefined;

    if (arr && arr.length === 6) {
      this.m11 = arr[0];
      this.m12 = arr[1];
      this.m21 = arr[2];
      this.m22 = arr[3];
      this.m41 = arr[4];
      this.m42 = arr[5];
    } else if (arr && arr.length === 16) {
      [
        this.m11, this.m12, this.m13, this.m14,
        this.m21, this.m22, this.m23, this.m24,
        this.m31, this.m32, this.m33, this.m34,
        this.m41, this.m42, this.m43, this.m44,
      ] = arr;
    } else {
      // Identity
      this.m11 = 1;
      this.m12 = 0;
      this.m21 = 0;
      this.m22 = 1;
      this.m41 = 0;
      this.m42 = 0;
    }
  }

  get a() { return this.m11; }
  set a(v) { this.m11 = v; }
  get b() { return this.m12; }
  set b(v) { this.m12 = v; }
  get c() { return this.m21; }
  set c(v) { this.m21 = v; }
  get d() { return this.m22; }
  set d(v) { this.m22 = v; }
  get e() { return this.m41; }
  set e(v) { this.m41 = v; }
  get f() { return this.m42; }
  set f(v) { this.m42 = v; }

  get is2D() {
    return (
      this.m13 === 0 && this.m14 === 0 &&
      this.m23 === 0 && this.m24 === 0 &&
      this.m31 === 0 && this.m32 === 0 &&
      this.m33 === 1 && this.m34 === 0 &&
      this.m43 === 0 && this.m44 === 1
    );
  }

  get isIdentity() {
    return (
      this.m11 === 1 && this.m12 === 0 && this.m13 === 0 && this.m14 === 0 &&
      this.m21 === 0 && this.m22 === 1 && this.m23 === 0 && this.m24 === 0 &&
      this.m31 === 0 && this.m32 === 0 && this.m33 === 1 && this.m34 === 0 &&
      this.m41 === 0 && this.m42 === 0 && this.m43 === 0 && this.m44 === 1
    );
  }

  // ── Immutable operations (return new matrix) ──────────────────────────

  private _mult(o: DOMMatrixPolyfill): DOMMatrixPolyfill {
    const r = new DOMMatrixPolyfill();
    r.m11 = this.m11 * o.m11 + this.m12 * o.m21;
    r.m12 = this.m11 * o.m12 + this.m12 * o.m22;
    r.m21 = this.m21 * o.m11 + this.m22 * o.m21;
    r.m22 = this.m21 * o.m12 + this.m22 * o.m22;
    r.m41 = this.m41 * o.m11 + this.m42 * o.m21 + o.m41;
    r.m42 = this.m41 * o.m12 + this.m42 * o.m22 + o.m42;
    return r;
  }

  multiply(other?: any): DOMMatrixPolyfill {
    if (!other) return new DOMMatrixPolyfill([this.m11, this.m12, this.m21, this.m22, this.m41, this.m42]);
    const o = other instanceof DOMMatrixPolyfill ? other : DOMMatrixPolyfill.fromMatrix(other);
    return this._mult(o);
  }

  translate(tx = 0, ty = 0): DOMMatrixPolyfill {
    return this._mult(new DOMMatrixPolyfill([1, 0, 0, 1, tx, ty]));
  }

  scale(sx = 1, sy?: number): DOMMatrixPolyfill {
    return this._mult(new DOMMatrixPolyfill([sx, 0, 0, sy ?? sx, 0, 0]));
  }

  rotate(_angle = 0): DOMMatrixPolyfill {
    const rad = _angle * Math.PI / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return this._mult(new DOMMatrixPolyfill([c, s, -s, c, 0, 0]));
  }

  inverse(): DOMMatrixPolyfill {
    const det = this.m11 * this.m22 - this.m12 * this.m21;
    if (det === 0) return new DOMMatrixPolyfill();
    return new DOMMatrixPolyfill([
      this.m22 / det,
      -this.m12 / det,
      -this.m21 / det,
      this.m11 / det,
      (this.m21 * this.m42 - this.m22 * this.m41) / det,
      (this.m12 * this.m41 - this.m11 * this.m42) / det,
    ]);
  }

  // ── Mutable "self" operations (pdfjs uses these) ──────────────────────

  multiplySelf(other?: any): this {
    const r = this.multiply(other);
    this.m11 = r.m11; this.m12 = r.m12;
    this.m21 = r.m21; this.m22 = r.m22;
    this.m41 = r.m41; this.m42 = r.m42;
    return this;
  }

  preMultiplySelf(other?: any): this {
    if (!other) return this;
    const o = other instanceof DOMMatrixPolyfill ? other : DOMMatrixPolyfill.fromMatrix(other);
    const r = o._mult(this);
    this.m11 = r.m11; this.m12 = r.m12;
    this.m21 = r.m21; this.m22 = r.m22;
    this.m41 = r.m41; this.m42 = r.m42;
    return this;
  }

  invertSelf(): this {
    const r = this.inverse();
    this.m11 = r.m11; this.m12 = r.m12;
    this.m21 = r.m21; this.m22 = r.m22;
    this.m41 = r.m41; this.m42 = r.m42;
    return this;
  }

  translateSelf(tx = 0, ty = 0): this {
    const r = this.translate(tx, ty);
    this.m11 = r.m11; this.m12 = r.m12;
    this.m21 = r.m21; this.m22 = r.m22;
    this.m41 = r.m41; this.m42 = r.m42;
    return this;
  }

  scaleSelf(sx = 1, sy?: number): this {
    const r = this.scale(sx, sy);
    this.m11 = r.m11; this.m12 = r.m12;
    this.m21 = r.m21; this.m22 = r.m22;
    this.m41 = r.m41; this.m42 = r.m42;
    return this;
  }

  // ── Utility ───────────────────────────────────────────────────────────

  transformPoint(point?: { x?: number; y?: number }) {
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    return {
      x: this.m11 * x + this.m21 * y + this.m41,
      y: this.m12 * x + this.m22 * y + this.m42,
      z: 0,
      w: 1,
    };
  }

  toFloat64Array() {
    return new Float64Array([
      this.m11, this.m12, this.m13, this.m14,
      this.m21, this.m22, this.m23, this.m24,
      this.m31, this.m32, this.m33, this.m34,
      this.m41, this.m42, this.m43, this.m44,
    ]);
  }

  toString() {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }

  static fromMatrix(other: any): DOMMatrixPolyfill {
    const m = new DOMMatrixPolyfill();
    if (other) {
      m.m11 = other.m11 ?? other.a ?? 1;
      m.m12 = other.m12 ?? other.b ?? 0;
      m.m21 = other.m21 ?? other.c ?? 0;
      m.m22 = other.m22 ?? other.d ?? 1;
      m.m41 = other.m41 ?? other.e ?? 0;
      m.m42 = other.m42 ?? other.f ?? 0;
    }
    return m;
  }

  static fromFloat32Array(arr: Float32Array) {
    return new DOMMatrixPolyfill(arr);
  }

  static fromFloat64Array(arr: Float64Array) {
    return new DOMMatrixPolyfill(arr);
  }
}

// ─── Path2D (stub — only needed for canvas rendering) ───────────────────────

class Path2DPolyfill {
  addPath(_path?: any, _transform?: any) {}
  closePath() {}
  moveTo(_x: number, _y: number) {}
  lineTo(_x: number, _y: number) {}
  bezierCurveTo(_cp1x: number, _cp1y: number, _cp2x: number, _cp2y: number, _x: number, _y: number) {}
  quadraticCurveTo(_cpx: number, _cpy: number, _x: number, _y: number) {}
  arc(_x: number, _y: number, _r: number, _sa: number, _ea: number, _ccw?: boolean) {}
  arcTo(_x1: number, _y1: number, _x2: number, _y2: number, _r: number) {}
  ellipse(_x: number, _y: number, _rx: number, _ry: number, _rot: number, _sa: number, _ea: number, _ccw?: boolean) {}
  rect(_x: number, _y: number, _w: number, _h: number) {}
}

// ─── ImageData (stub — only needed for canvas rendering) ────────────────────

class ImageDataPolyfill {
  width: number;
  height: number;
  data: Uint8ClampedArray;

  constructor(sw: number, sh: number);
  constructor(data: Uint8ClampedArray, sw: number, sh?: number);
  constructor(dataOrW: any, swOrH: number, sh?: number) {
    if (dataOrW instanceof Uint8ClampedArray) {
      this.data = dataOrW;
      this.width = swOrH;
      this.height = sh ?? (dataOrW.length / (swOrH * 4));
    } else {
      this.width = dataOrW;
      this.height = swOrH;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    }
  }
}

// ─── Install polyfills ──────────────────────────────────────────────────────

export function ensureDomPolyfills() {
  const g = globalThis as any;
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = DOMMatrixPolyfill;
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = Path2DPolyfill;
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = ImageDataPolyfill;
  }
}
