/**
 * Handing the family a file, in the two places this game gets played.
 *
 * The art room's drawings live in one browser, and **saving them to a file is the only
 * way they ever leave it** - onto the other tablet, or back to whoever is building the
 * game so they can be put in for good. So this has to work where the game is actually
 * played, and that is two quite different places:
 *
 * - **The single-file build** (`dist-play/hex-rpg.html`), opened straight off a disk.
 *   An ordinary `<a download>` works and there is nothing to ask.
 * - **The artifact**, which is the one the family uses. It runs framed and sandboxed,
 *   and a page in that frame **cannot start a download at all** - `<a download>`, blob
 *   URLs, script-driven saves, all inert, and all failing *silently*, which is the
 *   worst way for a button to not work. The host offers a proper route instead: ask it
 *   for the `downloads` capability and it puts the save to the viewer, who accepts it.
 *
 * The capability is asked for **once, early**, because the answer can take up to ten
 * seconds to come back when nothing is listening - which is fine while somebody reads
 * the page and unbearable after they have tapped a button.
 */

type Saver = { save: (r: { filename: string; data: string }) => Promise<{ status: string }> };
type Host = { use?: (name: string) => Promise<unknown> };

let asked: Promise<Saver | null> | null = null;

/**
 * Start asking the host whether it will save files for us. Safe to call repeatedly -
 * the answer is remembered - and worth calling as soon as a screen with a save button
 * opens, so the waiting happens before anybody taps.
 */
export function readyToSave(): Promise<Saver | null> {
  if (asked) return asked;
  const host = (globalThis as { claude?: Host }).claude;
  asked = host?.use
    ? host
        .use("downloads")
        .then((it) => (it as Saver | null) ?? null)
        .catch(() => null)
    : Promise.resolve(null);
  return asked;
}

export type SaveOutcome = { ok: true; message: string } | { ok: false; message: string };

const WHY: Record<string, string> = {
  declined: "No file saved — the save was turned down.",
  too_large: "That is too much to save in one go. Put some of the pictures back first.",
  rate_limited: "One save at a time. Try that again in a moment.",
};

/**
 * Offer a file. Uses the host's own save when there is one, and falls back to an
 * ordinary download link when the page is being run straight off a disk.
 */
export async function saveTextFile(filename: string, text: string): Promise<SaveOutcome> {
  const saver = await readyToSave();

  if (saver) {
    try {
      await saver.save({ filename, data: text });
      return { ok: true, message: `Saved as ${filename}.` };
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      return { ok: false, message: WHY[code] ?? "That would not save here." };
    }
  }

  // Not in a host that saves for us: an ordinary link, which works when the page is
  // open in its own tab and quietly does nothing when it is framed. Say both.
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return {
      ok: true,
      message: `Saved as ${filename}. If nothing arrived, this window is not allowed to save files — open the game in its own tab.`,
    };
  } catch {
    return { ok: false, message: "This window will not let the game save a file." };
  }
}
