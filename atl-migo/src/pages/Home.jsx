import React from "react";

export default function Home() {
  return (
    <main className="home-page">
      {/* ===== Hero Section ===== */}
      <header className="hero">
        <div className="hero-overlay">
          <div className="hero-content">
            <img
              src="/photos/headshot.jpg"
              alt="Profile"
              className="profile-pic"
            />
            <div className="intro-text">
              <h1>Welcome to My Website</h1>
              <p>
                This is a personal project to share my work, ideas, and fitness journey.
              </p>
              <nav className="hero-nav">
                <a href="/fitness">Fitness</a>
                <a href="/books">Books</a>
                <a href="/projects">Projects</a>
                <a href="/photodump">Photo Dump</a>
              </nav>
            </div>
          </div>
        </div>
      </header>
    </main>
  );
}
