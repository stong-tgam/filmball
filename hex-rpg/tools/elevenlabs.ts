/**
 * A thin client for ElevenLabs' sound-effects generation API.
 *
 * **Unverified against a live response**, same caveat as `tools/pixellab.ts`: this
 * session cannot reach `elevenlabs.io` to check the endpoint directly. The shape below
 * - `POST /v1/sound-generation`, `xi-api-key` header, raw audio bytes back - agreed
 * across every source found during planning, so it is the more confident of the two
 * clients, but still worth a one-clip smoke test before trusting the rest of the batch.
 */

const BASE_URL = "https://api.elevenlabs.io/v1";

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set. Source the .env file first.");
  return key;
}

/**
 * Generate one short sound effect from a text description.
 *
 * `durationSeconds` must be 0.5-30 if given; left unset, the API guesses a duration
 * from the prompt. `promptInfluence` (0-1, default 0.3) trades off how literally the
 * prompt is followed versus how natural the result sounds - pushed higher here by
 * default because these are short, specific game cues, not ambient texture.
 */
export async function generateSoundEffect(opts: {
  text: string;
  durationSeconds?: number;
  promptInfluence?: number;
  loop?: boolean;
}): Promise<Buffer> {
  const res = await fetch(`${BASE_URL}/sound-generation`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: opts.text,
      model_id: "eleven_text_to_sound_v2",
      duration_seconds: opts.durationSeconds,
      prompt_influence: opts.promptInfluence ?? 0.5,
      loop: opts.loop ?? false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs sound-generation -> ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
