// Hand-held props for the visitors, built in three.js and fixed to a hand bone
// by bake.html, so they travel inside the visitor's glTF. Each is placed by
// where the hands are at one moment of the clip (`at`, a fraction of it): a
// wine glass upright in the curl of the right hand's fingers; a phone along the
// right hand's fingers (at the ear, for a call); a phone held landscape between
// both hands (for a photo). From then on it moves with the hand.
import * as THREE from "three";

function wineGlass() {
  const g = new THREE.Group();
  // (profile from the foot up: radius, height, in metres)
  const outline = [[0.034, 0], [0.034, 0.003], [0.006, 0.008], [0.0035, 0.02], [0.0035, 0.09], [0.012, 0.098], [0.033, 0.12],
    [0.041, 0.15], [0.039, 0.185], [0.034, 0.21]];
  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(outline.map(([r, y]) => new THREE.Vector2(r, y)), 24),
    new THREE.MeshStandardMaterial({ name: "prop_glass", color: "#eef3f2", roughness: 0.08, metalness: 0, transparent: true, opacity: 0.32,
      side: THREE.DoubleSide, depthWrite: false }),
  );
  const wine = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0.101], [0.011, 0.101], [0.031, 0.122], [0.037, 0.145], [0, 0.145]].map(([r, y]) => new THREE.Vector2(r, y)), 24),
    new THREE.MeshStandardMaterial({ name: "prop_wine", color: "#4a0b16", roughness: 0.15, metalness: 0 }),
  );
  g.add(wine, glass);
  return g;
}

function phone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.072, 0.148, 0.008),
    new THREE.MeshStandardMaterial({ name: "prop_phone", color: "#16161a", roughness: 0.3, metalness: 0.4 }),
  );
  g.add(body);
  return g;
}

const point = (bone) => bone.getWorldPosition(new THREE.Vector3());
const mid = (...v) => v.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(v.length);

/** Where in the hand the prop is held, and how it is turned, in world space. */
function placement(kind, bones) {
  const f = (side, n) => point(bones(`Bip01_${side}_Finger${n}`));
  const hand = (side) => point(bones(`Bip01_${side}_Hand`));
  // the curl of the fingers: between the thumb's and the first fingers' middle joints
  const grip = (side) => mid(f(side, "01"), f(side, "11"), f(side, "21"));
  const m = new THREE.Matrix4();
  if (kind === "glass") {
    // upright, held by the bowl
    const at = grip("R").add(new THREE.Vector3(0, -0.13, 0));
    return m.makeTranslation(at.x, at.y, at.z);
  }
  if (kind === "phone") {
    // along the fingers, its screen to the palm
    const along = f("R", "2").sub(hand("R")).normalize();
    const across = f("R", "1").sub(f("R", "4")).normalize();
    const face = new THREE.Vector3().crossVectors(along, across).normalize();
    const side = new THREE.Vector3().crossVectors(along, face).normalize();
    m.makeBasis(side, along, face);
    const at = grip("R");
    return m.setPosition(at.x, at.y, at.z);
  }
  if (kind === "camera") {
    // landscape between the hands, its screen to the face
    const left = grip("L"), right = grip("R");
    const across = left.clone().sub(right).normalize();
    const face = new THREE.Vector3().crossVectors(across, new THREE.Vector3(0, 1, 0)).normalize();
    // (the long side, y, between the hands)
    m.makeBasis(new THREE.Vector3().crossVectors(across, face), across, face);
    const at = mid(left, right);
    return m.setPosition(at.x, at.y, at.z);
  }
  throw new Error(`unknown prop ${kind}`);
}

/**
 * Builds the prop and fixes it to the right hand, placed as the hands are at
 * fraction `at` of the clip (the mixer is left at that moment).
 */
export function attachProp(kind, person, mixer, clip, at) {
  mixer.setTime(clip.duration * at);
  person.updateMatrixWorld(true);
  const bones = (n) => {
    let b;
    person.traverse((o) => {
      if (!b && o.name === n) b = o;
    });
    if (!b) throw new Error(`no bone ${n}`);
    return b;
  };
  const prop = kind === "glass" ? wineGlass() : phone();
  prop.name = `prop_${kind}`;
  const hand = bones("Bip01_R_Hand");
  // the hand's frame is in centimetres (the avatar is scaled 0.01): the prop's
  // transform is the world placement expressed in it
  const local = hand.matrixWorld.clone().invert().multiply(placement(kind, bones));
  local.decompose(prop.position, prop.quaternion, prop.scale);
  hand.add(prop);
  return prop;
}
