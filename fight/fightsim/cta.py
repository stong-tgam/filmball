"""
Calls to action, kept out of the way of the fight:

- a thin "WHO WINS?" strip between the HUD and the arena for a few seconds after "FIGHT!"
  (asks for a prediction in the comments: a reason to watch to the end, never covers the fight)
- on the winner screen, once the K.O. has landed: "WHO FIGHTS NEXT? COMMENT YOUR MATCHUP!"
  and a pixel hand that clicks LIKE, then SUBSCRIBE. It plays during the existing end hold,
  so the video gets no longer.

Times are seconds; PREDICT is fight time, the rest are seconds after the fight ends.
A spec can turn them off with "cta": false.
"""

PREDICT = (0.3, 3.6)
CTA_AT = 1.0
LIKE_CLICK = 1.75
SUB_CLICK = 2.4

SOUNDS = [(CTA_AT, "summon", 1.5, 0.3),
          (LIKE_CLICK, "block", 1.7, 0.45), (LIKE_CLICK, "heal", 1.4, 0.3),
          (SUB_CLICK, "block", 1.7, 0.45), (SUB_CLICK, "ability", 1.2, 0.4)]


def enabled(spec):
    return (spec or {}).get("cta", True) is not False
