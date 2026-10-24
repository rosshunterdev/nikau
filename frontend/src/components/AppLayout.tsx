import { NavLink, Outlet } from "react-router";
import { Users, SquareActivity, Bookmark } from "lucide-react";
import "./AppLayout.css";

type Props = {
  name: string;
  role: "support_worker" | "coordinator";
  onSignOut: () => void;
};

const ROLE_LABEL = { support_worker: "Support worker", coordinator: "Coordinator" };

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AppLayout({ name, role, onSignOut }: Props) {
  return (
    <div className="app">
      <aside className="sidebar">
        <NavLink to="/clients" className="sidebar-logo">Nīkau</NavLink>

        <nav className="sidebar-nav" aria-label="Main">
          <ul>
            <li>
              <NavLink to="/clients" className="sidebar-link">
                <Users size={20} aria-hidden="true" />
                Clients
              </NavLink>
            </li>
            <li>
              <NavLink to="/activities" className="sidebar-link">
                <SquareActivity size={20} aria-hidden="true" />
                Activity catalogue
              </NavLink>
            </li>
            <li>
              <NavLink to="/leads" className="sidebar-link">
                <Bookmark size={20} aria-hidden="true" />
                Saved leads
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-avatar" aria-hidden="true">{initials(name)}</span>
            <span>
              <span className="sidebar-name">{name}</span>
              <span className="sidebar-role">{ROLE_LABEL[role]}</span>
            </span>
          </div>
          <button type="button" className="sidebar-signout" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}