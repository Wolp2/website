export default function Home() {
  return (
    <main>
      <header style={{
        display:"flex",alignItems:"center",justifyContent:"center",
        gap:20,flexWrap:"wrap",padding:20,background:"#333",color:"#fff"
      }}>
        <img src="https://pub-f0e72ff68fee408a91e6354c79114b39.r2.dev/headshot.jpg" alt="William Lopez"
             style={{width:130,height:130,borderRadius:"50%",objectFit:"cover",border:"3px solid #fff"}}/>
        <div>
          <h1>Welcome to My Website</h1>
          <p>This is a personal project to learn web dev and journal my life.</p>
        </div>
      </header>

      <section style={{
        position:"relative",height:"85vh",
        backgroundImage:"url('https://pub-f0e72ff68fee408a91e6354c79114b39.r2.dev/halloween.jpg')",
        backgroundSize:"cover",backgroundPosition:"center",
        display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",textAlign:"center",
        opacity:0, animation:"fade 1.5s ease-in forwards"
      }}>
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)"}}/>
        <div style={{position:"relative",maxWidth:760,padding:24}}>
          <h2>About Me</h2>
          <p>Hello friends, family, and strangers! I’m William Lopez (CS: Software Engineering). This site tracks projects, fitness, and memories.</p>
        </div>
      </section>

      <style>{`@keyframes fade { to { opacity: 1; } }`}</style>
    </main>
  );
}
