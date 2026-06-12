import pygame
import pymunk
import math
import random
import sys

# Configuration
WIDTH, HEIGHT = 720, 1280
FPS = 60
DURATION = 5000  # 5 seconds
TRIANGLE_RADIUS = 300
SPHERE_RADIUS = 20
COLLISION_SOUND_FILE = 'collision.wav'

class Simulation:
    def __init__(self):
        pygame.init()
        try
            pygame.mixer.init()
        except:
            pass
        
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("Neon Physics")
        self.clock = pygame.time.Clock()
        self.start_ticks = pygame.time.get_ticks()
        
        self.space = pymunk.Space()
        self.space.gravity = (0, 0)
        
        try
            self.collision_sound = pygame.mixer.Sound(COLLISION_SOUND_FILE)
        except:
            self.collision_sound = None

        self.spheres = []  # List of (body, shape)
        self.sphere_shapes = set() # To identify spheres in collision
        self.pending_clones = []
        
        self.angle = 0
        self.rotation_speed = 0.02
        
        # Initial Triangle Setup
        self.walls = []
        self.setup_triangle()
        
        # Initial Sphere
        self.create_sphere(WIDTH // 2, HEIGHT // 2)

        # Collision Handler setup as per requirement
        # We use collision_type 0 for everything to satisfy the specific instruction
        self.space.on_collision(0, 0, begin=self.collision_on_begin)

    def setup_triangle(self):
        # Remove old walls from space
        for wall in self.walls:
            self.space.remove(wall)
        self.walls = []

        center = (WIDTH // 2, HEIGHT // 2)
        points = []
        for i in range(3):
            theta = self.angle + i * (2 * math.pi / 3)
            x = center[0] + TRIANGLE_RADIUS * math.cos(theta)
            y = center[1] + TRIANGLE_RADIUS * math.sin(theta)
            points.append((x, y))

        # Create segments for the triangle boundary
        for i in range(3):
            p1 = points[i]
            p2 = points[(i + 1) % 3]
            # Attach to static_body as per requirement
            segment = pymunk.Segment(self.space.static_body, p1, p2, 5)
            segment.elasticity = 1.0
            segment.friction = 0.0
            segment.collision_type = 0
            self.space.add(segment)
            self.walls.append(segment)

    def create_sphere(self, x, y):
        mass = 1
        moment = pymunk.moment_for_circle(mass, 0, SPHERE_RADIUS)
        body = pymunk.Body(mass, moment)
        body.position = (x, y)
        shape = pymunk.Circle(body, SPHERE_RADIUS)
        shape.elasticity = 1.0
        shape.friction = 0.0
        shape.collision_type = 0
        self.space.add(body, shape)
        self.spheres.append((body, shape))
        self.sphere_shapes.add(shape)
        # Give initial random velocity
        body.velocity = (random.uniform(-200, 200), random.uniform(-200, 200))

    def collision_on_begin(self, arbiter, space):
        # Play sound
        if self.collision_sound:
            self.collision_sound.play()
        
        # Identify if a sphere was involved to trigger cloning
        for shape in arbiter.shapes:
            if shape in self.sphere_shapes:
                # Store parameters for cloning in the next update step
                # We clone the body's properties (position/velocity) but randomize slightly
                body = shape.body
                self.pending_clones.append((body.position.x, body.position.y, body.velocity.x, body.velocity.y))
        return True

    def update(self):
        # Check for exit condition
        if pygame.time.get_ticks() - self.start_ticks > DURATION:
            pygame.quit()
            sys.exit()

        # Update rotation
        self.angle += self.rotation_speed
        self.setup_triangle()

        # Handle pending clones
        for pos_x, pos_y, vel_x, vel_y in self.pending_clones:
            self.create_sphere(pos_x, pos_y)
        self.pending_clones = []

        # Step physics
        dt = 1.0 / FPS
        self.space.step(dt)

    def draw(self):
        self.screen.fill((5, 5, 15)) # Dark background
        
        # Draw Triangle Walls (Neon White/Blue)
        for wall in self.walls:
            p1 = wall.a
            p2 = wall.b
            pygame.draw.line(self.screen, (0, 200, 255), p1, p2, 5)

        # Draw Spheres (Neon Blue with Glow)
        for body, shape in self.spheres:
            pos = (int(body.position.x), int(body.position.y))
            
            # Glow effect: multiple layers of semi-transparent circles
            for radius_offset in range(1, 6):
                glow_radius = SPHERE_RADIUS + radius_offset * 3
                glow_surf = pygame.Surface((glow_radius * 2, glow_radius * 2), pygame.SRCALPHA)
                pygame.draw.circle(glow_surf, (0, 150, 255, 50), (glow_radius, glow_radius), glow_radius)
                self.screen.blit(glow_surf, (pos[0] - glow_radius, pos[1] - glow_radius))

            # Core sphere
            pygame.draw.circle(self.screen, (0, 255, 255), pos, SPHERE_RADIUS)
            pygame.draw.circle(self.screen, (255, 255, 255), pos, SPHERE_RADIUS, 2)

        pygame.display.flip()

    def run(self):
        running = True
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False

            self.update()
            self.draw()
            self.clock.tick(FPS)

if __name__ == "__main__":
    sim = Simulation()
    sim.run()