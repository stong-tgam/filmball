# YouTube API quota extension: draft answers

**Form:** https://support.google.com/youtube/contact/yt_api_form
("YouTube API Services - Audit and Quota Extension Form").
Sign in with the Google account that **owns the Cloud project** below.

Before you submit:
- Get the **project number** (a number, not the ID). In Google Cloud Console, open the project
  selector, click `secret-outpost-512823-r7`, and copy "Project number" from the dashboard.
- Make sure everything stays true. Don't add features or users the tool doesn't have.

---

## About you / organization

| Field | Answer |
|---|---|
| Name | *(your name)* |
| Email | *(the account email that owns the project)* |
| Organization / company | Pixel Hero Fights (independent creator, individual) |
| Website | https://www.youtube.com/@pixelherofighters |
| Country | *(your country)* |

## About the API client

| Field | Answer |
|---|---|
| Google Cloud project ID | `secret-outpost-512823-r7` |
| Google Cloud project number | *(copy from Cloud Console, see above)* |
| APIs used | YouTube Data API v3; YouTube Analytics API (read-only reporting) |
| Name of the API client | Pixel Hero Fights publishing tool (internal) |
| Is it publicly available / used by other people? | **No.** It's an internal, single-user tool that runs on my own computer and only manages my own channel. |
| Number of users | 1 (me, the channel owner) |
| YouTube channel(s) it acts on | Pixel Hero Fights: https://www.youtube.com/channel/UCtYKaZl-G4yf8Q4vem0D3zQ |
| Authentication | OAuth 2.0 (installed/desktop app). I authorize it myself; it only accesses my channel. |

## How the API client works (description)

> I run a YouTube Shorts channel, Pixel Hero Fights, with original pixel-art animated battle videos
> (1v1 fights, 2v2 "soccer with superpowers", battle royales, boss raids and horde-survival
> challenges). I make every video myself with my own simulation and rendering software: the
> characters, artwork, music, sound effects and game rules are original.
>
> The API client is a small internal script that publishes these finished videos to my own
> channel. Once a day it:
> 1. uploads the day's finished videos with `videos.insert` (resumable upload), setting the title,
>    description, tags and a scheduled `publishAt` time so releases are spread through the day;
> 2. adds each video to the matching playlist on my channel with `playlistItems.insert`
>    (one playlist per video format), creating a playlist with `playlists.insert` only if it
>    doesn't exist yet;
> 3. reads my own channel's statistics with `videos.list`/`channels.list` and the YouTube Analytics
>    API so I can review which videos work in a weekly report.
>
> It doesn't read, collect or store other users' data, doesn't comment, like, subscribe or interact
> with other channels, and doesn't download or re-upload anyone else's content.

## Quota request

| Field | Answer |
|---|---|
| Current quota | 10,000 units/day (default) |
| **Requested quota** | **30,000 units/day** |

**Justification:**

> Each published video costs about 1,700 units: 1,600 for `videos.insert`, 50 for
> `playlistItems.insert`, and a few units of reads. The default 10,000 units/day limits me to about
> 5-6 uploads a day. My channel publishes several distinct formats (1v1, soccer, battle royale, boss
> raid, horde survival), and I'd like to publish up to about 15 videos per day, scheduled across
> waking hours, while staying within YouTube's normal channel upload limits:
> 15 videos x ~1,700 units = ~25,500 units, plus headroom for occasional retries and playlist
> maintenance = 30,000 units/day.
>
> All uploads are original content made by me, and every video is checked automatically (length,
> audio) before publishing. I review performance weekly and adjust what is made.

## Compliance

| Question | Answer |
|---|---|
| Have you read and do you comply with the YouTube API Services Terms of Service and Developer Policies? | Yes. |
| Does the client store YouTube API data? | Only my own channel's data: the video IDs and URLs of my uploads, plus my channel's view/like counts and analytics for my weekly report. It's stored locally on my computer (and a private Google Sheet catalog of my own videos). Nothing from other users or channels is stored. |
| How long is data kept / refreshed? | My video IDs are kept to manage my own uploads; statistics snapshots are refreshed daily and only used for my own reporting. |
| Is data shared with third parties? | No. |
| Does the client display YouTube data to other users? | No, it has no user interface for anyone else. |
| Privacy policy / terms of service URL | Not applicable: internal single-user tool that only accesses the owner's own channel. *(If the form requires a URL, link the channel: https://www.youtube.com/@pixelherofighters)* |

## Demo / screenshots (if asked)

If the form asks for a demo, attach:
1. a screenshot of the YouTube Studio content list showing the scheduled uploads, and
2. a screenshot of the batch log (`fight/out/batch_logs/<date>.log`) showing an upload run:
   videos uploaded, scheduled times, playlist added. It contains no secrets.

---

## Expected API usage volume (per day)

| Method | Units/call | Calls/day | Units/day |
|---|---|---|---|
| videos.insert (scheduled publishAt) | 1,600 | 15 | 24,000 |
| playlistItems.insert | 50 | 15 | 750 |
| playlists.insert (rare) | 50 | 0-1 | 50 |
| videos.list (own videos' stats) | 1 | ~5 | 5 |
| channels.list (own channel) | 1 | ~2 | 2 |
| **Total** | | | **≈ 24,800** |

Requested: 30,000 units/day (headroom for upload retries). Current usage: about 9,900/day
(6 uploads + playlist adds). YouTube Analytics API calls are separate (a few per day).

## Required URLs

| Field | Answer |
|---|---|
| Primary Access URL | https://www.youtube.com/@pixelherofighters |
| Privacy Policy URL | https://docs.google.com/document/d/1nZO-pSTwkhh2oPrQB8deTGqu1oxC5ycntf-uGh-QHqg/view |

## Privacy policy (paste into a Google Doc and publish it)

> **Privacy Policy: Pixel Hero Fights Publishing Tool**
> Last updated: October 26, 2026
>
> Pixel Hero Fights ("we") runs an internal software tool that publishes original animated videos to
> our own YouTube channel, Pixel Hero Fights (https://www.youtube.com/@pixelherofighters), using
> YouTube API Services.
>
> **Who uses it.** The tool is used only by the channel owner. It is not offered to the public, and
> no other people sign in to it or use it.
>
> **What data it accesses.** With the channel owner's authorization (Google OAuth), the tool uploads
> videos to our own channel, manages our own playlists, and reads statistics and analytics about our
> own videos and channel. It does not access, collect or store personal information about viewers or
> any other YouTube users or channels.
>
> **How data is used and stored.** Video IDs, titles, upload times and our own channel statistics are
> stored on the owner's computer and in a private spreadsheet in the owner's Google Drive, only to
> manage our uploads and review which videos perform well. This data is not sold, shared with third
> parties, or used for advertising.
>
> **Retention and deletion.** Records of our own uploads are kept while the channel is active.
> Statistics snapshots are refreshed daily. Authorization can be revoked at any time at
> https://myaccount.google.com/permissions, which immediately stops the tool's access.
>
> **YouTube and Google.** This tool uses YouTube API Services. By using YouTube you agree to the
> YouTube Terms of Service (https://www.youtube.com/t/terms). Google's Privacy Policy is at
> https://policies.google.com/privacy.
>
> **Contact.** Questions about this policy: *(your contact email)*

---

After approval, raise the daily upload count in the scheduled task (`--mix ...` in the
`PixelHeroFights_Batch` Windows task), keeping releases spread through the day.
