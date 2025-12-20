import { NavLink } from "react-router-dom";

const link = ({ isActive }) => ({
  margin: "0 14px",
  fontWeight: 600,
  textDecoration: "none",
  color: isActive ? "#fff" : "#e0e0e0",
  borderBottom: isActive ? "2px solid #fff" : "2px solid transparent",
  transition: "all 0.25s ease"
});

export default function Nav() {
  return (
    <nav
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(6px)",
        padding: "12px 0",
        textAlign: "center",
        zIndex: 10,
      }}
    >
      <NavLink to="/" style={link}>Home</NavLink>
      <NavLink to="/fitness" style={link}>Fitness</NavLink>
    </nav>
  );
}
