"""
Collect fan hero ideas from comments on the channel's videos.

    python tools/fan_ideas.py              # fetch new comments, update fan/ideas.json + the Google Sheet
    python tools/fan_ideas.py --list       # show the idea queue (newest first)
    python tools/fan_ideas.py --offline    # just rebuild the CSV / Sheet from fan/ideas.json

    python tools/fan_ideas.py --set <comment id> rejected --note "why"   # change a status by hand

Every top-level comment is kept once (by comment id). Each gets a status:
  idea      looks like a hero idea ("NAME + POWER", "hero: ...", mentions a power / ability)
  flagged   names a real person or a famous character, or has bad words / a link: a human decides
  chatter   everything else (predictions, "nice video", ...)
and then, as the fan-hero loop (tools/fan_hero.py, .claude/skills/fan-hero) works through it:
  rejected  screened out (with a note)    building   picked, hero being made
  posted    the fan-hero Short is live    replied    the viewer got a reply with the link
Comment text and handles stay local (fan/ is git-ignored) and in the private Sheet.

Sign in once with  python tools/fan_ideas.py --auth-reply  (secrets/youtube_reply_token.json): reading comments,
replies and the create-a-hero invites all use it (the read-only --auth scope can't read comments). The Sheet uses
the Drive sign-in of tools/catalog.py.
"""

import argparse
import csv
import datetime
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
FAN = os.path.join(ROOT, "fan")
IDEAS = os.path.join(FAN, "ideas.json")
CSV_PATH = os.path.join(FAN, "ideas.csv")
SHEET_STATE = os.path.join(ROOT, "secrets", "drive_fan_ideas.json")
SHEET_NAME = "Pixel Hero Fights — Fan Hero Ideas"
TOKEN = os.path.join(ROOT, "secrets", "youtube_comments_token.json")
SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]        # reading comments
REPLY_TOKEN = os.path.join(ROOT, "secrets", "youtube_reply_token.json")
REPLY_SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]  # posting replies (separate sign-in)
INVITES = os.path.join(FAN, "invites.json")   # video id -> the channel's create-a-hero comment id
INVITE_TEXT = ("🎨 Create your own hero! Comment a NAME + POWER, for example: \"Toaster Knight: shoots burning "
               "toast.\" We build the best ideas into real fighters, and the fight video goes up on this channel "
               "with your name on it! 👇")
MAX_PAGES = 10                 # 100 comments a page, 1 quota unit each

IDEA_WORDS = re.compile(r"\b(hero|power|powers|ability|abilities|skill|ult|ultimate|attack|weapon|shoots?|summons?|"
                        r"throws?|spins?|freez\w*|heals?|explod\w*|laser|fire|ice|poison|tongue|sword|magic|"
                        r"character|fighter|create|make)\b", re.I)
IDEA_SHAPE = re.compile(r"(\w[\w' -]{1,30}\s*[:+\-–—=]\s*\w)|(\bwho\b.*\b(can|could|that)\b)", re.I)
# names that mean a real person or someone else's character: always a human decision
FLAG_NAMES = re.compile(r"\b(trump|biden|obama|putin|musk|elon|kim jong|hitler|stalin|taylor swift|mrbeast|"
                        r"goku|vegeta|naruto|luffy|pikachu|pokemon|mario|luigi|sonic|spider-?man|batman|superman|"
                        r"iron ?man|hulk|thanos|deadpool|minecraft|steve|fortnite|roblox|shrek|mickey|elsa|"
                        r"skibidi|among us|kirby|link|zelda|master chief|kratos|ultraman|godzilla|gundam|"
                        r"one punch|saitama|doraemon|transformers?|optimus|power rangers?)\b", re.I)
BAD_WORDS = re.compile(r"\b(n[i1]gg\w*|f[a@]g\w*|r[e3]tard\w*|k[i1]ll yourself|kys|nazi|porn|sex\w*|nude\w*|"
                       r"rape\w*|cocaine|meth|weed)\b", re.I)


def classify(text):
    t = " ".join(text.split())
    if len(t) < 6:
        return "chatter", ""
    looks = bool(IDEA_WORDS.search(t)) and (bool(IDEA_SHAPE.search(t)) or len(t.split()) >= 5)
    why = []
    if FLAG_NAMES.search(t):
        why.append("real person / famous character")
    if BAD_WORDS.search(t):
        why.append("bad words")
    if re.search(r"https?://|www\.", t):
        why.append("link")
    if "bad words" in why or (why and (looks or IDEA_WORDS.search(t))):
        return "flagged", ", ".join(why)
    return ("idea" if looks else "chatter"), ", ".join(why)


def _load():
    try:
        return json.load(open(IDEAS, encoding="utf-8"))
    except (OSError, ValueError):
        return {"comments": {}, "last_run": None}


def _save(db):
    os.makedirs(FAN, exist_ok=True)
    tmp = IDEAS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=1, ensure_ascii=False)
    os.replace(tmp, IDEAS)


def _video_titles():
    """video id -> our title, from the local upload records (saves API quota)."""
    out = {}
    for name in os.listdir(os.path.join(ROOT, "out")):
        try:
            up = json.load(open(os.path.join(ROOT, "out", name, "upload.json"), encoding="utf-8"))
            out[up["video_id"]] = up.get("title", name)
        except (OSError, ValueError, KeyError):
            pass
    return out


def credentials(interactive=False, token=TOKEN, scopes=SCOPES):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from tools.youtube_upload import find_client
    creds = None
    if os.path.exists(token):
        granted = json.load(open(token, encoding="utf-8")).get("scopes") or []
        if set(scopes) <= set(granted):
            creds = Credentials.from_authorized_user_file(token, scopes)
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:
            creds = None
    if not creds or not creds.valid:
        if not interactive:
            return None
        creds = InstalledAppFlow.from_client_secrets_file(find_client(), scopes).run_local_server(port=0, prompt="consent")
    with open(token, "w", encoding="utf-8") as f:
        f.write(creds.to_json())
    return creds


def _channel_videos(yt, ch=None):
    """Every video id on the channel, newest first (from its uploads playlist)."""
    ch = ch or yt.channels().list(part="id,contentDetails", mine=True).execute()["items"][0]
    uploads = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    videos, page = [], None
    while True:
        r = yt.playlistItems().list(part="contentDetails", playlistId=uploads, maxResults=50, pageToken=page).execute()
        videos += [it["contentDetails"]["videoId"] for it in r.get("items", [])]
        page = r.get("nextPageToken")
        if not page:
            return videos


def _record(cid, vid, s, me, titles, parent=None):
    status, why = classify(s.get("textDisplay", ""))
    rec = {
        "id": cid, "video_id": vid, "video": titles.get(vid, ""),
        "author": s.get("authorDisplayName", ""),
        "author_channel": (s.get("authorChannelId") or {}).get("value", ""),
        "by_owner": (s.get("authorChannelId") or {}).get("value") == me,
        "text": s.get("textDisplay", ""), "likes": s.get("likeCount", 0),
        "published": s.get("publishedAt", ""), "status": status, "why": why,
        "fetched": datetime.datetime.now().isoformat(timespec="seconds"),
    }
    if parent:
        rec["parent"] = parent           # a reply under the channel's own comment
    return rec


def fetch(db, log=print):
    """Pull top-level comments on all the channel's videos, newest first, until known ones,
    plus viewers' replies under the channel's invites and fan tags."""
    from googleapiclient.discovery import build
    # the read-only scope can't read comments at all (403), so this uses the channel sign-in
    creds = credentials(interactive=False, token=REPLY_TOKEN, scopes=REPLY_SCOPES)
    if creds is None:
        log("fan ideas: YouTube not connected (run: python tools/fan_ideas.py --auth-reply)")
        return 0
    yt = build("youtube", "v3", credentials=creds, cache_discovery=False)
    ch = yt.channels().list(part="id,contentDetails", mine=True).execute()["items"][0]
    me = ch["id"]
    videos = _channel_videos(yt, ch)
    titles = _video_titles()
    seen, new = db["comments"], 0
    ours = set(_invites().values()) | set(db.get("own_comments", []))   # the channel's invites + fan tags
    page = None
    for _ in range(MAX_PAGES):           # every comment on the channel, newest first: 1 unit / 100
        r = yt.commentThreads().list(part="snippet", allThreadsRelatedToChannelId=me, maxResults=100,
                                     order="time", textFormat="plainText", pageToken=page).execute()
        stop = False
        for th in r.get("items", []):
            top, vid = th["snippet"]["topLevelComment"], th["snippet"].get("videoId", "")
            cid, s = top["id"], top["snippet"]
            if cid in seen:
                stop = True              # newest first: everything after this is known
                continue
            if cid in ours:
                continue
            seen[cid] = _record(cid, vid, s, me, titles)
            new += 1
        page = r.get("nextPageToken")
        if stop or not page:
            break
    # viewers often answer the create-a-hero invite (or a fan tag) with a reply: read those threads too
    vid_of = {c: v for v, c in _invites().items()}
    for pid in ours:                     # 1 unit each
        try:
            r = yt.comments().list(part="snippet", parentId=pid, maxResults=100, textFormat="plainText").execute()
        except Exception:                # deleted or hidden
            continue
        for rp in r.get("items", []):
            cid, s = rp["id"], rp["snippet"]
            if cid in seen or (s.get("authorChannelId") or {}).get("value") == me:
                continue
            seen[cid] = _record(cid, s.get("videoId") or vid_of.get(pid, ""), s, me, titles, parent=pid)
            new += 1
    db["last_run"] = datetime.datetime.now().isoformat(timespec="seconds")
    db["videos_checked"] = len(videos)
    return new


def write_sheet(db, log=print):
    """fan/ideas.csv (ideas first, then flagged, then chatter) pushed to a private Google Sheet."""
    order = {"idea": 0, "flagged": 1, "building": 2, "posted": 3, "replied": 4, "rejected": 5, "chatter": 6}
    rows = sorted(db["comments"].values(), key=lambda c: (order.get(c["status"], 9), c["published"]), reverse=False)
    rows = sorted(rows, key=lambda c: order.get(c["status"], 9))
    cols = ["status", "why", "note", "author", "text", "likes", "video", "hero", "url", "published", "id"]
    os.makedirs(FAN, exist_ok=True)
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for c in rows:
            w.writerow([c.get(k, "") for k in cols])
    try:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseUpload
        from tools.catalog import credentials
        creds = credentials(interactive=False)
        if creds is None:
            log("fan ideas: saved fan/ideas.csv (Drive not connected: run tools/catalog.py --auth)")
            return None
        drive = build("drive", "v3", credentials=creds, cache_discovery=False)
        media = MediaIoBaseUpload(io.BytesIO(open(CSV_PATH, "rb").read()), mimetype="text/csv", resumable=False)
        try:
            file_id = json.load(open(SHEET_STATE, encoding="utf-8"))["file_id"]
            drive.files().update(fileId=file_id, media_body=media).execute()
        except (OSError, ValueError, KeyError):
            meta = {"name": SHEET_NAME, "mimeType": "application/vnd.google-apps.spreadsheet"}
            file_id = drive.files().create(body=meta, media_body=media, fields="id").execute()["id"]
            with open(SHEET_STATE, "w", encoding="utf-8") as f:
                json.dump({"file_id": file_id}, f)
        return f"https://docs.google.com/spreadsheets/d/{file_id}"
    except Exception as e:          # never break the batch over the sheet
        log(f"fan ideas: Sheet sync failed ({e}); fan/ideas.csv is up to date")
        return None


def set_status(cid, status, log=print, **fields):
    """Move one comment along the loop (and save + sync the Sheet)."""
    db = _load()
    c = db["comments"].get(cid)
    if c is None:
        raise SystemExit(f"no comment {cid!r} in fan/ideas.json")
    c["status"] = status
    c.update({k: v for k, v in fields.items() if v is not None})
    c["updated"] = datetime.datetime.now().isoformat(timespec="seconds")
    _save(db)
    write_sheet(db, log=log)
    return c


def reply(cid, text, log=print):
    """Reply to a viewer's comment from the channel. Returns the reply id."""
    from googleapiclient.discovery import build
    creds = credentials(interactive=False, token=REPLY_TOKEN, scopes=REPLY_SCOPES)
    if creds is None:
        raise SystemExit("replies not connected (run: python tools/fan_ideas.py --auth-reply)")
    yt = build("youtube", "v3", credentials=creds, cache_discovery=False)
    c = _load()["comments"].get(cid) or {}
    parent = c.get("parent") or cid      # YouTube threads are one level deep: reply under the top comment
    if c.get("parent") and c.get("author") and c["author"] not in text:
        text = f"{c['author']} {text}"   # mention them so they get notified
    r = yt.comments().insert(part="snippet", body={"snippet": {"parentId": parent, "textOriginal": text}}).execute()
    log(f"replied to {cid}: {text}")
    return r["id"]


def _invites():
    try:
        return json.load(open(INVITES, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def invite(only=None, dry_run=False, log=print):
    """Post INVITE_TEXT once on every public channel video that doesn't have it yet (or just `only`).
    Scheduled uploads are still private, so they get it on a later run. Never raises."""
    try:
        from googleapiclient.discovery import build
        from googleapiclient.errors import HttpError
        creds = credentials(interactive=False, token=REPLY_TOKEN, scopes=REPLY_SCOPES)
        if creds is None:
            log("invites: not connected (run: python tools/fan_ideas.py --auth-reply)")
            return 0
        yt = build("youtube", "v3", credentials=creds, cache_discovery=False)
        done = _invites()
        todo = [only] if only else [v for v in _channel_videos(yt) if v not in done]
        public = set()
        for i in range(0, len(todo), 50):
            r = yt.videos().list(part="status", id=",".join(todo[i:i + 50])).execute()
            public |= {v["id"] for v in r.get("items", []) if v["status"]["privacyStatus"] == "public"}
        posted = 0
        for vid in todo:
            if vid in done or vid not in public:
                continue
            if dry_run:
                log(f"invites: would comment on {vid}")
                continue
            try:
                r = yt.commentThreads().insert(part="snippet", body={"snippet": {
                    "videoId": vid, "topLevelComment": {"snippet": {"textOriginal": INVITE_TEXT}}}}).execute()
            except HttpError as e:      # comments off, or still processing: try again next run
                log(f"invites: {vid} skipped ({e.resp.status})")
                continue
            done[vid] = r["snippet"]["topLevelComment"]["id"]
            os.makedirs(FAN, exist_ok=True)
            with open(INVITES, "w", encoding="utf-8") as f:
                json.dump(done, f, indent=1)
            posted += 1
        log(f"invites: posted on {posted} video(s); {len(done)} have it")
        return posted
    except Exception as e:
        log(f"invites: failed ({e})")
        return 0


def tag_fan(video_id, author, idea, log=print, verb="created"):
    """On a fan hero's Short: a channel comment crediting the viewer (and inviting the next idea)."""
    from googleapiclient.discovery import build
    creds = credentials(interactive=False, token=REPLY_TOKEN, scopes=REPLY_SCOPES)
    if creds is None:
        log("tag: not connected (run: python tools/fan_ideas.py --auth-reply)")
        return None
    yt = build("youtube", "v3", credentials=creds, cache_discovery=False)
    short = idea if len(idea) <= 90 else idea[:87] + "..."
    text = (f"⭐ This hero was {verb} by {author}! Their idea: \"{short}\" "
            "Want YOUR hero in the next fight? Comment a NAME + POWER below! 👇")
    r = yt.commentThreads().insert(part="snippet", body={"snippet": {
        "videoId": video_id, "topLevelComment": {"snippet": {"textOriginal": text}}}}).execute()
    cid = r["snippet"]["topLevelComment"]["id"]
    db = _load()
    db.setdefault("own_comments", []).append(cid)
    _save(db)
    log(f"tagged {author} on {video_id}")
    return cid


def pending(limit=None):
    """Ideas waiting to be screened, oldest first (first come, first served)."""
    ideas = sorted((c for c in _load()["comments"].values() if c["status"] == "idea"), key=lambda c: c["published"])
    return ideas[:limit] if limit else ideas


def collect(log=print):
    """Fetch + save + Sheet. Safe to call from the daily batch: never raises."""
    try:
        db = _load()
        new = fetch(db, log=log)
        _save(db)
        url = write_sheet(db, log=log)
        n = sum(1 for c in db["comments"].values() if c["status"] == "idea")
        f = sum(1 for c in db["comments"].values() if c["status"] == "flagged")
        log(f"fan ideas: {new} new comment(s); queue: {n} idea(s), {f} flagged" + (f" -> {url}" if url else ""))
        return db
    except Exception as e:
        log(f"fan ideas: failed ({e})")
        return None


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--auth", action="store_true", help="sign in to YouTube, read-only (opens your browser)")
    ap.add_argument("--auth-reply", action="store_true", help="sign in so the channel can reply to comments")
    ap.add_argument("--reply", nargs=2, metavar=("COMMENT_ID", "TEXT"), help="reply to one comment (after approval)")
    ap.add_argument("--list", action="store_true", help="print the idea queue")
    ap.add_argument("--offline", action="store_true", help="don't fetch; just rebuild the CSV / Sheet")
    ap.add_argument("--set", nargs=2, metavar=("COMMENT_ID", "STATUS"), help="set a comment's status")
    ap.add_argument("--note", help="with --set: why")
    ap.add_argument("--pending", action="store_true", help="print the ideas waiting to be screened, as JSON")
    ap.add_argument("--invite", nargs="?", const="all", metavar="VIDEO_ID",
                    help="post the create-a-hero comment on one video, or on every public video without it")
    ap.add_argument("--dry-run", action="store_true", help="with --invite: list the videos, post nothing")
    a = ap.parse_args()
    if a.invite:
        invite(only=None if a.invite == "all" else a.invite, dry_run=a.dry_run)
        return
    if a.set:
        c = set_status(a.set[0], a.set[1], note=a.note)
        print(f"{c['id']}: {c['status']}")
        return
    if a.pending:
        print(json.dumps(pending(), indent=1, ensure_ascii=False))
        return
    if a.auth:
        credentials(interactive=True)
        print("signed in: comments can be read now")
        return
    if a.auth_reply:
        credentials(interactive=True, token=REPLY_TOKEN, scopes=REPLY_SCOPES)
        print("signed in: the channel can reply to comments now")
        return
    if a.reply:
        rid = reply(a.reply[0], a.reply[1])
        set_status(a.reply[0], "replied", reply_id=rid)
        return
    if a.list:
        db = _load()
        for c in sorted(db["comments"].values(), key=lambda c: c["published"], reverse=True):
            if c["status"] in ("idea", "flagged"):
                print(f"[{c['status']}{': ' + c['why'] if c['why'] else ''}] {c['author']}: {c['text'][:140]}")
        return
    if a.offline:
        print(write_sheet(_load()) or "fan/ideas.csv written")
        return
    collect()


if __name__ == "__main__":
    main()
