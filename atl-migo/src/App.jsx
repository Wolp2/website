import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Home from "./pages/Home.jsx";
import Fitness from "./pages/Fitness.jsx";
import Books from "./pages/Books.jsx";
import Photodump from "./pages/Photodump.jsx";

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/fitness" element={<Fitness />} />
        <Route path="/books" element={<Books />} />
        <Route path="/photodump" element={<Photodump />} />
      </Routes>
      <footer style={{textAlign:"center", padding:"10px"}}>© 2025 William Lopez</footer>
    </>
  );
}
