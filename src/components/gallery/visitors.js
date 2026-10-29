// Visitors in the gallery: who stands where, and what they look at.
// The figures are Rocketbox avatars (MIT) baked with an idle clip by
// scene/people/bake.mjs; cast.json there says which avatar and clip each id is.
//
// pos: where the figure is, in scene coordinates: x and z under its hips, y at
//   its soles (a seated figure's seat is 0.44 m above them)
// look: the point on the floor plan (x, z) the figure faces
// env: the reflection map of the room it stands in, which also lights it
// at: where in its idle clip it starts, so no two breathe in step
// shadows: soft contact shadows [x, y, z, width, depth, darkness]; by default
//   one under the feet
//
// Nobody stands between the camera and the work it stops at, nor within a
// metre of the path (framing.js also keeps the phone camera clear of them).
export const PEOPLE = [
  // the textile wall: two visitors either side of the canvas, a step back
  { id: "elder", pos: [7.3, 0, -3.95], look: [8.5, -5.7], env: "a", at: 0 },
  { id: "textile", pos: [10.6, 0, -3.9], look: [9.3, -5.7], env: "a", at: 4.5 },
  // the gallery room: a couple to the right of the monumental canvas
  { id: "cardigan", pos: [16.8, 0, -14.55], look: [15.3, -16], env: "a", at: 2 },
  { id: "blazer", pos: [17.4, 0, -14.4], look: [15.5, -16], env: "a", at: 9 },
  // the exhibition hall: one on the stairs facing the blue colour field, one at the sideboard
  {
    // third step (0.59 m), against the wall, clear of the way up to the roof;
    // the planted foot rests on the first
    id: "stairs",
    pos: [29.45, 0.155, 2.75],
    look: [28.6, 1.45],
    env: "b",
    at: 6,
    shadows: [
      [29.45, 0.5925, 2.77, 0.55, 0.45, 0.5],
      [29.3, 0.1975, 2.07, 0.35, 0.3, 0.45],
    ],
  },
  { id: "hall", pos: [25.6, 0.031, 0.35], look: [25.0, -1.0], env: "b", at: 3 },
  // the rooftop hall: one on the bench looking out at the city through the glass
  {
    id: "bench",
    pos: [20.25, 3.95, 6.47],
    look: [16.79, 10.59],
    env: "c",
    at: 12,
    shadows: [
      [20.23, 4.39, 6.5, 0.5, 0.45, 0.45],
      [19.82, 3.95, 6.99, 0.45, 0.35, 0.45],
    ],
  },
  // one behind the second freestanding wall, beside "Bronze Hour" on the long wall
  { id: "bronze", pos: [24.92, 3.95, 1.22], look: [25.26, -1.36], env: "c", at: 7 },
  // a couple to the left of the monumental canvas on the end wall
  { id: "gilded_f", pos: [13.4, 3.95, -1.39], look: [13.04, -4.3], env: "c", at: 20 },
  { id: "gilded_m", pos: [12.38, 3.95, -1.34], look: [13.17, -4.46], env: "c", at: 5 },
];

/** Radius of floor each figure takes up, for keeping the camera clear. */
export const PERSON_RADIUS = 0.45;
