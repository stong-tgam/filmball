/**
 * The action log. "Knight moved to F4." Settles arguments, and lets whoever wandered
 * off to the kitchen catch up on what they missed.
 */

import { useEffect, useRef } from "react";
import type { LogEntry } from "../game/types";

export default function Log({ entries }: { entries: LogEntry[] }) {
  const end = useRef<HTMLLIElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [entries.length]);

  return (
    <ol className="log">
      {entries.map((entry, i) => (
        <li key={i} className={entry.text.startsWith("—") ? "log-turn" : undefined}>
          {entry.text}
        </li>
      ))}
      <li ref={end} aria-hidden="true" />
    </ol>
  );
}
