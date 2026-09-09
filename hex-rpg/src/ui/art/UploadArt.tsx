/**
 * "Use my drawing." Point it at a slot and it swaps the game's picture for one of
 * theirs — a photo of a chit off the kitchen table, or something drawn on a tablet.
 */

import { useRef, useState } from "react";
import { clearOverride, overrideFor, prepareDrawing, putOverride, type ArtSlot } from "./overrides";

export default function UploadArt({ slot, label }: { slot: ArtSlot; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const has = overrideFor(slot) !== undefined;

  const take = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    try {
      const kept = putOverride(slot, await prepareDrawing(file));
      if (!kept) setProblem("Saved for now, but this tablet is out of room to keep it.");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That picture would not open.");
    }
  };

  return (
    <div className="upload">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="upload-input"
        onChange={(e) => void take(e.target.files?.[0])}
      />
      <button type="button" className="pencil-button" onClick={() => input.current?.click()}>
        {has ? `Change the ${label}` : "Use my drawing"}
      </button>
      {has && (
        <button type="button" className="pencil-button ghost" onClick={() => clearOverride(slot)}>
          Put it back
        </button>
      )}
      {problem && <p className="upload-problem">{problem}</p>}
    </div>
  );
}
