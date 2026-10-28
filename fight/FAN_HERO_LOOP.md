# Fan Hero Loop

Viewers comment a hero idea ("NAME + POWER"). The best ideas become real fighters and get their own
Short, credited to the viewer. **You approve twice:** once for the idea, once for the finished video.
Nothing is posted or replied to without your OK.

```
 viewer comments ──► 1. COLLECT (automatic, daily)
                     2. SCREEN  (Claude, daily report)
                     3. YOU APPROVE THE IDEA        ◄── gate 1
                     4. BUILD   (Claude, in a session)
                     5. YOU APPROVE THE VIDEO       ◄── gate 2
                     6. POST    (Claude, in that session)
                     7. REPLY   (later: once replies are switched on)
```

## 1. Collect (automatic)

- The 3:05 AM batch runs `tools/fan_ideas.py` after its uploads. You can also run it by hand:
  `.\.venv\Scripts\python.exe tools\fan_ideas.py`
- It reads new top-level comments on every channel video (read-only sign-in) and sorts them:
  - **idea:** looks like a hero idea
  - **flagged:** names a real person or famous character, has bad words or a link
  - **chatter:** everything else
- Results: `fan/ideas.json` (local, git-ignored) and the private Google Sheet
  **"Pixel Hero Fights — Fan Hero Ideas"**.
- See the queue: `.\.venv\Scripts\python.exe tools\fan_ideas.py --list`

## 2. Screen (Claude, daily report)

A scheduled Claude task (**fan-hero-daily-check**, 9:00 AM) collects again and checks each new
**idea** against these rules, then sends you a short report. It only reads and reports.

| Check | Rule |
|---|---|
| Real people | ❌ Never: politicians, celebrities, streamers, the commenter's friends |
| Other people's characters | ⚠️ Not a copy of famous IP (Goku, Mario, Spider-Man...): build the closest homage (name echo, colours, setting) without its trademark details, e.g. "Ultraman shoot donut" → Ultra Donutman |
| Content | ❌ No hate, sexual content, drugs, gore, self-harm, politics, bullying |
| Fit | ✅ A fighter that works as a round pixel ball with one clear gimmick |
| Buildable | ✅ The power maps to sim effects (SPEC_GUIDE.md), or a close version of it |
| New | ✅ Not a copy of an existing hero's mechanic |

For each idea the report gives: who sent it, the comment, a **verdict** (recommend / maybe /
reject + why) and a one-line sketch of how it would play ("Toaster Knight: a spinning toaster
that shoots burning toast; toast burns for 2 s").

Ideas that break a rule are marked rejected with a note:
`tools\fan_ideas.py --set <comment id> rejected --note "famous character"`

## 3. You approve the idea (gate 1)

Read the report, or the Sheet. Then tell Claude in a session, for example:
*"Build Toaster Knight from @viewer's comment."* You can tweak it ("make it faster", "ult should freeze").

## 4. Build (Claude, in a session)

Claude follows the **fan-hero** skill (`.claude/skills/fan-hero`), the fight-short character
rules and `SPEC_GUIDE.md`:
1. Writes `characters/<id>.json` from the viewer's idea.
2. Runs `.\.venv\Scripts\python.exe tools\fan_hero.py build <comment id> <id>`, which:
   - adds `"fan": {"by": "@viewer", "comment_id": ...}` to the hero file. That puts the credit in the
     title ("(idea by @viewer)"), the description and an on-screen strip.
   - generates the art with PixelLab key 3 (2 variants each), a home stage map and the voice lines
     (free ElevenLabs voice)
   - gives it fixed HP and damage against the roster (`tools/balance_roster.py`: 40-60% wins, ~15 s
     fights). If the mechanics can't get there (30-70% hard limit), Claude tunes them and re-runs with `--no-art`.
   - keeps the hero out of the daily batch (`draft`) until its own Short is posted
   - picks the closest matchup as the opponent (or `--opponent <id>`), renders the Short and checks
     its length and audio
   - saves frames and marks the comment `building` ("video ready")
3. Keeps the better art variants, then shows you the video and its title.

## 5. You approve the video (gate 2)

Watch it. Say **"post it"**, or ask for changes ("different opponent", "redo the art").

## 6. Post (Claude, in that session)

- `.\.venv\Scripts\python.exe tools\fan_hero.py post <comment id>` uploads it publicly **right away**, not
  through the daily queue. It also adds it to the playlist, updates the catalog Sheet, and marks the
  comment `posted` with the link. Add `--dry-run` to see the title and description without posting.
- The new hero joins the roster, so the daily batch can use it in later videos.

## 7. Reply to the viewer (later)

Off for now. When you want it, sign in once so the channel can post replies:
`.\.venv\Scripts\python.exe tools\fan_ideas.py --auth-reply`

After that, step 6 ends with a reply you've approved, for example:
*"Your hero is LIVE! 🎉 Toaster Knight vs Wizard: <link> Thanks for the idea!"*
`tools\fan_ideas.py --reply <comment id> "<text>"` (this also marks the comment `replied`)

## Statuses in the Sheet

`idea` → `building` → `posted` → `replied`. The other statuses are `flagged` (a human decides),
`rejected` (with a note) and `chatter`.

## Telling viewers

- New renders end with **"CREATE A HERO! COMMENT: NAME + POWER"**, and every description has the
  #FanHeroFriday invite.
- The channel comments on every public video, once: *"🎨 Create your own hero! Comment a NAME + POWER,
  for example: "Toaster Knight: shoots burning toast." We build the best ideas into real fighters, and
  the fight video goes up on this channel with your name on it! 👇"*
  The 3:05 AM batch does this for videos that have gone public (scheduled ones get it the night after they
  release). By hand: `tools\fan_ideas.py --invite` (all), `--invite <video id>`, `--dry-run`. Posted ones are
  kept in `fan/invites.json`, and the collector skips them. Pin it yourself where you like (the API can't pin).

## No comments yet?

Post test ideas from your own account. The collector keeps them, with `by_owner: true`.
