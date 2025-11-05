import { NavLink } from "react-router-dom";
const link = ({ isActive }) => ({
  margin: "0 10px", fontWeight: 700, textDecoration: "none",
  color: isActive ? "#fff" : "#e8e8e8"
});
export default function Nav() {
  return (
    <nav style={{background:"#555", padding:"10px", textAlign:"center"}}>
      <NavLink to="/" style={link}>Home</NavLink>
      <NavLink to="/fitness" style={link}>Fitness</NavLink>
      <NavLink to="/photodump" style={link}>Photo Dump</NavLink>
    </nav>
  );
}
