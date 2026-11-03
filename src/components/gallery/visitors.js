// Visitors in the gallery: who is where, what they look at and what they do.
// The figures are Rocketbox avatars (MIT) baked with their clips (and a glass
// or phone in hand) by scene/people/bake.mjs; cast.json there says which
// avatar, clips and prop each id is.
//
// pos: where the figure is, in scene coordinates: x and z under its hips, y at
//   its soles (a seated figure's seat is 0.44 m above them)
// look: the point on the floor plan (x, z) the figure faces
// env: the reflection map of the room it stands in, which also lights it
// at: seconds into what it does where it starts, so no two move in step
// shadows: soft contact shadows [x, y, z, width, depth, darkness]; by default
//   one under the feet
// light: how strongly the room's reflection map lights it, if not as everyone
//   else in that room (out on the dusk terrace, less)
// first: in the first view, so prepared with the rooms before the gallery
//   opens (the rest are fetched once it is showing, in this order)
// acts: how its clips take turns, [clip, times] pairs played round and round
//   (by default its one clip, played forth and back)
// walk: a stroller's way: from pos to `to` (x, z) and back, or along `path`
//   ([x, y, z] points after pos, up stairs as well), at the speed its walk was
//   baked with; at each end it turns to `looks` (one point per end) and plays
//   its second clip `pause` times before turning back. `start` is how far
//   along the first leg it begins (0 to 1)
//
// Nobody stops between the camera and the work it stops at, nor comes within
// a metre of the path (framing.js also keeps the phone camera clear of them).
export const PEOPLE = [
  // the reception: the receptionist and a guest at the end of the desk, clear
  // of the sign; a visitor strolling between the console and the desk; one on
  // the sofa
  { id: "receptionist", pos: [0.7, 0, -5.15], look: [1.5, -4.3], env: "a", at: 3, first: true },
  { id: "guest", pos: [1.5, 0, -4.3], look: [0.7, -5.15], env: "a", at: 1, first: true },
  {
    id: "stroller",
    pos: [-4.6, 0, -3.4],
    look: [0.6, -3.4],
    env: "a",
    at: 0,
    first: true,
    // (setting off from the console side, so the sign is clear as the gallery
    // opens; she only ever passes in front of it, and waits at the desk in the
    // gap between the receptionist and the guest, hiding neither)
    walk: { to: [0.6, -3.4], looks: [[-5.3, -5.75], [0.7, -5.15]], pause: 1, start: 0.08 },
  },
  {
    // upright on the sofa's left-hand seat (cushion 0.43 m), back near the
    // backrest, both feet planted between the sofa and the drum table (the
    // seated clip keeps them 0.32-0.43 m in front of the hips)
    id: "lounge",
    pos: [2.85, -0.005, -5.3],
    look: [2.85, -3.0],
    env: "a",
    at: 4,
    first: true,
    shadows: [
      [2.85, 0.43, -5.3, 0.5, 0.45, 0.45],
      [2.85, 0.012, -4.9, 0.45, 0.3, 0.5],
    ],
  },
  // the textile wall: two visitors either side of the canvas, a step back; she
  // photographs it on her phone
  { id: "textile", pos: [10.6, 0, -3.9], look: [9.3, -5.7], env: "a", at: 4.5 },
  { id: "elder", pos: [7.3, 0, -3.95], look: [8.5, -5.7], env: "a", at: 0 },
  // a visitor wandering past them, from the porcelain horse to the pier and back
  // (a metre clear of the walk and of them; neither end in a view of a work)
  {
    id: "textile_walker",
    pos: [6.4, 0, -2.7],
    look: [11.2, -2.9],
    env: "a",
    at: 0,
    walk: { to: [11.2, -2.9], looks: [[5.3, -4.6], [13.1, -5.65]], pause: 1, start: 0.6 },
  },
  // the gallery room, the bust in its middle: a couple face to face right of the
  // monumental canvas, talking it over, and three guests over drinks in the far
  // left corner, beyond the left wall's pair (both seen as you come in, either
  // side of the canvas)
  { id: "cardigan", pos: [17.15, 0, -14.95], look: [17.85, -15.3], env: "a", at: 2 },
  { id: "blazer", pos: [17.85, 0, -15.3], look: [17.15, -14.95], env: "a", at: 9 },
  {
    id: "room_wine",
    pos: [12.65, 0, -15.15],
    look: [13.05, -15.12],
    env: "a",
    at: 4,
    acts: [
      ["f_drink_idle", 1],
      ["f_drink_drinking", 1],
    ],
  },
  { id: "room_talk", pos: [13.35, 0, -15.45], look: [13.05, -15.12], env: "a", at: 11 },
  {
    id: "room_drink",
    pos: [13.15, 0, -14.75],
    look: [13.05, -15.12],
    env: "a",
    at: 1,
    acts: [
      ["m_drink_idle", 2],
      ["m_drink_drinking", 1],
    ],
  },
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
  // with a glass of wine: holds it a while, then sips
  {
    id: "hall",
    pos: [25.6, 0.031, 0.35],
    look: [25.0, -1.0],
    env: "b",
    at: 3,
    acts: [
      ["f_drink_idle", 1],
      ["f_drink_drinking", 1],
    ],
  },
  // a couple chatting at the foot of the stairs, he with a glass of wine
  {
    id: "hall_wine",
    pos: [26.51, 0.031, 6.48],
    look: [27.13, 7.0],
    env: "b",
    at: 8,
    acts: [
      ["m_drink_idle", 1],
      ["m_drink_drinking", 1],
    ],
  },
  { id: "hall_talk", pos: [27.13, 0.031, 7.0], look: [26.51, 6.48], env: "b", at: 2 },
  // a visitor climbing to the roof: along the first flight (beside the one
  // sitting on it), across the landing, up the second flight, a look round the
  // rooftop hall, and back down; the treads' middles taken as a slope (frame B
  // u 13.9 to 18, from 0.03 to 3.95 m up)
  {
    id: "climber",
    pos: [27.06, 0.031, 2.57],
    look: [27.93, 3.23],
    env: "b",
    at: 0,
    walk: {
      path: [
        [27.93, 0.031, 3.23],
        [29.54, 1.383, 4.58],
        [29.99, 1.58, 4.83],
        [30.07, 1.58, 5.35],
        [29.88, 1.778, 5.58],
        [27.76, 3.95, 8.11],
        [27.31, 3.95, 8.65],
      ],
      looks: [
        [27.17, 1.35],
        [22.3, 2.16],
      ],
      pause: 1,
      start: 0.0,
    },
  },
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
  // out on the terrace beyond the glass, strolling along the parapet (frame B
  // u 6.5 to 13, v -6.6) and stopping at each end to look out over the city:
  // seen through the glass, never in front of a work
  {
    id: "walker",
    pos: [14.735, 3.95, 5.736],
    look: [19.714, 9.915],
    env: "c",
    light: 0.6,
    at: 0,
    walk: { to: [19.714, 9.915], looks: [[11.26, 9.87], [16.24, 14.05]], pause: 1, start: 0.3 },
  },
  // one behind the second freestanding wall, beside "Bronze Hour" on the long wall, on the phone
  { id: "bronze", pos: [24.92, 3.95, 1.22], look: [25.26, -1.36], env: "c", at: 7 },
  // a couple to the left of the monumental canvas on the end wall: she talks, he has a glass of wine
  { id: "gilded_f", pos: [13.4, 3.95, -1.39], look: [13.04, -4.3], env: "c", at: 20 },
  {
    id: "gilded_m",
    pos: [12.38, 3.95, -1.34],
    look: [13.17, -4.46],
    env: "c",
    at: 5,
    acts: [
      ["m_drink_idle", 1],
      ["m_drink_drinking", 1],
    ],
  },
  // three guests over drinks in the middle of the hall, between "Bronze Hour"'s
  // visitor and the whale: one sips her wine, one talks, one listens
  {
    id: "roof_wine",
    pos: [24.04, 3.95, 3.02],
    look: [24.56, 3.21],
    env: "c",
    at: 14,
    acts: [
      ["f_drink_idle", 1],
      ["f_drink_drinking", 1],
    ],
  },
  { id: "roof_suit", pos: [24.65, 3.95, 3.75], look: [24.56, 3.21], env: "c", at: 6 },
  { id: "roof_listen", pos: [24.98, 3.95, 2.86], look: [24.56, 3.21], env: "c", at: 3 },
  // two more join them, one with a glass of wine
  {
    id: "roof_party_m",
    pos: [24.42, 3.95, 2.37],
    look: [24.56, 3.21],
    env: "c",
    at: 9,
    acts: [
      ["m_drink_idle", 2],
      ["m_drink_drinking", 1],
    ],
  },
  { id: "roof_party_f", pos: [25.36, 3.95, 3.5], look: [24.56, 3.21], env: "c", at: 16 },
  // one photographing the stone figure at the hall's west end
  { id: "roof_photo", pos: [18.13, 3.95, -1.73], look: [17.3, -3.08], env: "c", at: 2 },
  // out on the terrace, a couple with drinks at the parapet's east end, the city
  // behind them (seen through the glass as the walk comes up the stairs)
  {
    id: "terrace_wine",
    pos: [20.43, 3.95, 11.56],
    look: [20.64, 12.39],
    env: "c",
    light: 0.6,
    at: 5,
    acts: [
      ["f_drink_idle", 1],
      ["f_drink_drinking", 1],
    ],
  },
  {
    id: "terrace_toast",
    pos: [20.64, 3.95, 12.39],
    look: [20.43, 11.56],
    env: "c",
    light: 0.6,
    at: 12,
    acts: [
      ["m_drink_idle", 1],
      ["m_drink_drinking", 1],
    ],
  },
  // one exploring along the long wall, from its first work to "Ziggurat"
  {
    id: "roof_explorer",
    pos: [18.69, 3.95, -3.48],
    look: [21.05, -1.63],
    env: "c",
    at: 0,
    walk: { to: [21.05, -1.63], looks: [[18.75, -6.83], [21.57, 0.31]], pause: 1, start: 0.5 },
  },
];

/** Every point of floor a visitor stands on or walks over, a step apart (for keeping the camera clear). */
export const FOOTPRINTS = PEOPLE.flatMap(({ pos, walk }) => {
  if (!walk) return [pos];
  const points = [pos, ...(walk.path ?? [[walk.to[0], pos[1], walk.to[1]]])];
  return points.slice(1).flatMap((b, k) => {
    const a = points[k];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.5));
    return Array.from({ length: steps + 1 }, (_, i) => a.map((c, j) => c + ((b[j] - c) * i) / steps));
  });
});

/** Radius of floor each figure takes up, for keeping the camera clear. */
export const PERSON_RADIUS = 0.45;
