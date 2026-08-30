import { useEffect, useState } from "react";

import {
  getReleaseSyncSnapshot,
  subscribeReleaseSync,
} from "@/lib/release-sync";

export default function ReleaseSyncNotice() {
  const [snapshot, setSnapshot] = useState(getReleaseSyncSnapshot);

  useEffect(() => subscribeReleaseSync(setSnapshot), []);

  if (!snapshot.blocked || !snapshot.message) return null;

  return (
    <div
      aria-live="polite"
      className="fixed left-1/2 top-4 z-[200] w-[min(92vw,520px)] -translate-x-1/2 rounded-md border border-[#d8c4e8] bg-white/95 px-4 py-3 text-center text-sm font-medium text-[#3d1560] shadow-lg backdrop-blur"
      role="status"
    >
      {snapshot.message}
    </div>
  );
}
