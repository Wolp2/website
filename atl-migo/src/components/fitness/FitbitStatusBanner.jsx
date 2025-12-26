import { useEffect, useState } from "react";
import styles from "../../pages/Fitness.module.css";

export default function FitbitStatusBanner({ apiBase }) {
  const [fitbit, setFitbit] = useState({ connected: false, lastSyncTime: null, hasKV: false });

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`${apiBase}/fitbit/status`, { cache: "no-store" });
        const data = await res.json();
        if (alive) setFitbit(data);
      } catch {
        if (alive) setFitbit({ connected: false, lastSyncTime: null, hasKV: false });
      }
    })();

    return () => {
      alive = false;
    };
  }, [apiBase]);

  return (
    <div className={styles.statusBanner}>
      {fitbit.connected ? (
        <div className={styles.statusOk}>
          ✅ Fitbit connected
          {fitbit.lastSyncTime && (
            <div className={styles.statusSub}>Last token refresh: {new Date(fitbit.lastSyncTime).toLocaleString()}</div>
          )}
        </div>
      ) : (
        <div className={styles.statusBad}>❌ Fitbit not connected</div>
      )}
    </div>
  );
}
