import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Home from "./pages/Home.jsx";
import Fitness from "./pages/Fitness.jsx";

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/fitness" element={<Fitness />} />
      </Routes>
    </>
  );
}
