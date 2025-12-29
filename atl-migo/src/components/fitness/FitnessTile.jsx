import styles from "../../pages/Fitness.module.css";
import { Flame, Footprints, Heart, Moon } from "lucide-react";

function TileIcon({ icon }) {
  if (icon === "steps") return <Footprints size={18} />;
  if (icon === "calories") return <Flame size={18} />;
  if (icon === "rhr") return <Heart size={18} />;
  if (icon === "sleep") return <Moon size={18} />;
  return null;
}

export default function FitnessTile({
  title,
  value,
  sub,
  icon,
  className = "",
  onClick,
  active = false,
}) {
  const clickable = typeof onClick === "function";

  return (
    <div
      className={[
        styles.tile,
        className,
        clickable ? styles.tileClickable : "",
        active ? styles.tileActive : "",
      ].join(" ")}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-pressed={clickable ? active : undefined}
    >
      <div className={styles.tileTop}>
        <div className={styles.tileTitle}>{title}</div>
        {icon ? (
          <div className={styles.tileIconBubble} aria-hidden="true">
            <TileIcon icon={icon} />
          </div>
        ) : null}
      </div>

      <div className={styles.tileValue}>{value}</div>
      <div className={styles.tileSub}>{sub}</div>
    </div>
  );
}
