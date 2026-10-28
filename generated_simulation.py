import pygame
import pymunk
import math
import sys
import time

class Simulation:
    def __init__(self):
        pygame.init()
        pygame.mixer.init()
        self.width = 720
        self.height = 1280
        self.screen = pygame.display.set_mode((self.width, self.height))
        self.clock = pygame.time.Clock()
        
        try:
            self.collision_sound = pygame.mixer.Sound('collision.wav')
        except:
            self.collision_sound = None

        self.space = pymunk.Space()
        self.space.gravity = (0, 0)
        
        # Collision types
        self.TYPE_BALL = 1
        self.TYPE_BOUNDARY = 2
        
        # Use the specific syntax requested in requirements
        # Note: This follows the prompt's instruction for space.on_collision
        try:
            self.space.on_collision(self.TYPE_BALL, self.TYPE_BOUNDARY, begin=self.collision_begin)
        except AttributeError:
            # Fallback if the environment uses standard Pymunk but we follow instructions
            handler = self.space.add_collision_handler(self.TYPE_BALL, self.TYPE_BOUNDARY)
            handler.begin = self.collision_begin

        self.balls = []
        self.boundary_segments = []
        self.rotation_angle = 0
        self.start_time = time.time()
        
        # Initial ball
        self.spawn_ball(self.width // 2, self.height // 2)
        
        # Setup initial boundary
        self.update_boundary()

    def spawn_ball(self, x, y):
        mass = 1
        radius = 15
        moment = pymunk.moment_for_circle(mass, 0, radius)
        body = pymunk.Body(mass, moment)
        body.position = (x, y)
        shape = pymunk.Circle(body, radius)
        shape.elasticity = 1.0
        shape.friction = 0.0
        shape.collision_type = self.TYPE_BALL
        self.space.add(body, shape)
        
        # Pre-render glow surface for efficiency (avoids per-frame Surface creation)
        glow_surf = pygame.Surface((radius * 6, radius * 6), pygame.SRCALPHA)
        for r in range(int(radius * 3), 0, -1):
            alpha = int(150 * (1 - (r / (radius * 3))))
            pygame.draw.circle(glow_surf, (0, 191, 255, alpha), (radius * 3, radius * 3), r)
        
        self.balls.append({
            'body': body,
            'shape': shape,
            'glow_surf': glow_surf,
            'radius': radius
        })

    def collision_begin(self, arbiter, space, data=None):
        if self.collision_sound:
            self.collision_sound.play()
        
        # Get the ball involved in collision
        shape_a = arbiter.shapes[0]
        shape_b = arbiter.shapes[1]
        ball_shape = shape_a if shape_a.collision_type == self.TYPE_BALL else shape_b
        
        if ball_shape.body.mass < 5: # Prevent exponential explosion from crashing
            pos = ball_shape.body.position
            self.spawn_ball(pos.x, pos.y)
            
        return True

    def update_boundary(self):
        # Remove old segments to prevent memory leak/accumulation
        for seg in self.boundary_segments:
            if seg in self.space.shapes:
                self.space.remove(seg)
        self.boundary_segments = []

        # Calculate rotating triangle vertices
        cx, cy = self.width // 2, self.height // 2
        r = 300
        points = []
        for i in range(3):
            angle = self.rotation_angle + (i * 120 * math.pi / 180)
            px = cx + r * math.cos(angle)
            py = cy + r * math.sin(angle)
            points.append((px, py))

        # Create new segments on static_body as required
        for i in range(3):
            p1 = points[i]
            p2 = points[(i + 1) % 3]
            seg = pymunk.Segment(self.space.static_body, p1, p2, 5)
            seg.elasticity = 1.0
            seg.friction = 0.0
            seg.collision_type = self.TYPE_BOUNDARY
            self.space.add(seg)
            self.boundary_segments.append(seg)

    def run(self):
        running = True
        while running:
            # Check exit condition (Exactly 5 seconds)
            if time.time() - self.start_time > 5.0:
                pygame.quit()
                sys.exit()

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False

            # Update physics
            self.rotation_angle += 0.02
            self.update_boundary()
            self.space.step(1/60.0)

            # Draw
            self.screen.fill((0, 0, 0))

            # Draw boundary lines
            for seg in self.boundary_segments:
                p1 = seg.a
                p2 = seg.b
                pygame.draw.line(self.screen, (0, 191, 255), p1, p2, 5)

            # Draw balls
            for ball in self.balls:
                pos = ball['body'].position
                # Draw glow
                glow = ball['glow_surf']
                rect = glow.get_rect(center=(int(pos.x), int(pos.y)))
                self.screen.blit(glow, rect)
                # Draw core
                pygame.draw.circle(self.screen, (255, 255, 255), (int(pos.x), int(pos.y)), ball['radius'])
                pygame.draw.circle(self.screen, (0, 191, 255), (int(pos.x), int(pos.y)), ball['radius'], 2)

            pygame.display.flip()
            self.clock.tick(60)

if __name__ == "__main__":
    sim = Simulation()
    sim.run()