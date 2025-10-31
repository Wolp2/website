import { useEffect, useMemo, useState } from "react";

const TABS = ["Reading", "Completed", "Wishlist"];
const LS_KEY = "booksWishlistV1";
const fmtPct = n => `${Math.max(0, Math.min(100, Math.round(n || 0)))}%`;

// Small badge
const Tag = ({ children, tone = "#eef" }) => (
  <span style={{ background: tone, padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>{children}</span>
);

// Simple card
const Card = ({ children }) => (
  <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,.05)", background: "#fff" }}>
    {children}
  </div>
);

// Progress pill
const Progress = ({ value = 0 }) => (
  <div style={{ background: "#f1f1f1", borderRadius: 999, height: 8, overflow: "hidden", width: "100%" }}>
    <div style={{ width: fmtPct(value), background: "#4a90e2", height: "100%" }} />
  </div>
);

export default function Books() {
  const [tab, setTab] = useState("Reading");
  const [base, setBase] = useState([]);          // data from books.json
  const [wishlist, setWishlist] = useState([]);  // client-side wishlist items
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);

  // Load initial JSON
  useEffect(() => {
    fetch("/books/books.json", { cache: "no-store" })
      .then(r => r.json())
      .then(setBase)
      .catch(() => setBase([]));
  }, []);

  // Load wishlist from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setWishlist(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(wishlist));
    } catch {}
  }, [wishlist]);

  // Derived lists
  const reading = useMemo(() => base.filter(b => b.status === "Reading"), [base]);
  const completed = useMemo(() => base.filter(b => b.status === "Completed"), [base]);
  const initialWishlist = useMemo(() => base.filter(b => b.status === "Wishlist"), [base]);
  const fullWishlist = useMemo(() => {
    // Merge initial wishlist from JSON + client-added wishlist (dedupe by id)
    const map = new Map();
    [...initialWishlist, ...wishlist].forEach(b => map.set(b.id, b));
    return Array.from(map.values());
  }, [initialWishlist, wishlist]);

  // Google Books search
  const search = async e => {
    e?.preventDefault?.();
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q.trim())}`);
      const j = await r.json();
      const items = (j.items || []).map(v => {
        const info = v.volumeInfo || {};
        return {
          id: v.id,
          title: info.title || "Untitled",
          author: (info.authors && info.authors.join(", ")) || "Unknown",
          thumb: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null,
          status: "SearchResult",
          progress: 0
        };
      });
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addToWishlist = book => {
    // avoid dupes by id
    if (fullWishlist.some(b => b.id === book.id)) return;
    setWishlist(w => [...w, { ...book, status: "Wishlist", progress: 0 }]);
  };

  const removeFromWishlist = id => {
    setWishlist(w => w.filter(b => b.id !== id));
  };

  const activeList = tab === "Reading" ? reading : tab === "Completed" ? completed : fullWishlist;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Books</h1>
        <nav style={{ display: "flex", gap: 8 }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: tab === t ? "#111" : "#fff",
                color: tab === t ? "#fff" : "#111",
                cursor: "pointer"
              }}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {/* Search / Add to Wishlist */}
      <section style={{ marginTop: 16 }}>
        <Card>
          <form onSubmit={search} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search Google Books (e.g., 'Domain-Driven Design')"
              style={{ flex: 1, minWidth: 260, padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8 }}
            />
            <button
              type="submit"
              disabled={searching}
              style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" }}
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </form>

          {results.length > 0 && (
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {results.map(b => (
                <Card key={b.id}>
                  <div style={{ display: "flex", gap: 12 }}>
                    {b.thumb ? (
                      <img alt="" src={b.thumb} style={{ width: 64, height: 96, objectFit: "cover", borderRadius: 6 }} />
                    ) : (
                      <div style={{ width: 64, height: 96, background: "#f3f3f3", borderRadius: 6 }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{b.title}</div>
                      <div style={{ color: "#666", fontSize: 14, margin: "4px 0" }}>{b.author}</div>
                      <button
                        onClick={() => addToWishlist(b)}
                        style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, border: "1px solid #4a90e2", background: "#4a90e2", color: "#fff", cursor: "pointer" }}
                      >
                        + Add to Wishlist
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Active List */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ margin: "6px 0 12px" }}>{tab}</h2>
        {activeList.length === 0 ? (
          <p style={{ color: "#666" }}>No books to show yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {activeList.map(b => (
              <Card key={b.id}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{b.title}</div>
                    {b.status === "Reading" && <Tag tone="#e7f5ff">Reading</Tag>}
                    {b.status === "Completed" && <Tag tone="#e8f7e6">Completed</Tag>}
                    {b.status === "Wishlist" && <Tag tone="#fef4e6">Wishlist</Tag>}
                  </div>
                  <div style={{ color: "#666", fontSize: 14 }}>{b.author}</div>
                  {b.status !== "Wishlist" && (
                    <>
                      <Progress value={b.progress} />
                      <div style={{ fontSize: 12, color: "#666" }}>{fmtPct(b.progress)} complete</div>
                    </>
                  )}
                  {tab === "Wishlist" && b.id && (
                    <button
                      onClick={() => removeFromWishlist(b.id)}
                      style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
