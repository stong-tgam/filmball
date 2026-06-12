"""
Fixed simulation engine for ball-bounce physics videos.
Reads a scene config (JSON dict) and renders the simulation.
No LLM-generated code — this is deterministic, tested once.
"""

import pygame
import pymunk
import math
import random
import sys
import os
import json

WIDTH, HEIGHT = 720, 1280
FPS = 60
CENTER = (WIDTH // 2, HEIGHT // 2)

SHAPE_SIDES = {
    "triangle": 3,
    "square": 4,
    "pentagon": 5,
    "hexagon": 6,
    "octagon": 8,
}


def _int_pos(p):
    return (int(p[0]), int(p[1]))


def polygon_vertices(sides, radius, center, angle_offset=0):
    verts = []
    for i in range(sides):
        a = angle_offset + i * (2 * math.pi / sides) - math.pi / 2
        verts.append((center[0] + radius * math.cos(a),
                      center[1] + radius * math.sin(a)))
    return verts


def star_vertices(points, outer_r, inner_r, center, angle_offset=0):
    verts = []
    for i in range(points * 2):
        a = angle_offset + i * math.pi / points - math.pi / 2
        r = outer_r if i % 2 == 0 else inner_r
        verts.append((center[0] + r * math.cos(a),
                      center[1] + r * math.sin(a)))
    return verts


def container_vertices(shape, radius, center, angle=0):
    if shape == "circle":
        return polygon_vertices(64, radius, center, angle)
    elif shape == "star":
        return star_vertices(5, radius, radius * 0.4, center, angle)
    elif shape == "rectangle":
        w, h = radius * 1.2, radius * 0.8
        corners = [(-w, -h), (w, -h), (w, h), (-w, h)]
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        return [(center[0] + x * cos_a - y * sin_a,
                 center[1] + x * sin_a + y * cos_a) for x, y in corners]
    elif shape in SHAPE_SIDES:
        return polygon_vertices(SHAPE_SIDES[shape], radius, center, angle)
    else:
        return polygon_vertices(6, radius, center, angle)


class SimulationEngine:
    def __init__(self, scene, duration):
        pygame.init()
        try:
            pygame.mixer.init()
        except Exception:
            pass

        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("Filmball")
        self.clock = pygame.time.Clock()
        self.duration = duration
        self.frame_count = 0

        # Parse scene config
        cont = scene.get("container", {})
        ball_cfg = scene.get("balls", {})
        phys = scene.get("physics", {})
        rules = scene.get("rules", {})

        self.bg_color = tuple(scene.get("background_color", [5, 5, 15]))

        # Container
        self.cont_shape = cont.get("shape", "circle")
        self.cont_radius = cont.get("radius", 300)
        self.cont_rotation = cont.get("rotation_speed", 0)
        self.cont_color = tuple(cont.get("color", [0, 200, 255]))
        self.cont_thickness = cont.get("thickness", 3)
        self.cont_glow = cont.get("glow", False)
        self.cont_angle = 0

        # Balls
        self.ball_radius = ball_cfg.get("radius", 20)
        self.ball_color = tuple(ball_cfg.get("color", [0, 255, 255]))
        self.ball_glow = ball_cfg.get("glow", True)
        self.ball_speed = ball_cfg.get("speed", 300)
        self.ball_count = ball_cfg.get("count", 1)

        # Physics
        self.space = pymunk.Space()
        self.space.gravity = tuple(phys.get("gravity", [0, 0]))
        self.elasticity = phys.get("elasticity", 1.0)

        # Rules
        self.collision_rule = rules.get("on_collision", "none")
        self.max_balls = rules.get("max_balls", 50)

        # Sound
        self.sound = None
        if os.path.exists("collision.wav"):
            try:
                self.sound = pygame.mixer.Sound("collision.wav")
            except Exception:
                pass

        # State
        self.walls = []
        self.balls = []       # list of (body, shape, color)
        self.ball_shapes = set()
        self.spawn_queue = []

        # Build container walls
        self._build_walls()

        # Pre-render ball glow sprite
        if self.ball_glow:
            gr = self.ball_radius * 4
            self._glow_r = gr
            self._glow_template = pygame.Surface((gr * 2, gr * 2), pygame.SRCALPHA)
            for r in range(gr, 0, -1):
                a = int(60 * (1 - r / gr) ** 1.5)
                pygame.draw.circle(self._glow_template,
                                   (255, 255, 255, min(255, a)), (gr, gr), r)
            self._glow_scratch = pygame.Surface((gr * 2, gr * 2), pygame.SRCALPHA)

        # Spawn initial balls
        for _ in range(self.ball_count):
            self._spawn_ball(CENTER)

        # Collision handlers — type 1 = wall, type 2 = ball
        self.space.on_collision(2, 1, begin=self._on_ball_wall)
        self.space.on_collision(2, 2, begin=self._on_ball_ball)

    # ── Physics setup ──────────────────────────────────────────────────────

    def _build_walls(self):
        for seg in self.walls:
            self.space.remove(seg)
        self.walls = []

        verts = container_vertices(self.cont_shape, self.cont_radius,
                                   CENTER, self.cont_angle)
        for i in range(len(verts)):
            p1 = verts[i]
            p2 = verts[(i + 1) % len(verts)]
            seg = pymunk.Segment(self.space.static_body, p1, p2,
                                 self.cont_thickness)
            seg.elasticity = self.elasticity
            seg.friction = 0.0
            seg.collision_type = 1
            self.space.add(seg)
            self.walls.append(seg)

    def _spawn_ball(self, pos, color=None):
        if len(self.balls) >= self.max_balls:
            return
        mass = 1
        moment = pymunk.moment_for_circle(mass, 0, self.ball_radius)
        body = pymunk.Body(mass, moment)
        body.position = pos
        angle = random.uniform(0, 2 * math.pi)
        body.velocity = (self.ball_speed * math.cos(angle),
                         self.ball_speed * math.sin(angle))
        shape = pymunk.Circle(body, self.ball_radius)
        shape.elasticity = self.elasticity
        shape.friction = 0.0
        shape.collision_type = 2
        self.space.add(body, shape)
        c = tuple(color) if color else self.ball_color
        self.balls.append((body, shape, c))
        self.ball_shapes.add(shape)

    # ── Collision callbacks ────────────────────────────────────────────────

    def _on_ball_wall(self, arbiter, space, data):
        if self.sound:
            self.sound.play()

        if self.collision_rule == "spawn_ball":
            for s in arbiter.shapes:
                if s in self.ball_shapes:
                    p = s.body.position
                    self.spawn_queue.append(((p.x, p.y), None))
                    break

        elif self.collision_rule == "change_color":
            for s in arbiter.shapes:
                if s in self.ball_shapes:
                    new_c = (random.randint(100, 255),
                             random.randint(100, 255),
                             random.randint(100, 255))
                    for i, (b, sh, c) in enumerate(self.balls):
                        if sh is s:
                            self.balls[i] = (b, sh, new_c)
                            break
                    break

        elif self.collision_rule == "increase_speed":
            for s in arbiter.shapes:
                if s in self.ball_shapes:
                    vx, vy = s.body.velocity
                    if math.hypot(vx, vy) < 1000:
                        s.body.velocity = (vx * 1.05, vy * 1.05)
                    break

        return True

    def _on_ball_ball(self, arbiter, space, data):
        if self.sound:
            self.sound.play()
        return True

    # ── Update ─────────────────────────────────────────────────────────────

    def _update(self):
        if self.cont_rotation != 0:
            self.cont_angle += self.cont_rotation
            self._build_walls()

        for pos, color in self.spawn_queue:
            self._spawn_ball(pos, color)
        self.spawn_queue = []

        self.space.step(1.0 / FPS)

        # Cull balls that escaped the container
        keep = []
        for b, s, c in self.balls:
            bx, by = b.position
            if -200 < bx < WIDTH + 200 and -200 < by < HEIGHT + 200:
                keep.append((b, s, c))
            else:
                self.ball_shapes.discard(s)
                self.space.remove(b, s)
        self.balls = keep

    # ── Draw ───────────────────────────────────────────────────────────────

    def _draw(self):
        self.screen.fill(self.bg_color)

        # Container
        verts = container_vertices(self.cont_shape, self.cont_radius,
                                   CENTER, self.cont_angle)

        # Container glow (thicker dim lines behind the main lines)
        if self.cont_glow:
            gc1 = tuple(c // 4 for c in self.cont_color)
            gc2 = tuple(c // 2 for c in self.cont_color)
            for i in range(len(verts)):
                p1 = _int_pos(verts[i])
                p2 = _int_pos(verts[(i + 1) % len(verts)])
                pygame.draw.line(self.screen, gc1, p1, p2,
                                 self.cont_thickness * 2 + 12)
            for i in range(len(verts)):
                p1 = _int_pos(verts[i])
                p2 = _int_pos(verts[(i + 1) % len(verts)])
                pygame.draw.line(self.screen, gc2, p1, p2,
                                 self.cont_thickness * 2 + 6)

        # Container main lines
        for i in range(len(verts)):
            p1 = _int_pos(verts[i])
            p2 = _int_pos(verts[(i + 1) % len(verts)])
            pygame.draw.line(self.screen, self.cont_color, p1, p2,
                             self.cont_thickness * 2)

        # Balls
        for body, shape, color in self.balls:
            pos = _int_pos(body.position)

            # Glow
            if self.ball_glow:
                gr = self._glow_r
                self._glow_scratch.fill((0, 0, 0, 0))
                self._glow_scratch.blit(self._glow_template, (0, 0))
                self._glow_scratch.fill((*color, 255),
                                        special_flags=pygame.BLEND_RGBA_MULT)
                self.screen.blit(self._glow_scratch,
                                 (pos[0] - gr, pos[1] - gr),
                                 special_flags=pygame.BLEND_ADD)

            # Core circle
            pygame.draw.circle(self.screen, color, pos, self.ball_radius)
            # Bright center highlight
            bright = tuple(min(255, c + 80) for c in color)
            pygame.draw.circle(self.screen, bright, pos,
                               max(1, self.ball_radius // 3))

        pygame.display.flip()

    # ── Main loop ──────────────────────────────────────────────────────────

    def run(self):
        total_frames = self.duration * FPS
        running = True

        while running and self.frame_count < total_frames:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False

            if running:
                self._update()
                self._draw()
                self.clock.tick(FPS)
                self.frame_count += 1

        pygame.quit()


# ── Standalone entry point ─────────────────────────────────────────────────────

def load_scene(path):
    with open(path) as f:
        return json.load(f)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python simulation_engine.py <scene.json> [duration_seconds]")
        sys.exit(1)
    scene = load_scene(sys.argv[1])
    dur = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    engine = SimulationEngine(scene, dur)
    engine.run()
