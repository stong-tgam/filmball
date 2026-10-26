"""
Upload a rendered fight to YouTube (Data API v3, resumable upload).

    python tools/youtube_upload.py --auth                       # one-time Google sign-in
    python tools/youtube_upload.py out/king_vs_knight           # upload with youtube.json
    python tools/youtube_upload.py out/king_vs_knight --privacy unlisted
    python tools/youtube_upload.py out/king_vs_knight --dry-run # show what would be sent

Needs secrets/client_secret.json (an OAuth "Desktop app" client from Google Cloud);
the sign-in token is stored in secrets/youtube_token.json. Both are git-ignored.
The result (video id, URL) is written to <out dir>/upload.json; a folder that was
already uploaded is refused unless --force, so nothing gets posted twice.
"""

import argparse
import datetime
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECRETS = os.path.join(ROOT, "secrets")
CLIENT = os.path.join(SECRETS, "client_secret.json")
TOKEN = os.path.join(SECRETS, "youtube_token.json")
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
CATEGORY = {"Gaming": "20", "Entertainment": "24", "Film & Animation": "1"}


def find_client():
    """secrets/client_secret.json, or Google's default download name client_secret_<id>.json."""
    if os.path.exists(CLIENT):
        return CLIENT
    if os.path.isdir(SECRETS):
        found = sorted(f for f in os.listdir(SECRETS)
                       if f.startswith("client_secret") and f.endswith(".json"))
        if found:
            return os.path.join(SECRETS, found[0])
    return None


def credentials(interactive):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    creds = Credentials.from_authorized_user_file(TOKEN, SCOPES) if os.path.exists(TOKEN) else None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:
            creds = None
    if not creds or not creds.valid:
        if not interactive:
            sys.exit("Not signed in to YouTube: run  python tools/youtube_upload.py --auth")
        client = find_client()
        if client is None:
            sys.exit(f"No secrets/client_secret*.json found: see 'YouTube setup' in README.md")
        flow = InstalledAppFlow.from_client_secrets_file(client, SCOPES)
        creds = flow.run_local_server(port=0, prompt="consent")   # the user signs in in their browser
    os.makedirs(SECRETS, exist_ok=True)
    with open(TOKEN, "w", encoding="utf-8") as f:
        f.write(creds.to_json())
    return creds


def metadata(out_dir, privacy, publish_at=None):
    meta = json.load(open(os.path.join(out_dir, "youtube.json"), encoding="utf-8"))
    title = meta["title"]
    if "#shorts" not in title.lower() and len(title) <= 90:
        title = f"{title} #shorts"
    desc = meta.get("description", "")
    if "#shorts" not in desc.lower():
        desc += "\n\n#shorts"
    return {
        "snippet": {
            "title": title[:100],
            "description": desc[:5000],
            "tags": meta.get("tags", [])[:30],
            "categoryId": CATEGORY.get(meta.get("category", "Gaming"), "20"),
        },
        "status": {
            "privacyStatus": "private" if publish_at else (privacy or meta.get("visibility", "private")),
            "selfDeclaredMadeForKids": bool(meta.get("made_for_kids", False)),
            "embeddable": True,
            **({"publishAt": publish_at} if publish_at else {}),
        },
    }


def upload(out_dir, privacy=None, force=False, dry_run=False, log=print, publish_at=None):
    """publish_at: RFC 3339 UTC time; the video is uploaded private and YouTube makes it public then."""
    out_dir = os.path.abspath(out_dir)
    video = os.path.join(out_dir, "video.mp4")
    record = os.path.join(out_dir, "upload.json")
    if not os.path.exists(video):
        sys.exit(f"No video.mp4 in {out_dir} (render without --preview first)")
    if os.path.exists(record) and not force:
        prev = json.load(open(record, encoding="utf-8"))
        sys.exit(f"Already uploaded: {prev.get('url')} (use --force to upload again)")
    body = metadata(out_dir, privacy, publish_at)
    when = f" (goes public {publish_at})" if publish_at else ""
    log(f"Uploading {os.path.relpath(video, ROOT)} as {body['status']['privacyStatus']!r}{when}: "
        f"{body['snippet']['title']}")
    if dry_run:
        log(json.dumps(body, indent=2, ensure_ascii=False))
        return None

    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaFileUpload

    yt = build("youtube", "v3", credentials=credentials(interactive=False), cache_discovery=False)
    media = MediaFileUpload(video, mimetype="video/mp4", chunksize=4 * 1024 * 1024, resumable=True)
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    resp = None
    try:
        while resp is None:
            status, resp = req.next_chunk()
            if status:
                log(f"  {int(status.progress() * 100)}%")
    except HttpError as e:
        sys.exit(f"YouTube API error {e.resp.status}: {e.content.decode(errors='replace')[:400]}")
    vid = resp["id"]
    result = {
        "video_id": vid,
        "url": f"https://youtube.com/shorts/{vid}",
        "privacy": "public" if publish_at else resp.get("status", {}).get("privacyStatus"),
        "publish_at": publish_at,
        "title": body["snippet"]["title"],
        "uploaded_at": datetime.datetime.now().isoformat(timespec="seconds"),
    }
    with open(record, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    log(f"Uploaded: {result['url']} ({result['privacy']})")
    return result


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out_dir", nargs="?", help="a rendered fight folder, e.g. out/king_vs_knight")
    ap.add_argument("--auth", action="store_true", help="sign in to YouTube (opens your browser)")
    ap.add_argument("--privacy", choices=["private", "unlisted", "public"])
    ap.add_argument("--force", action="store_true", help="upload even if this folder was uploaded before")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.auth:
        credentials(interactive=True)
        print(f"Signed in; token saved to {os.path.relpath(TOKEN, ROOT)}")
        return
    if not args.out_dir:
        ap.error("give an out/<matchup> folder, or --auth")
    upload(args.out_dir, args.privacy, args.force, args.dry_run)


if __name__ == "__main__":
    main()
