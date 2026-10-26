"""
Video catalog: one row per uploaded fight, kept as out/catalog.csv and synced to
a Google Sheet ("Pixel Hero Fights — Video Catalog") in your Google Drive.

    python tools/catalog.py --auth      # one-time: allow access to files this app creates
    python tools/catalog.py             # rebuild the CSV and sync it to Drive

Uses the same OAuth client as the YouTube uploader (secrets/client_secret*.json),
with the narrow drive.file scope: it can only see files it created itself.
"""

import csv
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from tools.youtube_upload import SECRETS, find_client  # noqa: E402

CSV_PATH = os.path.join(ROOT, "out", "catalog.csv")
TOKEN = os.path.join(SECRETS, "drive_token.json")
STATE = os.path.join(SECRETS, "drive_catalog.json")      # remembers the Sheet's file id
SCOPES = ["https://www.googleapis.com/auth/drive.file"]
SHEET_NAME = "Pixel Hero Fights — Video Catalog"
COLUMNS = ["status", "rendered_at", "uploaded_at", "publish_at", "title", "url", "privacy", "left", "right", "stage", "winner",
           "winner_hp", "lead_changes", "fight_seconds", "seed", "folder"]


def _load(path):
    try:
        return json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _status(up):
    """queued / scheduled (uploaded, waiting for its release time) / uploaded (public)."""
    import datetime
    if not up:
        return "queued"
    pa = up.get("publish_at")
    if pa and datetime.datetime.fromisoformat(pa.replace("Z", "+00:00")) > datetime.datetime.now(datetime.timezone.utc):
        return "scheduled"
    return "uploaded"


def rows():
    out_dir = os.path.join(ROOT, "out")
    result = []
    for name in sorted(os.listdir(out_dir)) if os.path.isdir(out_dir) else []:
        d = os.path.join(out_dir, name)
        up = _load(os.path.join(d, "upload.json"))
        q = _load(os.path.join(d, "queued.json"))
        if not up and not q:
            continue   # old test renders are not part of the catalog
        rep = _load(os.path.join(d, "report.json")).get("chosen", {})
        spec = _load(os.path.join(d, "spec.resolved.json"))
        fighters = spec.get("fighters", [{}, {}])
        result.append({
            "status": _status(up),
            "publish_at": up.get("publish_at") or "", "rendered_at": q.get("rendered_at", ""),
            "uploaded_at": up.get("uploaded_at", ""),
            "title": up.get("title") or _load(os.path.join(d, "youtube.json")).get("title", ""),
            "url": up.get("url", ""), "privacy": up.get("privacy", ""),
            "left": fighters[0].get("name", ""), "right": fighters[1].get("name", "") if len(fighters) > 1 else "",
            "stage": spec.get("theme", {}).get("stage", ""), "winner": rep.get("winner_name", ""),
            "winner_hp": rep.get("winner_hp", ""), "lead_changes": rep.get("lead_changes", ""),
            "fight_seconds": rep.get("duration", ""), "seed": rep.get("seed", ""), "folder": name,
        })
    result.sort(key=lambda r: (r["status"] != "uploaded", r["uploaded_at"] or r["rendered_at"]))
    return result


def write_csv(data):
    os.makedirs(os.path.dirname(CSV_PATH), exist_ok=True)
    with open(CSV_PATH, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(data)


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
            return None
        client = find_client()
        if client is None:
            sys.exit("No secrets/client_secret*.json found")
        creds = InstalledAppFlow.from_client_secrets_file(client, SCOPES).run_local_server(port=0, prompt="consent")
    with open(TOKEN, "w", encoding="utf-8") as f:
        f.write(creds.to_json())
    return creds


def sync(log=print):
    """Rebuild out/catalog.csv and push it to the Google Sheet. Never raises."""
    data = rows()
    write_csv(data)
    try:
        creds = credentials(interactive=False)
        if creds is None:
            log("catalog: saved out/catalog.csv (Drive not connected: run tools/catalog.py --auth)")
            return None
        from googleapiclient.discovery import build
        from googleapiclient.errors import HttpError
        from googleapiclient.http import MediaIoBaseUpload
        drive = build("drive", "v3", credentials=creds, cache_discovery=False)
        body = open(CSV_PATH, "rb").read()
        media = MediaIoBaseUpload(io.BytesIO(body), mimetype="text/csv", resumable=False)
        state = _load(STATE)
        file_id = state.get("file_id")
        try:
            if file_id:
                drive.files().update(fileId=file_id, media_body=media).execute()
            else:
                meta = {"name": SHEET_NAME, "mimeType": "application/vnd.google-apps.spreadsheet"}
                file_id = drive.files().create(body=meta, media_body=media, fields="id").execute()["id"]
                with open(STATE, "w", encoding="utf-8") as f:
                    json.dump({"file_id": file_id}, f)
        except HttpError as e:
            if file_id and e.resp.status == 404:      # sheet was deleted: make a new one next time
                os.remove(STATE)
            raise
        url = f"https://docs.google.com/spreadsheets/d/{file_id}"
        log(f"catalog: {len(data)} videos -> {url}")
        return url
    except Exception as e:  # the catalog must never break a batch
        log(f"catalog: Drive sync failed ({e}); out/catalog.csv is up to date")
        return None


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if "--auth" in sys.argv:
        credentials(interactive=True)
        print("Drive connected.")
    sync()


if __name__ == "__main__":
    main()
