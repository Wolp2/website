import styles from "../../pages/Fitness.module.css";

export default function FitnessTile({ title, value, sub }) {
  return (
    <div className={styles.tile}>
      <div className={styles.tileTitle}>{title}</div>
      <div className={styles.tileValue}>{value ?? "—"}</div>
      <div className={styles.tileSub}>{sub ?? ""}</div>
    </div>
  );
}
