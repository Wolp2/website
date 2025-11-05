import React from "react";
import styles from "./Home.module.css";

export default function Home() {
  return (
    <main className="home-page">
      {/* ===== Hero Section ===== */}
      <header className={styles.hero}>
        <div className={styles["hero-overlay"]}>
          <div className={styles["hero-content"]}>
            <img
              src="/headshot.jpg"
              alt="Profile"
              className="profile-pic"
            />
            <div className="intro-text">
              <h1>Welcome to My Website</h1>
              <p>
                My name is William, I am a software engineer student and this is a personal project to share my work, ideas, and fitness journey.
              </p>
              <nav className="hero-nav">
                <a href="/fitness">Fitness</a>
                <a href="/photodump">Photo Dump</a>
              </nav>
            </div>
          </div>
        </div>
      </header>
    </main>
  );
}
