/**
 * A thin client for PixelLab's pixel-art generation API.
 *
 * **Unverified against a live response.** This session's network egress proxy blocks
 * `pixellab.ai` outright (403, "host not allowed for this session"), so none of the
 * endpoint paths, field names, or response shapes below have been checked against a
 * real call - they come from documentation search during planning. The first real
 * invocation (`tools/generate-art.ts`'s anchor set) is the actual test: if a field name
 * is wrong, the API's own error message is the fastest way to find out, and that is
 * expected to take one or two patches here before it is right. Keep the wire format
 * isolated in this one file so that patch stays small.
 *
 * Generation is asynchronous: a `start*` call returns a job id, which `pollJob` polls
 * until it reports done, then the image is downloaded from the URL in the result.
 *
 * Auth is one key - **`PIXELLAB_API_KEY_3`, specifically**, per instruction. The other
 * two keys in the uploaded `.env` are not used here.
 */

const BASE_URL = "https://api.pixellab.ai/v1";

function apiKey(): string {
  const key = process.env.PIXELLAB_API_KEY_3;
  if (!key) throw new Error("PIXELLAB_API_KEY_3 is not set. Source the .env file first.");
  return key;
}

async function request<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PixelLab ${path} -> ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`PixelLab ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

type JobHandle = { job_id: string };
type JobStatus = {
  status: "pending" | "processing" | "done" | "completed" | "error" | "failed";
  image_url?: string;
  image?: { url?: string; base64?: string };
  error?: string;
};

/** Plain text-to-pixel-art. Used for the anchor set, before any style exists to match. */
export async function startGenerateImage(opts: {
  description: string;
  imageSize?: { width: number; height: number };
}): Promise<JobHandle> {
  return request<JobHandle>("/start_generate_image", {
    description: opts.description,
    image_size: opts.imageSize ?? { width: 64, height: 64 },
  });
}

/**
 * Generate matched to 1-4 reference images, so the bulk set reads as one style instead
 * of independent rolls. `styleImages` are base64-encoded PNGs (the anchors).
 */
export async function startGenerateWithStyle(opts: {
  description: string;
  styleImages: string[];
  imageSize?: { width: number; height: number };
}): Promise<JobHandle> {
  if (opts.styleImages.length < 1 || opts.styleImages.length > 4) {
    throw new Error(`startGenerateWithStyle wants 1-4 style images, got ${opts.styleImages.length}`);
  }
  return request<JobHandle>("/start_generate_with_style", {
    description: opts.description,
    style_images: opts.styleImages,
    image_size: opts.imageSize ?? { width: 64, height: 64 },
  });
}

const DONE = new Set(["done", "completed"]);
const FAILED = new Set(["error", "failed"]);

/** Poll a job until it finishes, and return the generated image as a Buffer (PNG). */
export async function pollJob(jobId: string, { intervalMs = 2000, timeoutMs = 120_000 } = {}): Promise<Buffer> {
  const started = Date.now();
  for (;;) {
    const status = await request<JobStatus>(`/get_background_job`, { job_id: jobId });
    if (FAILED.has(status.status)) {
      throw new Error(`PixelLab job ${jobId} failed: ${status.error ?? "no error message given"}`);
    }
    if (DONE.has(status.status)) {
      const url = status.image_url ?? status.image?.url;
      const b64 = status.image?.base64;
      if (b64) return Buffer.from(b64, "base64");
      if (url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Downloading PixelLab result ${url} -> ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      }
      throw new Error(`PixelLab job ${jobId} reported done with no image_url or image.base64`);
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`PixelLab job ${jobId} did not finish within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Generate one image and wait for it, start to finish. */
export async function generateImage(opts: {
  description: string;
  imageSize?: { width: number; height: number };
}): Promise<Buffer> {
  const { job_id } = await startGenerateImage(opts);
  return pollJob(job_id);
}

/** Generate one style-matched image and wait for it, start to finish. */
export async function generateWithStyle(opts: {
  description: string;
  styleImages: string[];
  imageSize?: { width: number; height: number };
}): Promise<Buffer> {
  const { job_id } = await startGenerateWithStyle(opts);
  return pollJob(job_id);
}
