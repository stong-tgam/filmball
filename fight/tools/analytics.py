"""
Pull channel analytics (read-only) and join them with what is in each video.

    python tools/analytics.py --auth     # one-time: read-only access to channel stats
    python tools/analytics.py            # snapshot -> out/analytics/<date>.json + latest.json

Per video: views, engaged views, likes, comments, shares, subscribers gained,
average view duration / percentage, watch minutes (YouTube Analytics API) plus
live counts (Data API), merged with the video's content from the catalog:
fighters, stage, winner, winner HP left, lead changes, fight length, upload time.
Channel: daily views / subscribers / watch time and traffic sources.
Analytics figures lag 1-3 days; live counts are near real time.
"""

import datetime
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from tools.catalog import rows  # noqa: E402
from tools.youtube_upload import SECRETS, find_client  # noqa: E402

TOKEN = os.path.join(SECRETS, "analytics_token.json")
SCOPES = ["https://www.googleapis.com/auth/yt-analytics.readonly",
          "https://www.googleapis.com/auth/youtube.readonly"]
OUT = os.path.join(ROOT, "out", "analytics")
VIDEO_METRICS = ["views", "engagedViews", "likes", "comments", "shares", "subscribersGained",
                 "averageViewDuration", "averageViewPercentage", "estimatedMinutesWatched"]


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
        creds = InstalledAppFlow.from_client_secrets_file(find_client(), SCOPES).run_local_server(
            port=0, prompt="consent")
    with open(TOKEN, "w", encoding="utf-8") as f:
        f.write(creds.to_json())
    return creds


def _table(resp):
    cols = [h["name"] for h in resp.get("columnHeaders", [])]
    return [dict(zip(cols, r)) for r in resp.get("rows", [])]


def _query(yta, metrics, **kw):
    """Run a report; drop metrics the API rejects (e.g. engagedViews on some channels)."""
    from googleapiclient.errors import HttpError
    metrics = list(metrics)
    while metrics:
        try:
            return _table(yta.reports().query(ids="channel==MINE", metrics=",".join(metrics), **kw).execute())
        except HttpError as e:
            bad = [m for m in metrics if m in e.content.decode(errors="replace")]
            if not bad or e.resp.status != 400:
                raise
            metrics = [m for m in metrics if m not in bad]
    return []


def snapshot(log=print):
    creds = credentials(interactive=False)
    if creds is None:
        log("analytics: not connected (run tools/analytics.py --auth)")
        return None
    from googleapiclient.discovery import build
    yta = build("youtubeAnalytics", "v2", credentials=creds, cache_discovery=False)
    yt = build("youtube", "v3", credentials=creds, cache_discovery=False)

    catalog = {r["url"].rsplit("/", 1)[-1]: r for r in rows() if r.get("status") == "uploaded"}
    ids = list(catalog)
    today = datetime.date.today()
    start = (today - datetime.timedelta(days=90)).isoformat()
    end = today.isoformat()

    per_video = {}
    for i in range(0, len(ids), 200):
        chunk = ids[i:i + 200]
        for r in _query(yta, VIDEO_METRICS, startDate=start, endDate=end, dimensions="video",
                        filters="video==" + ",".join(chunk), maxResults=200):
            per_video[r.pop("video")] = r
    live = {}
    for i in range(0, len(ids), 50):
        resp = yt.videos().list(part="statistics", id=",".join(ids[i:i + 50])).execute()
        for it in resp.get("items", []):
            live[it["id"]] = {k: int(v) for k, v in it.get("statistics", {}).items() if v.isdigit()}

    videos = []
    for vid, meta in catalog.items():
        up = meta.get("uploaded_at", "")
        age_h = None
        if up:
            age_h = round((datetime.datetime.now() - datetime.datetime.fromisoformat(up)).total_seconds() / 3600, 1)
        videos.append({"video_id": vid, "age_hours": age_h, **meta,
                       "analytics": per_video.get(vid, {}), "live": live.get(vid, {})})
    videos.sort(key=lambda v: -(v["live"].get("viewCount") or 0))

    channel_daily = _query(yta, ["views", "subscribersGained", "subscribersLost", "estimatedMinutesWatched"],
                           startDate=start, endDate=end, dimensions="day", sort="day")
    traffic = _query(yta, ["views"], startDate=start, endDate=end, dimensions="insightTrafficSourceType",
                     sort="-views")
    snap = {"taken_at": datetime.datetime.now().isoformat(timespec="seconds"), "window": [start, end],
            "videos": videos, "channel_daily": channel_daily, "traffic_sources": traffic}
    os.makedirs(OUT, exist_ok=True)
    for name in (f"{today.isoformat()}.json", "latest.json"):
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            json.dump(snap, f, indent=1, ensure_ascii=False)
    total = sum(v["live"].get("viewCount", 0) for v in videos)
    log(f"analytics: {len(videos)} videos, {total} views total -> out/analytics/{today.isoformat()}.json")
    return snap


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if "--auth" in sys.argv:
        credentials(interactive=True)
        print("Analytics connected (read-only).")
    try:
        snapshot()
    except Exception as e:
        print(f"analytics failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
