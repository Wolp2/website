import { useEffect } from "react";
export default function FitbitStatusBanner({ apiBase, onStatus }) {
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`${apiBase}/fitbit/status`, { cache: "no-store" });
        const data = await res.json();

        if (!alive) return;

        onStatus?.({
          connected: !!data?.connected,
          lastSyncTime: data?.lastSyncTime ?? null,
          hasKV: !!data?.hasKV,
        });
      } catch {
        if (!alive) return;

        onStatus?.({
          connected: false,
          lastSyncTime: null,
          hasKV: false,
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [apiBase, onStatus]);

  return null;
}
