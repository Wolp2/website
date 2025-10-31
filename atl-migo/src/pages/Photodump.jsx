import { useEffect, useState } from "react";
const fmt = iso => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export default function Photodump() {
  const [items, setItems] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null); // Track which photo is open

  useEffect(() => {
    fetch("/photos/photos.json", { cache: "no-store" })
      .then(r => r.json())
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const closeLightbox = () => setActiveIndex(null);
  const showPrev = e => { e.stopPropagation(); setActiveIndex(i => (i > 0 ? i - 1 : items.length - 1)); };
  const showNext = e => { e.stopPropagation(); setActiveIndex(i => (i < items.length - 1 ? i + 1 : 0)); };

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
      <h1>What I've been up to!</h1>
      <p>A random collection of memories since moving to Georgia.</p>

      {/* Grid of images */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
        gap: 16,
        paddingTop: 10
      }}>
        {items.map((p, i) => (
          <figure
            key={p.src}
            onClick={() => setActiveIndex(i)}
            style={{
              margin: 0,
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 4px 10px rgba(0,0,0,.15)",
              cursor: "pointer"
            }}
          >
            <img
              src={p.src}
              alt={p.title}
              loading="lazy"
              style={{ width: "100%", display: "block" }}
            />
            <figcaption style={{
              textAlign: "center",
              background: "#f9f9f9",
              padding: "8px 0",
              borderTop: "1px solid #eee"
            }}>
              {p.title} <span style={{ color: "#666", marginLeft: 6, fontSize: ".85rem" }}>— {fmt(p.date)}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Lightbox overlay */}
      {activeIndex !== null && (
        <div
          onClick={closeLightbox}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            color: "#fff"
          }}
        >
          <button
            onClick={showPrev}
            style={{
              position: "absolute",
              left: 20,
              fontSize: "2rem",
              background: "none",
              border: "none",
              color: "white",
              cursor: "pointer"
            }}
          >
            ‹
          </button>

          <img
            src={items[activeIndex].src}
            alt={items[activeIndex].title}
            style={{
              maxWidth: "90%",
              maxHeight: "80%",
              borderRadius: 12,
              boxShadow: "0 0 30px rgba(0,0,0,0.6)",
              objectFit: "contain"
            }}
          />

          <button
            onClick={showNext}
            style={{
              position: "absolute",
              right: 20,
              fontSize: "2rem",
              background: "none",
              border: "none",
              color: "white",
              cursor: "pointer"
            }}
          >
            ›
          </button>

          <div style={{
            position: "absolute",
            bottom: 40,
            textAlign: "center",
            width: "100%",
            fontSize: "1.1rem"
          }}>
            {items[activeIndex].title} — {fmt(items[activeIndex].date)}
          </div>
        </div>
      )}
    </main>
  );
}
