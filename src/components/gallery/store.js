import { createContext, useContext } from "react";

// Per-hero state shared by the scroll driver, the WebGL scene and the DOM
// overlay. It changes every frame, so it lives outside React state: components
// call these methods from event and animation callbacks and write to the DOM.
export class GalleryStore {
  target = 0; // scroll progress the user asked for (0..1)
  smooth = 0; // damped progress the camera is actually at
  workEls = new Map();
  zones = []; // parts of the building drawn only over part of the walk (Scene.jsx)
  headerEl = null;
  cursorEl = null;
  scroller = null;

  setTarget(p) {
    this.target = p;
  }

  /** Eases the camera progress toward the scroll target; returns it. */
  step(dt, rate = 3.2) {
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * rate);
    this.smooth += (this.target - this.smooth) * k;
    return this.smooth;
  }

  snap() {
    this.smooth = this.target;
  }

  setZones(zones) {
    this.zones = zones;
  }

  setWork(id, el) {
    if (el) this.workEls.set(id, el);
    else this.workEls.delete(id);
  }

  setHeader(el) {
    this.headerEl = el;
  }

  setCursor(el) {
    this.cursorEl = el;
  }
  setScroller(fn) {
    this.scroller = fn;
  }

  scrollTo(p) {
    this.scroller?.(p);
  }
}

export const GalleryContext = createContext(null);

export function useGallery() {
  return useContext(GalleryContext);
}
