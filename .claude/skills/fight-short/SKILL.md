---
name: fight-short
description: Turn the user's fight idea ("X vs Y", or new characters described in words) into a finished ball-battle YouTube Short and upload it. Use whenever the user gives a fight prompt for the fight/ pipeline, asks to make/publish/upload a fight video, or adds a new character.
---

# Fight idea → YouTube Short

Project: `fight/` (run everything from that folder with `.venv\Scripts\python`). Read
`fight/SPEC_GUIDE.md` before writing any character.

## 1. Work out the fighters
- `python make_fight.py --list` shows the roster. Reuse roster characters when the prompt names them.
- For a **new** character write `characters/<id>.json` following SPEC_GUIDE, including:
  - `art` block (body, weapons, summons, projectiles, ultimate_icon, floor)
  - `arena` (stage name, pattern, colours)
  - `voice` block: pick a **free default** ElevenLabs voice (the API key is text-to-speech only,
    and library voices are paid): Daniel `onwK4e9ZLuTAKqWW03F9`, George `JBFqnCBsd6RMkjVDRZzb`,
    Callum `N2lVS1w4EtoT3dr4eOWO`, Liam `TX3LPaxmHKxFdv7VOQHJ`, Eric `cjVigY5qzO86Huf0OWal`,
    Roger `CwhRBWXzGAHq8TQ4Fs17`, Bill `pqHfZKP75CvOlQylNhV4`, Brian `nPczCjzI2devNBz1zQrb`,
    River `SAz9YHcvj6GT2YYXdXww`, Lily `pFZP5JQG7iQjIQuC4Bku`, Charlie `IKne3meq5aSn9XLyUdCD`,
    Chris `iP95p4xoKVk53GoZ742B`, Will `bIHbv24MWmeRgasZH58o`, Aria `9BWtsMINqrJLrRacOk9x`,
    Sarah `EXAVITQu4vr4xnSDxMaL`, Laura `FGY2WhTYpPnrIDTdsKH5`, Charlotte `XB0fDUnXU5powFXDhCwa`,
    Alice `Xb7hH8MSUJpSbSDYk0k2`, Matilda `XrExE9yKIg1WjnnlVkGX`, Jessica `cgSgspJ2msm6clMCkdW9`.
    Use `"pitch": -2..-4` for monsters. Lines: `ultimate` (the meter shout), `victory`, and
    optionally `ability`.
- Balance before rendering: `python tools/balance_roster.py --hero <id> --tune --write` gives the new
  character its fixed HP and `stats.dmg_mult` (40-60% overall, 12-18 s fights) while the rest of the
  roster stays put. Every hero keeps these stats in every video and in the game: videos never rescale HP.

## 2. Render (no upload yet)
`python publish.py <a> <b> --no-upload` generates missing voices (ElevenLabs), tries missing art
(PixelLab, free generations only, never `--allow-usd` unless the user says so), balances,
searches seeds and renders `out/<a>_vs_<b>/video.mp4` (15–25 s, with SFX, announcer, voices).

## 3. Check the video before posting
Extract 4–5 frames with the bundled ffmpeg (intro ~0.6 s, two mid-fight, the K.O., the winner
card) and look at them. Confirm duration 15–25 s and that an audio stream exists. Fix and
re-render if anything is broken (overlapping text, missing art, wrong names).

## 4. Upload
`python tools/youtube_upload.py out/<a>_vs_<b> --privacy <private|unlisted|public>`.
- Use the privacy the user asked for. If they didn't say, use the default recorded in memory, or
  private.
- The script refuses to upload the same folder twice. Only pass `--force` if the user asks for a
  re-upload.
- If it says "Not signed in", the user must run `--auth` themselves (it opens Google sign-in in
  their browser). Never handle their Google password.

## 5. Report
Run `python tools/catalog.py` after an upload so the Google Sheet catalog (https://docs.google.com/spreadsheets/d/1TQB1GIRv8a-7fQ_23MjX9HJOfsQw4-p3plOsCNeZJQk) is current.
Give the YouTube URL, the length, who won and with how much HP, and anything that fell back
(missing art, voices). Note that videos uploaded from an unverified Google Cloud project stay
**private** until the project passes YouTube's API audit.
