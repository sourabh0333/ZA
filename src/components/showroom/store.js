import { GalleryStore } from "../gallery/store";

// The showroom's per-hero state: the gallery's (scroll progress, header,
// cursor, Rooms menu) plus its eye icons and the work whose card is open.
export class ShowroomStore extends GalleryStore {
  eyeEls = new Map();
  cardEl = null;
  open = null; // the id of the work whose card is open
  openListeners = new Set();

  setEye(id, el) {
    if (el) this.eyeEls.set(id, el);
    else this.eyeEls.delete(id);
  }

  setCard(el) {
    this.cardEl = el;
  }

  setOpen(id) {
    if (id === this.open) return;
    this.open = id;
    for (const fn of this.openListeners) fn();
  }

  subscribeOpen = (fn) => {
    this.openListeners.add(fn);
    return () => this.openListeners.delete(fn);
  };

  getOpen = () => this.open;
}
