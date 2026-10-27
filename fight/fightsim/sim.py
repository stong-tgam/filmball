"""
Deterministic ball-fight simulation.

No pygame, no rendering: a World is advanced one frame at a time with
step(). Given the same spec and seed it always produces the same fight,
so the seed search can run thousands of fights headless and the renderer
can replay the chosen one exactly.
"""

import math
import random

FPS = 60
SUBSTEPS = 3

# Stats every unit has, whether or not the spec mentions them.
DEFAULT_STATS = {
    "speed": 380.0,       # units/s, kept constant
    "armor": 0.0,         # fraction of incoming damage blocked (capped at 0.9)
    "body_damage": 0.0,   # damage dealt to enemies on body contact
    "size": 1.0,          # radius multiplier
    "blade_scale": 1.0,   # blade length/width multiplier
    "lifesteal": 0.0,     # fraction of damage dealt healed back
    "thorns": 0.0,        # fraction of damage taken reflected to attacker
    "seek": 0.0,          # deg/s the unit steers toward the nearest enemy
    "spin_mult": 1.0,     # blade spin speed multiplier
}

# Defaults for spec["rules"]
DEFAULT_RULES = {
    "blade_hit_cooldown": 0.5,   # same blade can't hit the same target again for this long
    "body_hit_cooldown": 0.4,    # same pair can't trade body damage again for this long
    "clash_cooldown": 0.25,
    "wall_jitter_deg": 6.0,      # random deflection on wall bounces, prevents stalemate loops
}

POISON_TICK = 0.5

# Damage sources that don't count as the attacker "hitting" (no hit trigger, no meter)
PASSIVE_SOURCES = {"poison", "storm", "lava", "fog", "fire", "ice", "mine", "ball"}

# Battle royale pickups: what each one does to whoever grabs it (effects as in character files)
ITEMS = {
    "potion": {"label": "HEAL", "tier": "common", "heal_frac": 0.3, "do": []},
    "fire":   {"label": "FIRE WAND", "tier": "rare", "do": [
        {"type": "shoot", "style": "fireball", "aim": "nearest", "count": 3, "spread": 40, "damage": 6,
         "speed": 950, "radius": 16, "color": [255, 120, 30]}]},
    "freeze": {"label": "FREEZE!", "tier": "epic", "freeze_all": 0.5, "do": []},
    "lightning": {"label": "LIGHTNING!", "tier": "epic", "lightning": {"count": 2, "damage": 12}, "do": []},
    "power":  {"label": "POWER UP", "tier": "rare", "do": [{"type": "buff", "stat": "blade_scale", "mul": 1.6, "duration": 4, "label": "BIG"},
                                            {"type": "buff", "stat": "dmg_mult", "mul": 1.5, "duration": 4, "label": "POWER"}]},
    "boots":  {"label": "SPEED", "tier": "common", "do": [{"type": "buff", "stat": "speed", "mul": 1.45, "duration": 4, "label": "FAST"}]},
    "shield": {"label": "SHIELD", "tier": "common", "do": [{"type": "buff", "stat": "armor", "add": 0.6, "duration": 3.5, "label": "SHIELD"}]},
    "bomb":   {"label": "BOMB!", "tier": "rare", "do": [{"type": "shockwave", "radius": 230, "damage": 9, "color": [255, 150, 60]}]},
}


def _norm(x, y):
    d = math.hypot(x, y)
    if d < 1e-9:
        return 1.0, 0.0
    return x / d, y / d


def _closest_on_segment(ax, ay, bx, by, px, py):
    abx, aby = bx - ax, by - ay
    denom = abx * abx + aby * aby
    if denom < 1e-12:
        return ax, ay
    t = ((px - ax) * abx + (py - ay) * aby) / denom
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    return ax + abx * t, ay + aby * t


def _seg_seg_dist2(a, b):
    """Squared distance between segments a=(x1,y1,x2,y2) and b."""
    def cross(ox, oy, px, py, qx, qy):
        return (px - ox) * (qy - oy) - (py - oy) * (qx - ox)

    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    d1 = cross(bx1, by1, bx2, by2, ax1, ay1)
    d2 = cross(bx1, by1, bx2, by2, ax2, ay2)
    d3 = cross(ax1, ay1, ax2, ay2, bx1, by1)
    d4 = cross(ax1, ay1, ax2, ay2, bx2, by2)
    if (d1 > 0) != (d2 > 0) and (d3 > 0) != (d4 > 0):
        return 0.0
    best = float("inf")
    for (px, py), (sx1, sy1, sx2, sy2) in (
        ((ax1, ay1), b), ((ax2, ay2), b), ((bx1, by1), a), ((bx2, by2), a)
    ):
        cx, cy = _closest_on_segment(sx1, sy1, sx2, sy2, px, py)
        best = min(best, (px - cx) ** 2 + (py - cy) ** 2)
    return best


class Blade:
    def __init__(self, spec, owner, uid, angle):
        self.uid = uid
        self.owner = owner
        self.style = spec.get("style", "sword")
        self.length = float(spec.get("length", 120))
        self.width = float(spec.get("width", 24))
        self.gap = float(spec.get("gap", 0))
        self.spin = math.radians(float(spec.get("spin", 200)))
        self.damage = spec.get("damage", 1)
        self.scale_stat = spec.get("scale_stat", "blade_scale")
        self.color = tuple(spec.get("color", [200, 205, 215]))
        self.guard_color = tuple(spec.get("guard_color", [215, 165, 40]))
        self.solid = bool(spec.get("solid", True))   # False: purely visual (e.g. a bow)
        self.aim = bool(spec.get("aim", False))       # True: always points at nearest enemy
        self.angle = angle + math.radians(float(spec.get("offset_deg", 0)))

    def scale(self):
        return self.owner.stat(self.scale_stat, 1.0)

    def segment(self):
        """(base_x, base_y, tip_x, tip_y, half_width) in arena coords."""
        o = self.owner
        s = self.scale()
        dx, dy = math.cos(self.angle), math.sin(self.angle)
        base = o.radius + self.gap
        bx, by = o.x + dx * base, o.y + dy * base
        tip = self.length * s
        return bx, by, bx + dx * tip, by + dy * tip, self.width * s / 2


class Projectile:
    def __init__(self, uid, owner, x, y, vx, vy, eff, damage):
        self.uid = uid
        self.owner = owner
        self.side = owner.side
        self.x, self.y, self.vx, self.vy = x, y, vx, vy
        self.radius = float(eff.get("radius", 10))
        self.damage = damage
        self.bounces = int(eff.get("bounces", 0))
        self.life = float(eff.get("life", 2.5))
        self.pierce = bool(eff.get("pierce", False))
        self.style = eff.get("style", "orb")
        self.launch = eff.get("launch")   # {"mult": .., "duration": ..}: knocks the target flying
        self.color = tuple(eff.get("color", owner.color))
        self.age = 0.0
        self.alive = True
        self.hit = set()


class Unit:
    def __init__(self, world, tpl, side, uid, x, y, heading, is_main, summoner=None):
        self.world = world
        self.tpl = tpl
        self.uid = uid
        self.kind = tpl.get("id", "unit")
        self.name = tpl.get("name", self.kind)
        self.side = side
        self.is_main = is_main
        self.summoner = summoner
        self.color = tuple(tpl.get("color", [200, 200, 200]))
        decor = tpl.get("decor") or []
        self.decor = [decor] if isinstance(decor, str) else list(decor)
        self.hud = list(tpl.get("hud", []))
        self.base_radius = float(tpl.get("radius", 50))
        self.max_hp = float(tpl.get("hp", 100))
        self.hp = self.max_hp

        self.base_stats = dict(DEFAULT_STATS)
        if "speed" in tpl:
            self.base_stats["speed"] = float(tpl["speed"])
        for k, v in tpl.get("stats", {}).items():
            self.base_stats[k] = float(v)
        sc = getattr(world, "unit_scale", 1.0)
        if sc != 1.0:
            self.base_stats["size"] = self.base_stats.get("size", 1.0) * sc
            self.base_stats["blade_scale"] = self.base_stats.get("blade_scale", 1.0) * sc
            self.base_stats["speed"] *= 0.5 + 0.5 * sc
        self.buffs = []  # dicts: stat, mul, add, until, label
        self.dots = []   # poison: src, dps, until, next

        self.x, self.y = x, y
        sp = self.stat("speed")
        self.vx, self.vy = math.cos(heading) * sp, math.sin(heading) * sp

        self.blades = []
        for i, bspec in enumerate(tpl.get("blades", [])):
            blade = Blade(bspec, self, world.next_uid(), world.rng.uniform(0, 2 * math.pi))
            blade.index = i   # matches weapon_<i>.png art
            self.blades.append(blade)

        self.abilities = []
        for a in tpl.get("abilities", []):
            a = dict(a)
            a["_last"] = -1e9
            a["_uses"] = 0
            a["_next"] = float(a.get("every", 0)) or None
            self.abilities.append(a)

        m = tpl.get("meter")
        self.meter = dict(m) if m else None
        self.meter_value = 0.0
        self.meter_active_until = -1.0
        self.meter_active_len = float(m.get("active_duration", 0)) if m else 0.0

        self.alive = True
        self.last_hurt = -1e9
        self.died_at = None
        # launched (body check, slap shot): flies at launch_mult x speed, easing back to normal
        self.launch_until = -1.0
        self.launch_len = 1.0
        self.launch_mult = 1.0
        self.frozen_until = -1.0    # freeze item / ice holes: stopped dead
        self.slow_until = -1.0      # fog: slowed while inside
        self.slow_mult = 1.0

    def speed_now(self, t):
        if t < self.frozen_until:
            return self.stat("speed") * 0.02      # keep the heading, barely move
        sp = self.stat("speed")
        if t < self.slow_until:
            sp *= self.slow_mult
        if t < self.launch_until:
            k = (self.launch_until - t) / self.launch_len
            sp *= 1 + (self.launch_mult - 1) * k * k
        return sp

    @property
    def radius(self):
        return self.base_radius * self.stat("size", 1.0)

    def stat(self, name, default=0.0):
        v = self.base_stats.get(name, default)
        add = 0.0
        mul = 1.0
        for b in self.buffs:
            if b["stat"] == name:
                add += b.get("add", 0.0)
                mul *= b.get("mul", 1.0)
        return (v + add) * mul

    def buff_label(self, name):
        labels = [b["label"] for b in self.buffs if b["stat"] == name and b.get("label")]
        return f" ({', '.join(labels)})" if labels else ""

    def hud_values(self):
        vals = {}
        for k in self.base_stats:
            v = self.stat(k)
            vals[k] = v
            vals[k + "_pct"] = v * 100
            vals[k + "_base"] = self.base_stats[k]
            vals[k + "_buffs"] = self.buff_label(k)
        vals["hp"] = max(0.0, self.hp)
        vals["max_hp"] = self.max_hp
        return vals

    def meter_fraction(self):
        if not self.meter:
            return 0.0
        return min(1.0, self.meter_value / float(self.meter.get("max", 100)))

    def meter_active_fraction(self, t):
        if self.meter_active_until <= t or self.meter_active_len <= 0:
            return 0.0
        return (self.meter_active_until - t) / self.meter_active_len


class World:
    def __init__(self, spec, seed):
        self.spec = spec
        self.seed = seed
        self.rng = random.Random(seed)
        arena = spec.get("arena", {})
        self.W = float(arena.get("width", 960))
        self.H = float(arena.get("height", 960))
        dur = spec.get("duration", {})
        self.max_duration = float(dur.get("max", 90))
        self.max_units_per_side = int(spec.get("max_units_per_side", 30))
        # older tuned specs have no meter_rate, so their fights still replay exactly
        self.meter_rate = float(spec.get("meter_rate", 1.0))
        self.meter_event_mult = float(spec.get("meter_event_mult", 1.0))   # per_hit / per_kill ... gain
        self.ult_cooldown = float(spec.get("ult_cooldown", 0.0))   # seconds the meter can't charge after an ult
        self.rules = dict(DEFAULT_RULES)
        self.rules.update(spec.get("rules", {}))

        self.t = 0.0
        self.frame = 0
        self._uid = 0
        self.units = []
        self.projectiles = []
        self.events = []
        self.frame_events = []
        self.pending = []
        self.cooldowns = {}
        self._segs = []
        self.done = False
        self.winner_side = None
        self.timeline = []  # (t, strength side0, strength side1)

        self.royale = spec.get("mode") == "royale"
        self.unit_scale = float(spec.get("unit_scale", 1.0))
        self.terrain = [dict(o) for o in spec.get("terrain", [])]   # solid: circle / rect
        self.hazards = [dict(h) for h in spec.get("hazards", [])]   # lava pools: circle + dps
        self.items_cfg = spec.get("items")                          # {"every", "first", "max", "kinds"}
        self.items = []                                             # live pickups: dicts
        self.storm = spec.get("storm")                              # {"start", "end", "min_r", "dps"}
        self.placements = []                                        # sides in elimination order
        self.kills = {}

        self.balls = []
        self.soccer = spec.get("mode") == "soccer"
        if self.soccer:
            sc = spec["soccer"]
            self.goal_w = float(sc.get("goal_width", 320))
            self.goal_line = float(sc.get("goal_line", 40))   # ball past this line (inside the mouth) = goal
            self.to_win = int(sc.get("to_win", 3))
            self.regulation = float(sc.get("regulation", 40))
            self.respawn_after = float(sc.get("respawn", 2.5))
            self.score = [0, 0]
            self.goals = []                                   # (t, team, scorer uid or None, own goal)
            self.respawns = []                                # (t, unit)
            self.kickoff_until = -1.0
            self.pending_kickoff = False
            self.golden = False
            gx0, gx1 = self.W / 2 - self.goal_w / 2, self.W / 2 + self.goal_w / 2
            for gy in (self.goal_line, self.H - self.goal_line):   # goal posts
                for gx in (gx0, gx1):
                    self.terrain.append({"shape": "circle", "kind": "post", "x": gx, "y": gy, "r": 12})
        self.horde = spec.get("mode") == "horde"
        if self.horde:
            hc = spec["horde"]
            self.horde_cfg = hc
            self.wave = 0
            self.next_wave_t = float(hc.get("first_wave", 0.2))
            self.spawn_queue = []          # (t, enemy template)
            self.kill_count = 0
            self.combo, self.max_combo, self._last_kill_t = 0, 0, -9.0
            self.bosses_killed = 0
            if hc.get("drops"):
                self.items_cfg = None      # items come from enemy drops, not timed spawns
        self.boss_mode = spec.get("mode") == "boss"
        if self.boss_mode:
            self.telegraphs = []           # attacks being wound up: hit when t >= t_hit
            self.enraged = False
            self.boss_dmg = {}             # hero uid -> damage dealt to the boss (MVP)
            self._boss_ready = 0.0         # global cooldown between boss skills
        fighters = spec["fighters"] if self.boss_mode else spec["fighters"][:1] if self.horde else (
            spec["fighters"] if (self.royale or self.soccer) else spec["fighters"][:2])
        self.mains = [None] * len(fighters)
        if self.boss_mode:
            starts = [(0.2 * self.W, 0.14 * self.H), (0.8 * self.W, 0.14 * self.H),
                      (0.2 * self.W, 0.86 * self.H), (0.8 * self.W, 0.86 * self.H), (0.5 * self.W, 0.5 * self.H)]
        elif self.horde:
            starts = [(self.W / 2, self.H / 2)]
        elif self.soccer:   # team 0 (first half of the list) defends the bottom goal
            n2 = len(fighters) // 2
            self.team_of = [0] * n2 + [1] * (len(fighters) - n2)
            starts = self._kickoff_spots(len(fighters))
        elif self.royale:   # evenly around a ring, nudged off any terrain
            n = len(fighters)
            rot = self.rng.uniform(0, 2 * math.pi)
            starts = []
            for i in range(n):
                a = rot + i * 2 * math.pi / n
                x, y = 0.5 + 0.36 * math.cos(a), 0.5 + 0.36 * math.sin(a)
                starts.append(self._free_spot(x * self.W, y * self.H, 90, rel=False))
        else:
            starts = [(0.32 * self.W, 0.56 * self.H), (0.68 * self.W, 0.44 * self.H)]
        for i, tpl in enumerate(fighters):
            sx, sy = starts[i]
            heading = self.rng.uniform(0, 2 * math.pi)
            side = self.team_of[i] if self.soccer else ((0 if i < len(fighters) - 1 else 1) if self.boss_mode else i)
            u = Unit(self, tpl, side, self.next_uid(), sx, sy, heading, is_main=True)
            u.role = (i % 2) if self.soccer else 0           # soccer: 0 striker, 1 defender
            self.units.append(u)
            self.mains[i] = u
        if self.boss_mode:
            self.boss = self.mains[-1]
            for i, sk in enumerate(self.boss.tpl.get("skills", [])):
                sk = dict(sk)
                sk["_next"] = float(sk.get("first", 1.0 + 0.9 * i))
                self.boss.__dict__.setdefault("skills", []).append(sk)
        if self.soccer:
            self.balls = [{"x": self.W / 2, "y": self.H / 2, "vx": 0.0, "vy": 0.0,
                           "r": float(spec["soccer"].get("ball_r", 26)), "last": None}]
        self._next_item = float(self.items_cfg.get("first", 1.5)) if self.items_cfg else None
        self.slippery = float(spec.get("slippery", 1.0))
        if not getattr(self, "soccer", False):
            self.balls = [{"x": h["x"], "y": h["y"], "vx": 0.0, "vy": 0.0, "r": float(h.get("r", 24)),
                           "last": None} for h in self.hazards if h.get("type") == "ball"]
        self.hazards = [h for h in self.hazards if h.get("type") != "ball"]

        for u in list(self.units):
            self._trigger(u, "start")
        self._aim_blades()
        self._flush()
        self._sample()

    # ── helpers ──────────────────────────────────────────────────────────

    def next_uid(self):
        self._uid += 1
        return self._uid

    def emit(self, type_, **kw):
        ev = {"t": round(self.t, 4), "type": type_}
        ev.update(kw)
        self.events.append(ev)
        self.frame_events.append(ev)

    def _cool(self, key, seconds):
        last = self.cooldowns.get(key, -1e9)
        if self.t - last < seconds:
            return False
        self.cooldowns[key] = self.t
        return True

    def resolve(self, value, unit):
        """number | "$stat" | {"stat": name, "mul": k, "add": c}"""
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str) and value.startswith("$"):
            return unit.stat(value[1:])
        if isinstance(value, dict) and "stat" in value:
            return unit.stat(value["stat"]) * float(value.get("mul", 1)) + float(value.get("add", 0))
        return float(value)

    def _blocked(self, x, y, r):
        for o in self.terrain:
            if o["shape"] == "circle":
                if math.hypot(x - o["x"], y - o["y"]) < o["r"] + r:
                    return True
            elif (o["x"] - r < x < o["x"] + o["w"] + r) and (o["y"] - r < y < o["y"] + o["h"] + r):
                return True
        for h in self.hazards:
            if math.hypot(x - h["x"], y - h["y"]) < h["r"] + r:
                return True
        return False

    def _free_spot(self, x, y, r, rel=True):
        """(x, y) or the nearest nearby point not inside terrain/hazards."""
        if rel:
            x, y = x * self.W, y * self.H
        for k in range(60):
            ang, dist = k * 2.4, 18 * k
            px = min(max(x + math.cos(ang) * dist, r), self.W - r)
            py = min(max(y + math.sin(ang) * dist, r), self.H - r)
            if not self._blocked(px, py, r):
                return px, py
        return x, y

    def _kickoff_spots(self, n):
        """Team 0 in the bottom half, team 1 in the top half: striker forward, defender back."""
        W, H = self.W, self.H
        spots = []
        n2 = n // 2
        for i in range(n):
            team, k = (0, i) if i < n2 else (1, i - n2)
            fwd = H * (0.62 if k % 2 == 0 else 0.8)
            x = W * (0.5 + (0.18 if k % 2 == 0 else -0.16) * (1 if team == 0 else -1))
            spots.append((x, fwd if team == 0 else H - fwd))
        return spots

    def raid_mvp(self):
        """Boss raid: the hero who dealt the boss the most damage."""
        heroes = [m for m in self.mains if m.side == 0]
        return max(heroes, key=lambda m: (self.boss_dmg.get(m.uid, 0.0), -m.uid)) if heroes else None

    def mvp(self):
        """Soccer: the winning team's player with the most goals (then knockouts)."""
        if getattr(self, "boss_mode", False):
            return self.raid_mvp()
        team = self.winner_side
        if team is None:
            return None
        goals = {}
        for _, tm, scorer, own in self.goals:
            if scorer is not None and not own:
                goals[scorer] = goals.get(scorer, 0) + 1
        kos = {}
        for ev in self.events:
            if ev["type"] == "death" and ev.get("main") and ev.get("killer"):
                kos[ev["killer"]] = kos.get(ev["killer"], 0) + 1
        team_players = [m for m in self.mains if m.side == team]
        return max(team_players, key=lambda m: (goals.get(m.uid, 0), kos.get(m.uid, 0), -m.uid))

    def attack_goal(self, team):
        """Where a team shoots: team 0 attacks the top goal."""
        return (self.W / 2, 0.0) if team == 0 else (self.W / 2, self.H)

    def _soccer_target(self, u):
        """Steering target for a player: strikers get behind the ball and push it at goal;
        defenders sit between ball and own goal and clear it when it comes close."""
        b = self.balls[0]
        gx, gy = self.attack_goal(u.side)
        ox, oy = self.attack_goal(1 - u.side)          # own goal
        tx, ty = _norm(gx - b["x"], gy - b["y"])         # ball -> attack goal
        behind = (b["x"] - tx * (u.radius + b["r"]) * 0.9, b["y"] - ty * (u.radius + b["r"]) * 0.9)
        mates = [m for m in self.mains if m.alive and m.side == u.side]
        closest = min(mates, key=lambda m: (m.x - b["x"]) ** 2 + (m.y - b["y"]) ** 2) is u
        ball_own_half = abs(b["y"] - oy) < self.H / 2
        if u.role == 0 or (closest and ball_own_half):
            # in front of the ball (closer to the goal than it is)? loop round to get behind it
            if (u.x - gx) ** 2 + (u.y - gy) ** 2 < (b["x"] - gx) ** 2 + (b["y"] - gy) ** 2:
                return behind
            return (b["x"], b["y"])
        return (ox + (b["x"] - ox) * 0.38, oy + (b["y"] - oy) * 0.38)

    def _goal_scored(self, team, b):
        scorer = b.get("last")
        su = next((m for m in self.units if m.uid == scorer), None)
        own = su is not None and su.side != team
        self.score[team] += 1
        self.goals.append((self.t, team, scorer, own))
        self.emit("goal", team=team, scorer=scorer, own=own, score=list(self.score), x=b["x"], y=b["y"])
        if self.score[team] >= self.to_win or self.golden:
            self.done = True
            self.winner_side = team
            self.emit("victory", side=team)
            return
        # the ball stays in the net for this step (the video freezes on it), then kickoff
        b.update({"vx": 0.0, "vy": 0.0})
        self.pending_kickoff = True

    def _kickoff(self):
        """Everyone back to their spots, a short hold, ball in the middle."""
        self.pending_kickoff = False
        b = self.balls[0]
        self.kickoff_until = self.t + 1.1
        for m, (x, y) in zip(self.mains, self._kickoff_spots(len(self.mains))):
            if m.alive:
                m.x, m.y = x, y
                m.frozen_until = self.kickoff_until
                m.launch_until = -1.0
        b.update({"x": self.W / 2, "y": self.H / 2, "vx": 0.0, "vy": 0.0, "last": None})
        self.emit("kickoff", t_end=self.kickoff_until)

    def storm_radius(self, t=None):
        if not self.storm:
            return None
        t = self.t if t is None else t
        r0 = math.hypot(self.W, self.H) / 2 + 10
        a, b = float(self.storm.get("start", 6)), float(self.storm.get("end", 22))
        k = min(1.0, max(0.0, (t - a) / max(0.1, b - a)))
        return r0 + (float(self.storm.get("min_r", 140)) - r0) * k

    def nearest_enemy(self, u):
        best, bd = None, float("inf")
        for e in self.units:
            if e.alive and e.side != u.side:
                d = (e.x - u.x) ** 2 + (e.y - u.y) ** 2
                if d < bd:
                    best, bd = e, d
        return best

    def side_strength(self, side):
        """Main fighter HP fraction; minions count once the main is dead."""
        main = self.mains[side]
        if main.alive:
            return main.hp / main.max_hp
        rest = sum(u.hp for u in self.units if u.alive and u.side == side)
        return min(0.05, rest / main.max_hp)

    def _sample(self):
        if self.soccer:
            self.timeline.append((round(self.t, 3), *self.score))
            return
        if self.horde:
            h = self.mains[0]
            self.timeline.append((round(self.t, 3), max(0.0, h.hp) / h.max_hp, self.kill_count))
            return
        self.timeline.append((round(self.t, 3), *(self.side_strength(i) for i in range(len(self.mains)))))

    # ── main loop ────────────────────────────────────────────────────────

    def step(self):
        if self.done:
            return
        self.frame_events = []
        if getattr(self, "pending_kickoff", False):
            self._kickoff()
        dt = 1.0 / FPS
        h = dt / SUBSTEPS
        for _ in range(SUBSTEPS):
            self.t += h
            self._integrate(h)
            self._walls()
            if self.terrain:
                self._terrain_hits()
            self._bodies()
            self._blades(h)
            self._projectiles(h)
            if self.balls:
                self._balls(h)
            self._renormalize()
            self._flush()
            if self.done:
                break
        if not self.done:
            self._per_frame(dt)
            self._flush()
        self.frame += 1
        if self.frame % 15 == 0 or self.done:
            self._sample()
        if not self.done and self.t >= self.max_duration:
            self.done = True
            self.winner_side = None
            self.emit("timeout")

    def _alive(self):
        return [u for u in self.units if u.alive]

    def _aim_blades(self):
        for u in self.units:
            if not u.alive:
                continue
            aimed = [b for b in u.blades if b.aim]
            if not aimed:
                continue
            e = self.nearest_enemy(u)
            if e is None:
                continue
            a = math.atan2(e.y - u.y, e.x - u.x)
            for b in aimed:
                b.angle = a

    def _integrate(self, h):
        for u in self.units:
            if not u.alive:
                continue
            u.x += u.vx * h
            u.y += u.vy * h
            spin_mult = u.stat("spin_mult", 1.0) if self.t >= u.frozen_until else 0.0
            for b in u.blades:
                if not b.aim:
                    b.angle += b.spin * spin_mult * h

    def _walls(self):
        for u in self.units:
            if not u.alive:
                continue
            r = u.radius
            hit = False
            if u.x - r < 0:
                u.x = r
                u.vx = abs(u.vx)
                hit = True
            elif u.x + r > self.W:
                u.x = self.W - r
                u.vx = -abs(u.vx)
                hit = True
            if u.y - r < 0:
                u.y = r
                u.vy = abs(u.vy)
                hit = True
            elif u.y + r > self.H:
                u.y = self.H - r
                u.vy = -abs(u.vy)
                hit = True
            if hit:
                jit = self.rules["wall_jitter_deg"]
                j = math.radians(self.rng.uniform(-jit, jit))
                c, s = math.cos(j), math.sin(j)
                u.vx, u.vy = u.vx * c - u.vy * s, u.vx * s + u.vy * c
                # keep the jitter from pointing back into the wall
                if u.x - r <= 0.001:
                    u.vx = abs(u.vx)
                if u.x + r >= self.W - 0.001:
                    u.vx = -abs(u.vx)
                if u.y - r <= 0.001:
                    u.vy = abs(u.vy)
                if u.y + r >= self.H - 0.001:
                    u.vy = -abs(u.vy)
                self.emit("wall", unit=u.uid, x=u.x, y=u.y)
                self._trigger(u, "wall")

    def _terrain_hits(self):
        """Units bounce off rocks/pillars/walls like off the arena edge."""
        for u in self.units:
            if not u.alive:
                continue
            r = u.radius
            for o in self.terrain:
                if o["shape"] == "circle":
                    dx, dy = u.x - o["x"], u.y - o["y"]
                    d = math.hypot(dx, dy)
                    lim = o["r"] + r
                    if d >= lim or d == 0:
                        continue
                    nx, ny = dx / d, dy / d
                    u.x, u.y = o["x"] + nx * lim, o["y"] + ny * lim
                else:
                    cx = min(max(u.x, o["x"]), o["x"] + o["w"])
                    cy = min(max(u.y, o["y"]), o["y"] + o["h"])
                    dx, dy = u.x - cx, u.y - cy
                    d = math.hypot(dx, dy)
                    if d >= r:
                        continue
                    if d == 0:   # centre inside the box: push out the short way
                        nx, ny = (1.0, 0.0) if u.x > o["x"] + o["w"] / 2 else (-1.0, 0.0)
                        d = 0
                    else:
                        nx, ny = dx / d, dy / d
                    u.x, u.y = cx + nx * r, cy + ny * r
                dot = u.vx * nx + u.vy * ny
                if dot < 0:
                    u.vx -= 2 * dot * nx
                    u.vy -= 2 * dot * ny
                    self.emit("wall", unit=u.uid, x=u.x, y=u.y)
                    self._trigger(u, "wall")

    def _balls(self, h):
        """A loose ball (soccer map): rolls with drag, bounces off walls and blockers, gets
        kicked by whoever touches it, and knocks fighters back when it's moving fast."""
        for b in self.balls:
            b["x"] += b["vx"] * h
            b["y"] += b["vy"] * h
            sp = math.hypot(b["vx"], b["vy"])
            if sp > 120:
                k = max(120.0, sp * (1 - 0.7 * h)) / sp
                b["vx"] *= k
                b["vy"] *= k
            r = b["r"]
            if b["x"] - r < 0 or b["x"] + r > self.W:
                b["vx"] = -b["vx"]
                b["x"] = min(max(b["x"], r), self.W - r)
            in_mouth = self.soccer and abs(b["x"] - self.W / 2) < self.goal_w / 2 - r * 0.5
            if in_mouth and not self.pending_kickoff and (b["y"] < self.goal_line or b["y"] > self.H - self.goal_line):
                self._goal_scored(0 if b["y"] < self.goal_line else 1, b)
                return
            if b["y"] - r < 0 or b["y"] + r > self.H:
                b["vy"] = -b["vy"]
                b["y"] = min(max(b["y"], r), self.H - r)
            for o in self.terrain:
                if o["shape"] == "circle":
                    dx, dy = b["x"] - o["x"], b["y"] - o["y"]
                    d = math.hypot(dx, dy)
                    if d == 0 or d >= o["r"] + r:
                        continue
                    nx, ny = dx / d, dy / d
                    b["x"], b["y"] = o["x"] + nx * (o["r"] + r), o["y"] + ny * (o["r"] + r)
                else:
                    cx = min(max(b["x"], o["x"]), o["x"] + o["w"])
                    cy = min(max(b["y"], o["y"]), o["y"] + o["h"])
                    dx, dy = b["x"] - cx, b["y"] - cy
                    d = math.hypot(dx, dy)
                    if d >= r or d == 0:
                        continue
                    nx, ny = dx / d, dy / d
                    b["x"], b["y"] = cx + nx * r, cy + ny * r
                dot = b["vx"] * nx + b["vy"] * ny
                if dot < 0:
                    b["vx"] -= 2 * dot * nx
                    b["vy"] -= 2 * dot * ny
            for u in self.units:
                if not u.alive:
                    continue
                dx, dy = b["x"] - u.x, b["y"] - u.y
                d = math.hypot(dx, dy)
                if d == 0 or d >= u.radius + r:
                    continue
                nx, ny = dx / d, dy / d
                fast = math.hypot(b["vx"], b["vy"]) > 650 and b["last"] != u.uid
                if fast and self._cool(("ball", u.uid), 0.4):   # a hard ball knocks you back
                    self.env_damage(u, 2, "ball")
                    self.launch(u, u, -nx, -ny, 1.6, 0.3)
                    self.emit("ball_hit", unit=u.uid, x=b["x"], y=b["y"])
                kick = max(950.0, math.hypot(u.vx, u.vy) * 1.4)
                if self.soccer:   # aim assist: bend the kick toward the goal this player attacks
                    gx, gy = self.attack_goal(u.side)
                    ax_, ay_ = _norm(gx - b["x"], gy - b["y"])
                    nx, ny = _norm(nx * 0.55 + ax_ * 0.45, ny * 0.55 + ay_ * 0.45)
                b["vx"], b["vy"] = nx * kick, ny * kick
                b["x"], b["y"] = u.x + nx * (u.radius + r + 1), u.y + ny * (u.radius + r + 1)
                if self._cool(("kick", u.uid), 0.2):
                    self.emit("kick", unit=u.uid, x=b["x"], y=b["y"])
                b["last"] = u.uid

    def freeze(self, u, seconds):
        if not u.alive:
            return
        u.frozen_until = max(u.frozen_until, self.t + seconds)
        self.emit("frozen", unit=u.uid, x=u.x, y=u.y, seconds=seconds)

    def _in_terrain(self, x, y, r):
        for o in self.terrain:
            if o["shape"] == "circle":
                if math.hypot(x - o["x"], y - o["y"]) < o["r"] + r:
                    return True
            elif (o["x"] - r < x < o["x"] + o["w"] + r) and (o["y"] - r < y < o["y"] + o["h"] + r):
                return True
        return False

    def env_damage(self, u, amount, source):
        """Storm / lava: no attacker, no on-hit triggers."""
        if not u.alive or amount <= 0:
            return
        u.hp -= amount
        u.last_hurt = self.t
        self.emit("damage", src=None, dst=u.uid, amount=round(amount, 3), source=source,
                  x=u.x, y=u.y, hx=u.x, hy=u.y)
        if u.hp <= 0:
            self._kill(u, None)

    def _bodies(self):
        alive = self._alive()
        n = len(alive)
        for i in range(n):
            a = alive[i]
            for j in range(i + 1, n):
                b = alive[j]
                if not (a.alive and b.alive):
                    continue
                dx, dy = b.x - a.x, b.y - a.y
                rr = a.radius + b.radius
                d2 = dx * dx + dy * dy
                if d2 >= rr * rr:
                    continue
                d = math.sqrt(d2) if d2 > 1e-12 else 1e-6
                nx, ny = (dx / d, dy / d) if d2 > 1e-12 else (1.0, 0.0)
                ma, mb = a.radius ** 2, b.radius ** 2
                overlap = rr - d
                a.x -= nx * overlap * mb / (ma + mb)
                a.y -= ny * overlap * mb / (ma + mb)
                b.x += nx * overlap * ma / (ma + mb)
                b.y += ny * overlap * ma / (ma + mb)
                rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
                if rel > 0:
                    imp = 2 * rel / (ma + mb)
                    a.vx -= imp * mb * nx
                    a.vy -= imp * mb * ny
                    b.vx += imp * ma * nx
                    b.vy += imp * ma * ny
                if a.side != b.side:
                    key = ("body", min(a.uid, b.uid), max(a.uid, b.uid))
                    if self._cool(key, self.rules["body_hit_cooldown"]):
                        self.emit("bump", a=a.uid, b=b.uid,
                                  x=(a.x + b.x) / 2, y=(a.y + b.y) / 2)
                        da, db = a.stat("body_damage"), b.stat("body_damage")
                        if da > 0:
                            self.damage(a, b, da, "body")
                        if db > 0 and b.alive and a.alive:
                            self.damage(b, a, db, "body")

    def _blades(self, h):
        segs = []
        for u in self.units:
            if not u.alive:
                continue
            for bl in u.blades:
                if bl.solid:
                    segs.append((bl, bl.segment()))
        self._segs = segs

        clashed = set()
        for i in range(len(segs)):
            bi, si = segs[i]
            for j in range(i + 1, len(segs)):
                bj, sj = segs[j]
                if bi.owner.side == bj.owner.side:
                    continue
                lim = si[4] + sj[4]
                if _seg_seg_dist2(si[:4], sj[:4]) < lim * lim:
                    clashed.add((bi.owner.uid, bj.owner.uid))
                    clashed.add((bj.owner.uid, bi.owner.uid))
                    key = ("clash", min(bi.uid, bj.uid), max(bi.uid, bj.uid))
                    if self._cool(key, self.rules["clash_cooldown"]):
                        bi.spin, bj.spin = -bi.spin, -bj.spin
                        bi.angle += bi.spin * h * 2
                        bj.angle += bj.spin * h * 2
                        self.emit("clash", a=bi.owner.uid, b=bj.owner.uid,
                                  x=(si[2] + sj[2]) / 2, y=(si[3] + sj[3]) / 2)
                        self._trigger(bi.owner, "clash", bj.owner)
                        self._trigger(bj.owner, "clash", bi.owner)

        for bl, (bx, by, tx, ty, hw) in segs:
            owner = bl.owner
            if not owner.alive:
                continue
            for e in self.units:
                if not e.alive or e.side == owner.side:
                    continue
                if (owner.uid, e.uid) in clashed:
                    continue
                cx, cy = _closest_on_segment(bx, by, tx, ty, e.x, e.y)
                lim = e.radius + hw
                if (e.x - cx) ** 2 + (e.y - cy) ** 2 >= lim * lim:
                    continue
                if not self._cool(("blade", bl.uid, e.uid), self.rules["blade_hit_cooldown"]):
                    continue
                # knock the target away from the contact point, attacker away from target
                kx, ky = _norm(e.x - cx, e.y - cy)
                es = math.hypot(e.vx, e.vy)
                e.vx, e.vy = kx * es, ky * es
                ox, oy = _norm(owner.x - e.x, owner.y - e.y)
                os_ = math.hypot(owner.vx, owner.vy)
                owner.vx, owner.vy = ox * os_, oy * os_
                dmg = self.resolve(bl.damage, owner)
                if dmg > 0:
                    self.damage(owner, e, dmg, "blade", hx=cx, hy=cy)
                else:
                    self.emit("shove", unit=owner.uid, x=cx, y=cy)

    def _projectiles(self, h):
        if not self.projectiles:
            return
        for p in list(self.projectiles):
            if not p.alive:
                continue
            p.x += p.vx * h
            p.y += p.vy * h
            p.age += h
            if p.age >= p.life:
                p.alive = False
                continue
            r = p.radius
            bounced = False
            if p.x - r < 0 or p.x + r > self.W:
                p.vx = -p.vx
                p.x = min(max(p.x, r), self.W - r)
                bounced = True
            if p.y - r < 0 or p.y + r > self.H:
                p.vy = -p.vy
                p.y = min(max(p.y, r), self.H - r)
                bounced = True
            if bounced:
                if p.bounces <= 0:
                    p.alive = False
                    self.emit("fizzle", x=p.x, y=p.y)
                    continue
                p.bounces -= 1

            if self.terrain and self._in_terrain(p.x, p.y, 0):
                p.alive = False
                self.emit("fizzle", x=p.x, y=p.y)
                continue
            hit_ball = False
            for b in self.balls:
                if (b["x"] - p.x) ** 2 + (b["y"] - p.y) ** 2 < (b["r"] + r) ** 2:
                    b["vx"] += p.vx * 0.7
                    b["vy"] += p.vy * 0.7
                    b["last"] = p.owner.uid
                    self.emit("kick", unit=p.owner.uid, x=b["x"], y=b["y"])
                    hit_ball = not p.pierce
            if hit_ball:
                p.alive = False
                continue
            blocked = False
            for bl, (bx, by, tx, ty, hw) in self._segs:
                if bl.owner.side == p.side or not bl.owner.alive:
                    continue
                cx, cy = _closest_on_segment(bx, by, tx, ty, p.x, p.y)
                if (p.x - cx) ** 2 + (p.y - cy) ** 2 < (hw + r) ** 2:
                    p.alive = False
                    blocked = True
                    self.emit("block", unit=bl.owner.uid, x=p.x, y=p.y)
                    self._trigger(bl.owner, "block", p.owner)
                    break
            if blocked:
                continue

            for e in self.units:
                if not e.alive or e.side == p.side or e.uid in p.hit:
                    continue
                lim = e.radius + r
                if (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < lim * lim:
                    p.hit.add(e.uid)
                    self.damage(p.owner, e, p.damage, "projectile", hx=p.x, hy=p.y)
                    if p.launch and e.alive:
                        self.launch(p.owner, e, p.vx, p.vy, float(p.launch.get("mult", 2.0)),
                                    float(p.launch.get("duration", 0.5)))
                    if not p.pierce:
                        p.alive = False
                        break
        self.projectiles = [p for p in self.projectiles if p.alive]

    def _renormalize(self):
        for u in self.units:
            if not u.alive:
                continue
            sp = u.speed_now(self.t)
            nx, ny = _norm(u.vx, u.vy)
            u.vx, u.vy = nx * sp, ny * sp

    def launch(self, src, tgt, dx, dy, mult=2.5, duration=0.7):
        """Send tgt flying along (dx, dy) at mult x its speed, easing back over `duration` s."""
        if not tgt.alive or tgt.stat("launch_immune") > 0:
            return
        nx, ny = _norm(dx, dy)
        mult = max(1.0, mult * (1 - min(0.8, tgt.stat("stability"))))
        tgt.launch_mult, tgt.launch_len = mult, max(0.05, duration)
        tgt.launch_until = self.t + tgt.launch_len
        sp = tgt.speed_now(self.t)
        tgt.vx, tgt.vy = nx * sp, ny * sp
        self.emit("launch", unit=tgt.uid, src=src.uid, x=tgt.x, y=tgt.y, mult=round(mult, 2))

    def _horde_spawn(self, t):
        hc = self.horde_cfg
        if t >= self.next_wave_t:
            self.wave += 1
            w = self.wave
            n = int(hc.get("base", 5)) + int(hc.get("grow", 3)) * (w - 1)
            enemies = hc["enemies"]
            boss = w in hc.get("boss_waves", [5, 10])
            # each wave brings in one new enemy type (shown off with ~1/3 of the wave);
            # the ones met earlier keep mixing in
            pool = [e for e in enemies["elites"] if e.get("unlock", 3) <= w]
            new = [e for e in pool if e.get("unlock", 3) == w]
            old = [e for e in pool if e.get("unlock", 3) < w]
            roster = []
            for i in range(n):
                if new and i % 3 == 1:
                    roster.append(new[0])
                elif old and self.rng.random() < min(0.5, 0.15 * (w - 1)):
                    roster.append(self.rng.choice(old))
                else:
                    roster.append(enemies["basic"])
            if boss:
                roster.append(enemies["boss"])
            for i, tpl in enumerate(roster):
                self.spawn_queue.append((t + 1.4 * i / max(1, len(roster)), tpl))
            self.emit("wave", wave=w, count=len(roster), boss=enemies["boss"]["name"] if boss else None,
                      new=new[0]["name"] if new else None, new_sprite=new[0].get("sprite") if new else None)
            self.next_wave_t = t + max(2.4, float(hc.get("gap", 4.0)) - 0.15 * (w - 1))
        alive = [u for u in self.units if u.alive and u.side == 1]
        if len(alive) <= 2 and self.wave and not self.spawn_queue:
            self.next_wave_t = min(self.next_wave_t, t + 0.5)     # cleared: next wave right away
        cap = int(hc.get("max_alive", 40))
        while self.spawn_queue and self.spawn_queue[0][0] <= t and len(alive) < cap:
            _, tpl = self.spawn_queue.pop(0)
            hero = self.mains[0]
            for _ in range(10):                                    # from an edge, away from the hero
                edge = self.rng.randrange(4)
                x = self.rng.uniform(40, self.W - 40) if edge < 2 else (40 if edge == 2 else self.W - 40)
                y = (40 if edge == 0 else self.H - 40) if edge < 2 else self.rng.uniform(40, self.H - 40)
                if math.hypot(x - hero.x, y - hero.y) > 260:
                    break
            w = self.wave
            tpl = dict(tpl, hp=tpl["hp"] * (1 + 0.08 * (w - 1)),
                       speed=tpl["speed"] * min(1.5, 1 + 0.05 * (w - 1)))
            u = Unit(self, tpl, 1, self.next_uid(), x, y, math.atan2(hero.y - y, hero.x - x), is_main=False)
            for a in u.abilities:                                  # timers count from the spawn
                if a.get("_next"):
                    a["_next"] = t + a["_next"]
            self.units.append(u)
            alive.append(u)
            self._trigger(u, "start")
            self.emit("enemy_spawn", unit=u.uid, x=x, y=y, boss=bool(tpl.get("boss")))

    def _in_telegraph(self, tg, x, y, r):
        k = tg["kind"]
        if k in ("circle", "nova"):
            return math.hypot(x - tg["x"], y - tg["y"]) <= tg["r"] + r
        dx, dy = x - tg["x"], y - tg["y"]
        ca, sa = math.cos(tg["ang"]), math.sin(tg["ang"])
        along, perp = dx * ca + dy * sa, -dx * sa + dy * ca
        if k == "beam":
            return 0 <= along <= tg["len"] and abs(perp) <= tg["width"] / 2 + r
        if k == "cone":
            d = math.hypot(dx, dy)
            if d > tg["range"] + r or d == 0:
                return d == 0
            diff = (math.atan2(dy, dx) - tg["ang"] + math.pi) % (2 * math.pi) - math.pi
            return abs(diff) <= math.radians(tg["half"]) + math.asin(min(1.0, r / d))
        return False

    def _boss_tick(self, t):
        b = self.boss
        if not b.alive:
            return
        if not self.enraged and b.hp < 0.5 * b.max_hp:          # phase 2
            self.enraged = True
            b.base_stats["speed"] *= 1.3
            b.base_stats["size"] = b.base_stats.get("size", 1.0) * 1.12
            for stat, add in b.tpl.get("enrage", {}).items():   # e.g. the Golem hardens: armor +0.3
                b.base_stats[stat] = b.base_stats.get(stat, 0.0) + float(add)
            self.emit("enraged", unit=b.uid, x=b.x, y=b.y)
        phase = 2 if self.enraged else 1
        heroes = [u for u in self.units if u.alive and u.side == 0 and u.is_main]
        if heroes and t >= self._boss_ready:
            for sk in b.skills:
                if sk.get("phase", 1) > phase or t < sk["_next"]:
                    continue
                sk["_next"] = t + float(sk["every"]) * (0.7 if self.enraged else 1.0)
                self._boss_ready = t + 1.1
                self._cast(b, sk, heroes, t)
                break
        for tg in list(self.telegraphs):
            if t < tg["t_hit"]:
                continue
            self.telegraphs.remove(tg)
            if tg["kind"] == "summon_spot":
                tpl = self.boss.tpl["minions"][tg["minion"]]
                u = Unit(self, dict(tpl), 1, self.next_uid(), tg["x"], tg["y"], self.rng.uniform(0, 6.28), is_main=False)
                u.summoner = b.uid
                self.units.append(u)
                self.emit("summon", unit=u.uid, x=u.x, y=u.y)
                continue
            self.emit("boss_impact", kind=tg["kind"], name=tg["name"], x=tg["x"], y=tg["y"],
                      r=tg.get("r"), ang=tg.get("ang"), len=tg.get("len"), width=tg.get("width"),
                      range=tg.get("range"), half=tg.get("half"), fx=tg.get("fx"))
            for u in [u for u in self.units if u.alive and u.side == 0]:
                if self._in_telegraph(tg, u.x, u.y, u.radius):
                    self.damage(b, u, tg["dmg"], "spell")
                    if tg.get("launch") and u.alive:
                        self.launch(b, u, u.x - b.x, u.y - b.y, tg["launch"], 0.5)
                    if tg.get("pull") and u.alive:        # whirlpool: dragged toward the boss
                        self.launch(b, u, b.x - u.x, b.y - u.y, tg["pull"], 0.55)
                    if tg.get("freeze") and u.alive:
                        self.freeze(u, tg["freeze"])
                    if tg.get("burn") and u.alive:
                        u.dots.append({"src": b, "dps": tg["burn"], "until": t + 2.0, "next": t + POISON_TICK})

    def _cast(self, b, sk, heroes, t):
        """Wind up a boss skill: a warning zone now, the hit when the warning runs out."""
        target = self.rng.choice(heroes)
        ang = math.atan2(target.y - b.y, target.x - b.x)
        warn = float(sk.get("warn", 0.85))
        base = {"name": sk["name"], "t0": t, "t_hit": t + warn, "dmg": float(sk.get("dmg", 8)),
                "launch": sk.get("launch"), "freeze": sk.get("freeze"), "burn": sk.get("burn"), "fx": sk.get("fx"),
                "pull": sk.get("pull")}
        kind = sk["type"]
        if kind == "cone":
            self.telegraphs.append(dict(base, kind="cone", x=b.x, y=b.y, ang=ang,
                                        range=float(sk.get("range", 600)), half=float(sk.get("half", 30))))
        elif kind == "beam":
            n = int(sk.get("count", 1))
            for i in range(n):
                if sk.get("origin") == "edge":    # e.g. kraken tentacles slam in from the arena edge
                    tgt = heroes[i % len(heroes)] if n > 1 else target
                    edge = self.rng.randrange(4)
                    ox = (self.rng.uniform(80, self.W - 80) if edge < 2 else (0.0 if edge == 2 else self.W))
                    oy = ((0.0 if edge == 0 else self.H) if edge < 2 else self.rng.uniform(80, self.H - 80))
                    a = math.atan2(tgt.y - oy, tgt.x - ox)
                else:                             # fan of beams from the boss (laser sweep)
                    ox, oy = b.x, b.y
                    a = ang + (i - (n - 1) / 2) * math.radians(float(sk.get("spread", 30)))
                self.telegraphs.append(dict(base, kind="beam", x=ox, y=oy, ang=a, t_hit=base["t_hit"] + 0.1 * i,
                                            len=float(sk.get("len", 1200)), width=float(sk.get("width", 90))))
        elif kind == "nova":
            self.telegraphs.append(dict(base, kind="nova", x=b.x, y=b.y, r=float(sk.get("r", 330)) * b.stat("size")))
        elif kind == "meteors":
            spots = [(h.x, h.y) for h in heroes]
            while len(spots) < int(sk.get("count", 5)):
                spots.append((self.rng.uniform(100, self.W - 100), self.rng.uniform(100, self.H - 100)))
            for i, (x, y) in enumerate(spots):
                self.telegraphs.append(dict(base, kind="circle", x=x, y=y, r=float(sk.get("r", 90)),
                                            t_hit=t + warn + 0.12 * i))
        elif kind == "summon":
            for i in range(int(sk.get("count", 3))):
                a = self.rng.uniform(0, 2 * math.pi)
                x = min(max(b.x + math.cos(a) * (b.radius + 80), 60), self.W - 60)
                y = min(max(b.y + math.sin(a) * (b.radius + 80), 60), self.H - 60)
                self.telegraphs.append(dict(base, kind="summon_spot", x=x, y=y, r=40.0,
                                            t_hit=t + 0.6, minion=sk["minion"]))
        self.emit("boss_skill", unit=b.uid, name=sk["name"], skill_type=kind, x=b.x, y=b.y)

    def _per_frame(self, dt):
        t = self.t
        self._aim_blades()
        if self.boss_mode:
            self._boss_tick(t)
        if self.horde:
            self._horde_spawn(t)
        if self.soccer:
            for rt, m in list(self.respawns):
                if t >= rt:
                    self.respawns.remove((rt, m))
                    x, y = self._free_spot(self.rng.uniform(0.2, 0.8), self.rng.uniform(0.2, 0.8), m.radius + 10)
                    m.alive, m.hp, m.x, m.y = True, m.max_hp, x, y
                    m.buffs, m.dots, m.died_at = [], [], None
                    m.frozen_until = m.launch_until = -1.0
                    a = self.rng.uniform(0, 2 * math.pi)
                    m.vx, m.vy = math.cos(a) * m.stat("speed"), math.sin(a) * m.stat("speed")
                    self.emit("respawn", unit=m.uid, x=x, y=y)
            if not self.golden and t >= self.regulation:
                if self.score[0] == self.score[1]:
                    self.golden = True
                    self.emit("golden_goal")
                else:
                    self.done = True
                    self.winner_side = 0 if self.score[0] > self.score[1] else 1
                    self.emit("victory", side=self.winner_side)
                    return
        if self._next_item is not None and t >= self._next_item:
            cfg = self.items_cfg
            self._next_item = t + float(cfg.get("every", 2.5))
            if len(self.items) < int(cfg.get("max", 3)):
                sr = self.storm_radius(t) or 1e9
                for _ in range(20):
                    a = self.rng.uniform(0, 2 * math.pi)
                    d = self.rng.uniform(0, min(sr - 60, self.W * 0.42))
                    x, y = self.W / 2 + math.cos(a) * d, self.H / 2 + math.sin(a) * d
                    if 40 < x < self.W - 40 and 40 < y < self.H - 40 and not self._blocked(x, y, 40):
                        if cfg.get("weights"):
                            ks = sorted(cfg["weights"])
                            kind = self.rng.choices(ks, [cfg["weights"][k] for k in ks])[0]
                        else:
                            kind = self.rng.choice(cfg.get("kinds", list(ITEMS)))
                        self.items.append({"kind": kind, "x": x, "y": y, "t": t, "alive": True})
                        self.emit("item_spawn", kind=kind, x=x, y=y, tier=ITEMS[kind].get("tier", "common"))
                        break
        for u in self._alive():
            # steering toward (seek > 0) or away from (seek < 0, kiting) the nearest enemy
            seek = u.stat("seek") if t >= u.launch_until and t >= u.frozen_until else 0.0   # not mid-air / frozen
            seek *= self.slippery   # ice rink: everyone slides
            if self.boss_mode and u.side == 0 and t >= u.launch_until and t >= u.frozen_until:
                for tg in self.telegraphs:
                    if tg["kind"] != "summon_spot" and tg["t_hit"] - t < 0.5 and self._in_telegraph(tg, u.x, u.y, u.radius):
                        if tg["kind"] in ("circle", "nova"):
                            want = math.atan2(u.y - tg["y"], u.x - tg["x"])
                        else:   # sidestep out of the cone / beam
                            side_ = 1 if (-(u.x - tg["x"]) * math.sin(tg["ang"]) + (u.y - tg["y"]) * math.cos(tg["ang"])) >= 0 else -1
                            want = tg["ang"] + side_ * math.pi / 2
                        have = math.atan2(u.vy, u.vx)
                        diff = (want - have + math.pi) % (2 * math.pi) - math.pi
                        turn = max(-math.radians(400) * dt, min(math.radians(400) * dt, diff))
                        sp = math.hypot(u.vx, u.vy)
                        u.vx, u.vy = math.cos(have + turn) * sp, math.sin(have + turn) * sp
                        seek = 0.0
                        break
            if self.soccer and u.is_main and t >= u.launch_until and t >= u.frozen_until:
                tx, ty = self._soccer_target(u)
                want = math.atan2(ty - u.y, tx - u.x)
                have = math.atan2(u.vy, u.vx)
                diff = (want - have + math.pi) % (2 * math.pi) - math.pi
                turn = max(-math.radians(320) * dt, min(math.radians(320) * dt, diff))
                sp = math.hypot(u.vx, u.vy)
                u.vx, u.vy = math.cos(have + turn) * sp, math.sin(have + turn) * sp
                seek = 0.0
            sr = self.storm_radius(t) if self.storm else None
            outside = sr is not None and math.hypot(u.x - self.W / 2, u.y - self.H / 2) > sr - u.radius
            if outside:   # get back inside the storm ring before anything else
                want = math.atan2(self.H / 2 - u.y, self.W / 2 - u.x)
                have = math.atan2(u.vy, u.vx)
                diff = (want - have + math.pi) % (2 * math.pi) - math.pi
                turn = max(-math.radians(260) * dt, min(math.radians(260) * dt, diff))
                sp = math.hypot(u.vx, u.vy)
                u.vx, u.vy = math.cos(have + turn) * sp, math.sin(have + turn) * sp
                seek = 0.0
            if seek != 0:
                e = self.nearest_enemy(u)
                if e is not None:
                    want = math.atan2(e.y - u.y, e.x - u.x)
                    if seek < 0:
                        want += math.pi
                        seek = -seek
                    have = math.atan2(u.vy, u.vx)
                    diff = (want - have + math.pi) % (2 * math.pi) - math.pi
                    turn = max(-math.radians(seek) * dt, min(math.radians(seek) * dt, diff))
                    sp = math.hypot(u.vx, u.vy)
                    u.vx, u.vy = math.cos(have + turn) * sp, math.sin(have + turn) * sp

            # timers
            for a in u.abilities:
                if a.get("on") == "timer" and a["_next"] is not None:
                    while u.alive and t >= a["_next"]:
                        a["_next"] += float(a["every"])
                        self._run_ability(u, a, None)

            # meter
            m = u.meter
            if m and u.meter_active_until <= t:
                self._add_meter(u, float(m.get("per_second", 0)) * dt)

            # storm and lava
            if outside:
                self.env_damage(u, float(self.storm.get("dps", 6)) * dt, "storm")
            for hz in self.hazards:
                if not u.alive:
                    break
                kind = hz.get("type", "lava")
                d = math.hypot(u.x - hz["x"], u.y - hz["y"])
                if kind == "mine":
                    if hz.get("alive", True) and d < hz["r"] + u.radius:
                        hz["alive"] = False
                        self.emit("mine", x=hz["x"], y=hz["y"], unit=u.uid)
                        for e in self.units:
                            if e.alive and math.hypot(e.x - hz["x"], e.y - hz["y"]) < float(hz.get("blast", 150)) + e.radius:
                                self.launch(u, e, e.x - hz["x"], e.y - hz["y"], 2.4, 0.5)
                                self.env_damage(e, float(hz.get("damage", 10)), "mine")
                    continue
                if d >= hz["r"] + u.radius * 0.4:
                    continue
                if kind in ("lava", "fire"):
                    self.env_damage(u, float(hz.get("dps", 8)) * dt, kind)
                elif kind == "fog":
                    u.slow_until, u.slow_mult = t + 0.1, float(hz.get("slow", 0.6))
                    self.env_damage(u, float(hz.get("dps", 3)) * dt, "fog")
                elif kind == "wind":   # gusts steer you along the wind
                    want, have = float(hz["dir"]), math.atan2(u.vy, u.vx)
                    diff = (want - have + math.pi) % (2 * math.pi) - math.pi
                    lim = math.radians(float(hz.get("turn", 240))) * dt
                    turn = max(-lim, min(lim, diff))
                    sp = math.hypot(u.vx, u.vy)
                    u.vx, u.vy = math.cos(have + turn) * sp, math.sin(have + turn) * sp
                elif kind == "ice_hole":
                    if self._cool(("ice", u.uid), float(hz.get("cooldown", 4))):
                        self.freeze(u, float(hz.get("freeze", 0.5)))
                        self.env_damage(u, float(hz.get("damage", 4)), "ice")
            # item pickups
            if self.items and u.alive and u.is_main:
                for it in self.items:
                    if it["alive"] and math.hypot(u.x - it["x"], u.y - it["y"]) < u.radius + 26:
                        it["alive"] = False
                        self.emit("pickup", unit=u.uid, kind=it["kind"], x=it["x"], y=it["y"],
                                  label=ITEMS[it["kind"]]["label"])
                        item = ITEMS[it["kind"]]
                        if item.get("heal_frac"):
                            self.heal(u, u.max_hp * item["heal_frac"])
                        if item.get("freeze_all"):
                            self.emit("freeze_all", unit=u.uid, x=u.x, y=u.y)
                            for e in self.units:
                                if e.alive and e.side != u.side:
                                    self.freeze(e, float(item["freeze_all"]))
                        if item.get("lightning"):
                            cfg_l = item["lightning"]
                            foes = sorted((e for e in self.units if e.alive and e.side != u.side and (e.is_main or self.horde)),
                                          key=lambda e: (e.x - u.x) ** 2 + (e.y - u.y) ** 2)
                            for e in foes[:int(cfg_l.get("count", 2))]:
                                self.emit("lightning", unit=e.uid, src=u.uid, x=e.x, y=e.y)
                                self.damage(u, e, float(cfg_l.get("damage", 12)), "spell")
                        for eff in item["do"]:
                            self._effect(u, eff, None)
                self.items = [it for it in self.items if it["alive"]]

            # poison ticks
            if u.dots:
                for d in u.dots:
                    while u.alive and d["next"] <= t and d["next"] <= d["until"] + 1e-9:
                        d["next"] += POISON_TICK
                        self.damage(d["src"], u, d["dps"] * POISON_TICK, "poison")
                u.dots = [d for d in u.dots if d["until"] > t]

            # buff expiry
            if u.buffs:
                keep = [b for b in u.buffs if b["until"] > t]
                if len(keep) != len(u.buffs):
                    self.emit("buff_end", unit=u.uid)
                u.buffs = keep

    # ── combat ───────────────────────────────────────────────────────────

    def damage(self, attacker, target, amount, source, hx=None, hy=None):
        if not target.alive or amount <= 0:
            return
        armor = max(0.0, min(0.9, target.stat("armor")))
        dealt = amount * (1 - armor) * attacker.stat("dmg_mult", 1.0)
        target.hp -= dealt
        target.last_hurt = self.t
        if getattr(self, "boss_mode", False) and target is getattr(self, "boss", None):
            sm = attacker.summoner
            ouid = attacker.uid if attacker.is_main or sm is None else (sm if isinstance(sm, int) else sm.uid)
            self.boss_dmg[ouid] = self.boss_dmg.get(ouid, 0.0) + dealt
        self.emit("damage", src=attacker.uid, dst=target.uid, amount=round(dealt, 3),
                  source=source, x=target.x, y=target.y,
                  hx=hx if hx is not None else target.x,
                  hy=hy if hy is not None else target.y)

        if attacker.alive:
            if source not in PASSIVE_SOURCES:
                self._trigger(attacker, "hit", target)
            self._trigger(attacker, source + "_hit", target)
            ls = attacker.stat("lifesteal")
            if ls > 0:
                self.heal(attacker, dealt * ls)
        if target.hp > 0:
            self._trigger(target, "hurt", attacker)
            frac = target.hp / target.max_hp
            for a in target.abilities:
                if a.get("on") == "hp_below" and frac < float(a.get("frac", 0.3)):
                    self._run_ability(target, a, attacker)
            th = target.stat("thorns")
            if th > 0 and source not in ("thorns", "poison") and attacker.alive:
                self.damage(target, attacker, dealt * th, "thorns")
        else:
            self._kill(target, attacker)

    def heal(self, unit, amount):
        if not unit.alive or amount <= 0:
            return
        before = unit.hp
        unit.hp = min(unit.max_hp, unit.hp + amount)
        gained = unit.hp - before
        if gained > 0:
            self.emit("heal", unit=unit.uid, amount=round(gained, 3), x=unit.x, y=unit.y)

    def _kill(self, unit, killer):
        unit.hp = 0
        unit.alive = False
        unit.died_at = self.t
        self.emit("death", unit=unit.uid, killer=killer.uid if killer else None,
                  x=unit.x, y=unit.y, main=unit.is_main)
        if self.soccer and unit.is_main:
            self.respawns.append((self.t + self.respawn_after, unit))
        if getattr(self, "boss_mode", False) and unit is getattr(self, "boss", None):
            self.telegraphs = []
            for m in [x for x in self.units if x.alive and x.side == 1]:
                m.hp, m.alive, m.died_at = 0, False, self.t
                self.emit("death", unit=m.uid, killer=None, x=m.x, y=m.y, main=False)
        if self.horde and unit.side == 1:
            self.kill_count += 1
            self.combo = self.combo + 1 if self.t - self._last_kill_t < 1.0 else 1
            self._last_kill_t = self.t
            self.max_combo = max(self.max_combo, self.combo)
            if unit.tpl.get("boss"):
                self.bosses_killed += 1
            self.emit("horde_kill", unit=unit.uid, total=self.kill_count, combo=self.combo,
                      x=unit.x, y=unit.y, boss=bool(unit.tpl.get("boss")))
            drops = self.horde_cfg.get("drops") or {}
            if (drops and len(self.items) < int(drops.get("max", 3))
                    and self.rng.random() < float(drops.get("chance", 0.07)) * (6 if unit.tpl.get("boss") else 1)):
                ks = sorted(drops["weights"])
                kind = self.rng.choices(ks, [drops["weights"][k] for k in ks])[0]
                self.items.append({"kind": kind, "x": unit.x, "y": unit.y, "t": self.t, "alive": True})
                self.emit("item_spawn", kind=kind, x=unit.x, y=unit.y, tier=ITEMS[kind].get("tier", "common"))
        if self.royale and unit.is_main:
            self.placements.append(unit.side)
            if killer is not None:
                ks = killer.side
                self.kills[ks] = self.kills.get(ks, 0) + 1
        if killer and killer.alive:
            self._trigger(killer, "kill", unit)
        self._trigger(unit, "death", killer, allow_dead=True)
        for ally in self.units:
            if ally.alive and ally.side == unit.side:
                self._trigger(ally, "ally_death", unit)
        # win is checked in _flush, after on-death summons have spawned

    def _check_win(self):
        if self.done or self.soccer:   # soccer is decided by goals, not knockouts
            return
        if self.horde:                 # survival: it's over when the hero falls
            if not self.mains[0].alive:
                self.done = True
                self.winner_side = 1
                self.emit("victory", side=1)
            return
        alive_sides = {u.side for u in self.units if u.alive}
        if len(alive_sides) < 2:
            self.done = True
            self.winner_side = alive_sides.pop() if alive_sides else None
            self.emit("victory", side=self.winner_side)

    # ── triggers & effects ───────────────────────────────────────────────

    def _add_meter(self, u, amount):
        m = u.meter
        if not m or amount <= 0 or u.meter_active_until > self.t or not u.alive                 or self.t < getattr(u, "ult_ready_at", -1.0):
            return
        u.meter_value += amount * self.meter_rate
        if u.meter_value >= float(m.get("max", 100)):
            u.meter_value = 0.0
            u.ult_ready_at = self.t + self.ult_cooldown
            u.meter_active_until = self.t + u.meter_active_len
            self.emit("ultimate", unit=u.uid, label=m.get("label", ""),
                      shout=m.get("shout", ""), x=u.x, y=u.y)
            for eff in m.get("on_full", []):
                self._effect(u, eff, None)
            self._trigger(u, "ultimate")

    def _trigger(self, u, name, other=None, allow_dead=False):
        if not u.alive and not allow_dead:
            return
        if u.meter and u.alive:
            self._add_meter(u, float(u.meter.get("per_" + name, 0)) * self.meter_event_mult)
        for a in u.abilities:
            if a.get("on") == name:
                self._run_ability(u, a, other)

    def _run_ability(self, u, a, other):
        if a.get("on") != "death" and not u.alive:
            return
        if self.t - a["_last"] < float(a.get("cooldown", 0)):
            return
        if "max_uses" in a and a["_uses"] >= int(a["max_uses"]):
            return
        if a.get("on") == "hp_below" and a["_uses"] >= 1:
            return
        if "chance" in a and self.rng.random() >= float(a["chance"]):
            return
        a["_last"] = self.t
        a["_uses"] += 1
        if a.get("name"):
            self.emit("ability", unit=u.uid, name=a["name"], x=u.x, y=u.y)
        for eff in a.get("do", []):
            self._effect(u, eff, other)

    def _targets(self, u, eff, other):
        t = eff.get("target", "self")
        if t == "self":
            return [u] if (u.alive or eff.get("type") in ("summon", "shockwave", "shoot")) else []
        if t == "other":
            return [other] if other is not None and other.alive else []
        if t == "nearest_enemy":
            e = self.nearest_enemy(u)
            return [e] if e else []
        if t == "all_enemies":
            return [e for e in self.units if e.alive and e.side != u.side]
        if t == "allies":
            return [a for a in self.units if a.alive and a.side == u.side and a is not u]
        if t == "team":
            return [a for a in self.units if a.alive and a.side == u.side]
        raise ValueError(f"unknown target {t!r}")

    def _effect(self, u, eff, other):
        kind = eff.get("type")
        if kind == "summon":
            self.pending.append(("summon", u, eff, u.x, u.y))
            return
        if kind == "shockwave":
            self.pending.append(("shockwave", u, eff, u.x, u.y))
            return
        if kind == "shoot":
            self.pending.append(("shoot", u, eff, u.x, u.y))
            return
        if kind == "add_meter":
            self._add_meter(u, self.resolve(eff.get("amount", 10), u))
            return

        # everything else applies to the effect's target(s); values come from the caster
        for tgt in self._targets(u, eff, other):
            if kind == "add_stat":
                v = tgt.base_stats.get(eff["stat"], 0.0) + self.resolve(eff.get("amount", 1), u)
                if "max" in eff:
                    v = min(v, float(eff["max"]))
                if "min" in eff:
                    v = max(v, float(eff["min"]))
                tgt.base_stats[eff["stat"]] = v
            elif kind == "mul_stat":
                v = tgt.base_stats.get(eff["stat"], 0.0) * float(eff.get("factor", 1))
                if "max" in eff:
                    v = min(v, float(eff["max"]))
                if "min" in eff:
                    v = max(v, float(eff["min"]))
                tgt.base_stats[eff["stat"]] = v
            elif kind == "heal":
                self.heal(tgt, self.resolve(eff.get("amount", 10), u))
            elif kind == "add_max_hp":
                amt = self.resolve(eff.get("amount", 10), u)
                tgt.max_hp += amt
                if eff.get("heal", True):
                    self.heal(tgt, amt)
            elif kind == "buff":
                tgt.buffs.append({
                    "stat": eff["stat"],
                    "mul": float(eff.get("mul", 1.0)),
                    "add": float(eff.get("add", 0.0)),
                    "until": self.t + float(eff.get("duration", 3)),
                    "label": eff.get("label", ""),
                })
                if tgt.side != u.side:
                    self.emit("debuff", unit=tgt.uid, stat=eff["stat"], x=tgt.x, y=tgt.y)
            elif kind == "poison":
                dur = float(eff.get("duration", 3))
                tgt.dots.append({"src": u, "dps": self.resolve(eff.get("dps", 2), u),
                                 "until": self.t + dur, "next": self.t + POISON_TICK})
                self.emit("poisoned", unit=tgt.uid, x=tgt.x, y=tgt.y)
            elif kind == "launch":
                if tgt.side != u.side:
                    self.launch(u, tgt, tgt.x - u.x, tgt.y - u.y, float(eff.get("mult", 2.5)),
                                float(eff.get("duration", 0.7)))
            elif kind == "damage":
                if tgt.side != u.side:
                    self.damage(u, tgt, self.resolve(eff.get("amount", 5), u),
                                eff.get("source", "spell"))
            else:
                raise ValueError(f"unknown effect type: {kind!r}")

    def _flush(self):
        while self.pending and not self.done:
            kind, u, eff, x, y = self.pending.pop(0)
            if kind == "summon":
                self._summon(u, eff, x, y)
            elif kind == "shockwave":
                self._shockwave(u, eff, x, y)
            elif kind == "shoot":
                self._shoot(u, eff, x, y)
        self._check_win()

    def _summon(self, src, eff, x, y):
        tpl = self.spec.get("summons", {}).get(eff["unit"])
        if tpl is None:
            raise ValueError(f"summon refers to unknown unit {eff['unit']!r}")
        tpl = dict(tpl)
        tpl.setdefault("id", eff["unit"])
        count = int(eff.get("count", 1))
        side_count = sum(1 for v in self.units if v.alive and v.side == src.side)
        count = min(count, self.max_units_per_side - side_count)
        if count <= 0:
            return
        r = float(tpl.get("radius", 30))
        ring = src.radius + r + 6
        offset = self.rng.uniform(0, 2 * math.pi)
        spawned = []
        for k in range(count):
            ang = offset + k * 2 * math.pi / count
            px = min(max(x + math.cos(ang) * ring, r), self.W - r)
            py = min(max(y + math.sin(ang) * ring, r), self.H - r)
            m = Unit(self, tpl, src.side, self.next_uid(), px, py, ang,
                     is_main=False, summoner=src.uid)
            self.units.append(m)
            spawned.append(m)
        self.emit("summon", unit=src.uid, kind=eff["unit"], count=len(spawned),
                  spawned=[m.uid for m in spawned], x=x, y=y)
        for m in spawned:
            self._trigger(m, "start")

    def _shockwave(self, src, eff, x, y):
        radius = float(eff.get("radius", 220))
        dmg = self.resolve(eff.get("damage", 0), src)
        self.emit("shockwave", unit=src.uid, x=x, y=y, radius=radius,
                  color=list(eff.get("color", [255, 255, 255])))
        for e in list(self.units):
            if not e.alive or e.side == src.side:
                continue
            d = math.hypot(e.x - x, e.y - y)
            if d - e.radius > radius:
                continue
            if eff.get("knockback", True):
                nx, ny = _norm(e.x - x, e.y - y)
                sp = math.hypot(e.vx, e.vy)
                e.vx, e.vy = nx * sp, ny * sp
            if dmg > 0:
                self.damage(src, e, dmg, "shockwave")

    def _shoot(self, u, eff, x, y):
        count = max(1, int(eff.get("count", 1)))
        aim = eff.get("aim", "nearest")
        spread = math.radians(float(eff.get("spread", 0 if count == 1 else 30)))
        if aim == "ring":
            base = self.rng.uniform(0, 2 * math.pi)
            angles = [base + i * 2 * math.pi / count for i in range(count)]
        else:
            target = self.nearest_enemy(u) if aim == "nearest" else None
            if target is not None:
                base = math.atan2(target.y - y, target.x - x)
            elif aim == "forward":
                base = math.atan2(u.vy, u.vx)
            else:
                base = self.rng.uniform(0, 2 * math.pi)
            step = spread / (count - 1) if count > 1 else 0
            angles = [base + (i - (count - 1) / 2) * step for i in range(count)]
        speed = self.resolve(eff.get("speed", 900), u)
        dmg = self.resolve(eff.get("damage", 3), u)
        r = float(eff.get("radius", 10))
        for a in angles:
            dx, dy = math.cos(a), math.sin(a)
            start = u.radius + r + 2
            px = min(max(x + dx * start, r), self.W - r)
            py = min(max(y + dy * start, r), self.H - r)
            self.projectiles.append(Projectile(self.next_uid(), u, px, py,
                                               dx * speed, dy * speed, eff, dmg))
        self.emit("shoot", unit=u.uid, count=count, style=eff.get("style", "orb"), x=x, y=y)


def run_headless(spec, seed):
    w = World(spec, seed)
    while not w.done:
        w.step()
    return w
