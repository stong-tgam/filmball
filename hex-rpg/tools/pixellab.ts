/**
 * A thin client for PixelLab's pixel-art generation API (v2).
 *
 * The wire format is copied from `fight/tools/pixellab_gen.py`, which has generated
 * real sprites with these exact calls - not guessed from documentation:
 *
 * - `POST /create-image-pixflux`  plain text-to-pixel-art (the anchors)
 * - `POST /create-image-bitforge` the same, plus one `style_image` to match (the rest)
 * - Both are synchronous: the response carries `image.base64` directly, no job polling.
 * - Auth is `Authorization: Bearer <key>`. `GET /balance` reports what is left.
 *
 * The key is **`PIXELLAB_API_KEY_3`, specifically**, per instruction. It is read from
 * the environment, or from `hex-rpg/.env` (git-ignored) if the environment lacks it.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://api.pixellab.ai/v2";
const KEY_NAME = "PIXELLAB_API_KEY_3";
const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), "../.env");

/** The settings `fight` uses for every sprite, so both projects come out alike. */
const SETTINGS = {
  no_background: true,
  outline: "single color black outline",
  shading: "basic shading",
  detail: "medium detail",
  text_guidance_scale: 8,
  view: "side",
  direction: "south",
};

/** How strongly bitforge copies the style image. `fight` settled on 40. */
const STYLE_STRENGTH = 40;

function apiKey(): string {
  let key = process.env[KEY_NAME];
  if (!key && existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const at = line.indexOf("=");
      if (at > 0 && line.slice(0, at).trim() === KEY_NAME) {
        key = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  if (!key) throw new Error(`${KEY_NAME} is not set. Put it in hex-rpg/.env or the environment.`);
  return key;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PixelLab ${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`PixelLab ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

type Balance = { subscription?: { generations?: number }; credits?: { usd?: number } };
type ImageResponse = { image?: { base64?: string }; usage?: { type?: string } };

/** Free generations left and paid credit, for a line of output before a run. */
export async function balance(): Promise<{ free: number; usd: number }> {
  const bal = await call<Balance>("GET", "/balance");
  return { free: bal.subscription?.generations ?? 0, usd: bal.credits?.usd ?? 0 };
}

function decode(path: string, resp: ImageResponse): Buffer {
  const b64 = resp.image?.base64;
  if (!b64) throw new Error(`PixelLab ${path} returned no image: ${JSON.stringify(resp).slice(0, 200)}`);
  return Buffer.from(b64, "base64");
}

/** Plain text-to-pixel-art. Used for the anchor set, before any style exists to match. */
export async function generateImage(opts: {
  description: string;
  imageSize?: { width: number; height: number };
}): Promise<Buffer> {
  const path = "/create-image-pixflux";
  const resp = await call<ImageResponse>("POST", path, {
    ...SETTINGS,
    description: opts.description,
    image_size: opts.imageSize ?? { width: 64, height: 64 },
  });
  return decode(path, resp);
}

/**
 * Generate matched to a reference image, so the bulk set reads as one style instead of
 * independent rolls. Bitforge takes a single style image; `styleImage` is a base64 PNG.
 * It copies colours as well as linework, which is why the anchor picked matters.
 */
export async function generateWithStyle(opts: {
  description: string;
  styleImage: string;
  imageSize?: { width: number; height: number };
}): Promise<Buffer> {
  const path = "/create-image-bitforge";
  const resp = await call<ImageResponse>("POST", path, {
    ...SETTINGS,
    description: opts.description,
    image_size: opts.imageSize ?? { width: 64, height: 64 },
    style_image: { type: "base64", base64: opts.styleImage, format: "png" },
    style_strength: STYLE_STRENGTH,
  });
  return decode(path, resp);
}
