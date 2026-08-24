/**
 * Standing on the tile, looking around.
 *
 * There is no map here at all - not even the hidden one the 2D board drew. You are on
 * a hex, at eye height, and you can see the ground you are on, whatever is next to it,
 * and past that a drop into nothing. If the party wants a map they have to build it in
 * their notebooks out of what they can see and what they tell each other.
 *
 * **This is an MVP for validating the idea, not the finished look.** Everything is
 * boxes and cones in flat colours. The art direction (`docs/art-direction.md`) has not
 * been applied and should not be until the view itself is known to be fun.
 *
 * Two things here are not cosmetic and should survive any visual rework:
 *
 * - **The compass.** First person without one makes the table talk useless: "there's a
 *   river to my left" means nothing to anyone else. North is fixed and always shown.
 * - **The cliff.** The board's rim has to read as an edge of the world, or players walk
 *   into it repeatedly and think the game is broken.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { DIRS, add, hexToPixel, inBoard, key, neighbours } from "../game/hex";
import { canSee } from "../game/vision";
import type { Enemy, Hazard, Player, Tile } from "../game/types";

/** World units across a hex. Big enough that a tile feels like a place to stand in. */
const SIZE = 10;
const EYE = 3.4;
/** How far the rim of the board falls away. Deep enough to read as "do not step off". */
const CLIFF = 15;

const GROUND: Record<string, number> = {
  field: 0xc8a86a,
  forest: 0x4a7c3f,
  city: 0x9a9188,
  water: 0x2f6fb5,
};

const world = (h: { q: number; r: number }) => {
  const p = hexToPixel(h, SIZE);
  return new THREE.Vector3(p.x, 0, p.y);
};

/** A flat-lying hexagon of the given radius, as a shape we can extrude downward. */
function hexShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

type Props = {
  tiles: Record<string, Tile>;
  viewer: Player;
  players: Player[];
  enemies: Enemy[];
  hazards: Hazard[];
  /** Tile label to the number of steps it takes to get there. */
  legalMoves: Map<string, number>;
  onMove: (label: string) => void;
};

export default function FirstPerson({
  tiles,
  viewer,
  players,
  enemies,
  hazards,
  legalMoves,
  onMove,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  // The look direction survives a re-render: rebuilding the scene every time somebody
  // eats an apple should not spin the camera back to north.
  const look = useRef({ yaw: 0, pitch: -0.34 });
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x11141c);
    scene.fog = new THREE.Fog(0x11141c, SIZE * 3, SIZE * 13);

    const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x2a2418, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(30, 60, 20);
    scene.add(sun);

    // The floor of the world, a long way down. Without something to see at the bottom
    // the rim reads as "the lights are off over there" rather than "do not step off".
    const abyss = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE * 40, SIZE * 40),
      new THREE.MeshLambertMaterial({ color: 0x39445c }),
    );
    abyss.rotation.x = -Math.PI / 2;
    abyss.position.y = -CLIFF;
    scene.add(abyss);

    const here = world(viewer.hex);
    camera.position.set(here.x, EYE, here.z);

    /** Tiles the player can see, plus the ring past them so the drop has a lip. */
    const inSight = Object.values(tiles).filter((t) => canSee(viewer, t.hex));
    const clickable: THREE.Mesh[] = [];

    for (const tile of inSight) {
      const centre = world(tile.hex);
      const onRim = neighbours(tile.hex).some((n) => !inBoard(n));
      const depth = onRim ? CLIFF : 1.2;

      const geometry = new THREE.ExtrudeGeometry(hexShape(SIZE * 0.98), {
        depth,
        bevelEnabled: false,
      });
      // Extrude builds along +z; lay it flat with the top face at y = 0.
      geometry.rotateX(Math.PI / 2);
      const label = key(tile.hex);
      const legal = legalMoves.has(label);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshLambertMaterial({
          color: GROUND[tile.base] ?? 0x777777,
          emissive: legal ? 0x1a2a12 : 0x000000,
        }),
      );
      mesh.position.set(centre.x, 0, centre.z);
      mesh.userData = { label, legal };
      scene.add(mesh);

      // A pale lip along any edge with nothing beyond it. From on top of a tile you
      // cannot see your own cliff face, so without this the end of the world looks
      // like unlit ground and players walk at it over and over.
      if (onRim) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(SIZE * 0.99, 0.35, 6, 6),
          new THREE.MeshLambertMaterial({ color: 0xcfd6e6, emissive: 0x2a3040 }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = Math.PI / 6;
        ring.position.set(centre.x, 0.3, centre.z);
        scene.add(ring);
      }
      if (legal) {
        clickable.push(mesh);
        // Where you may walk, marked on the ground. Without this a child cannot tell
        // which shape in front of them is a step and which is scenery, and hunting for
        // the tappable spot is the fastest way to kill the idea.
        const step = new THREE.Mesh(
          new THREE.TorusGeometry(SIZE * 0.6, 0.55, 8, 28),
          new THREE.MeshLambertMaterial({ color: 0xf2b705, emissive: 0x6b5102 }),
        );
        step.rotation.x = -Math.PI / 2;
        step.position.set(centre.x, 0.4, centre.z);
        scene.add(step);
      }

      // Water sits in the tile rather than under it: a slab a little below the grass.
      if (tile.river) {
        const river = new THREE.Mesh(
          new THREE.BoxGeometry(SIZE * 1.6, 0.4, SIZE * 0.55),
          new THREE.MeshLambertMaterial({ color: GROUND.water }),
        );
        river.position.set(centre.x, 0.15, centre.z);
        river.rotation.y = Math.PI / 6;
        scene.add(river);
      }

      if (tile.rail) {
        for (let i = -3; i <= 3; i++) {
          const sleeper = new THREE.Mesh(
            new THREE.BoxGeometry(SIZE * 0.5, 0.3, 0.9),
            new THREE.MeshLambertMaterial({ color: 0x3a3128 }),
          );
          sleeper.position.set(centre.x + i * 2.2, 0.2, centre.z);
          scene.add(sleeper);
        }
      }

      // Something to look at, so one tile is distinguishable from the next. Placed off
      // a hash of the label rather than at random, or the scenery would jump about
      // every time the component rebuilt.
      const spots = 4;
      for (let i = 0; i < spots; i++) {
        const a = ((label.charCodeAt(0) * 7 + label.charCodeAt(1) * 13 + i * 97) % 360) * (Math.PI / 180);
        const d = SIZE * (0.25 + ((i * 37) % 40) / 100);
        const x = centre.x + Math.cos(a) * d;
        const z = centre.z + Math.sin(a) * d;

        if (tile.base === "forest") {
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.28, 0.36, 2.2, 6),
            new THREE.MeshLambertMaterial({ color: 0x6b4a2a }),
          );
          trunk.position.set(x, 1.1, z);
          const crown = new THREE.Mesh(
            new THREE.ConeGeometry(1.5, 3.6, 7),
            new THREE.MeshLambertMaterial({ color: 0x2f6b2a }),
          );
          crown.position.set(x, 3.6, z);
          scene.add(trunk, crown);
        } else if (tile.base === "city" && i < 3) {
          const wall = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 2.4, 2.6),
            new THREE.MeshLambertMaterial({ color: 0xd8cdb8 }),
          );
          wall.position.set(x, 1.2, z);
          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(2.1, 1.6, 4),
            new THREE.MeshLambertMaterial({ color: 0xa33f3f }),
          );
          roof.position.set(x, 3.2, z);
          roof.rotation.y = Math.PI / 4;
          scene.add(wall, roof);
        } else if (tile.base === "field" && i < 2) {
          const crop = new THREE.Mesh(
            new THREE.BoxGeometry(SIZE * 0.7, 0.25, 0.5),
            new THREE.MeshLambertMaterial({ color: 0xa8863f }),
          );
          crop.position.set(x, 0.15, z);
          crop.rotation.y = 0.4;
          scene.add(crop);
        }
      }
    }

    /** A person or a thing standing on a tile: a coloured post, MVP-style. */
    const post = (at: { q: number; r: number }, colour: number, height: number) => {
      const p = world(at);
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, height, 8),
        new THREE.MeshLambertMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.25 }),
      );
      mesh.position.set(p.x, height / 2, p.z);
      scene.add(mesh);
    };

    for (const other of players) {
      if (other.id === viewer.id || other.dead) continue;
      if (canSee(viewer, other.hex)) post(other.hex, 0x8fd3ff, 3.4);
    }
    // Hazards are visible from anywhere - that rule holds here too, but a hazard you
    // cannot see from the ground is no use, so only the ones in sight get a marker.
    for (const hazard of hazards) {
      if (canSee(viewer, hazard.hex)) post(hazard.hex, 0xf2b705, 4.2);
    }
    for (const enemy of enemies) {
      if (!enemy.defeated && enemy.found && canSee(viewer, enemy.hex)) {
        post(enemy.hex, 0xd64545, 3.8);
      }
    }

    // ------------------------------------------------------------ interaction

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const aim = () => {
      const { yaw, pitch } = look.current;
      camera.rotation.set(0, 0, 0);
      camera.rotateY(yaw);
      camera.rotateX(pitch);
    };

    let dragging = false;
    let dragged = 0;
    let last = { x: 0, y: 0 };

    const down = (e: PointerEvent) => {
      dragging = true;
      dragged = 0;
      last = { x: e.clientX, y: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      dragged += Math.abs(dx) + Math.abs(dy);
      last = { x: e.clientX, y: e.clientY };
      look.current.yaw -= dx * 0.005;
      look.current.pitch = Math.max(-0.9, Math.min(0.5, look.current.pitch - dy * 0.004));
      aim();
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      // A tap, not a drag: see whether it landed on somewhere we may walk to.
      if (dragged > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const caster = new THREE.Raycaster();
      caster.setFromCamera(pointer, camera);
      const hit = caster.intersectObjects(clickable)[0];
      if (hit) moveRef.current(hit.object.userData.label as string);
    };

    const el = renderer.domElement;
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);

    aim();
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      renderer.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      mount.removeChild(el);
    };
  }, [tiles, viewer, players, enemies, hazards, legalMoves]);

  return (
    <div className="fp">
      <div className="fp-canvas" ref={host} />
      <Compass look={look} />
      <p className="fp-hint">
        Drag to look around. Tap the ground ahead to walk there.
      </p>
    </div>
  );
}

/**
 * Which way you are facing.
 *
 * Not decoration. Four people describing what they can see to each other need a shared
 * direction or none of it means anything, and the tile labels are no help when you
 * cannot see them.
 */
function Compass({ look }: { look: React.MutableRefObject<{ yaw: number; pitch: number }> }) {
  const needle = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const spin = () => {
      frame = requestAnimationFrame(spin);
      if (needle.current) {
        const deg = (look.current.yaw * 180) / Math.PI;
        needle.current.style.transform = `rotate(${deg}deg)`;
        const letter = needle.current.firstElementChild as HTMLElement | null;
        if (letter) letter.style.transform = `rotate(${-deg}deg)`;
      }
    };
    spin();
    return () => cancelAnimationFrame(frame);
  }, [look]);

  return (
    <div className="fp-compass" aria-hidden="true">
      <div className="fp-needle" ref={needle}>
        <span className="fp-n">N</span>
      </div>
    </div>
  );
}

/** Kept so the six directions have names the table can say out loud. */
export const DIRECTION_NAMES = DIRS.map((_, i) => ["E", "NE", "NW", "W", "SW", "SE"][i]);
export const stepTo = add;
