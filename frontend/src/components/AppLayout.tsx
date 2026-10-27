import { NavLink, Outlet } from "react-router";
import type { LucideIcon } from "lucide-react";
import { Users, SquareActivity, Bookmark, ScrollText } from "lucide-react";
import "./AppLayout.css";

type Role = "support_worker" | "coordinator";

type Props = {
  name: string;
  role: Role;
  onSignOut: () => void;
};

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[]; // leave out = everyone can see it
};

const NAV_ITEMS: NavItem[] = [
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/activities", label: "Activity catalogue", icon: SquareActivity }, // page: SCRUM-65
  { to: "/leads", label: "Saved leads", icon: Bookmark },
  { to: "/matching-log", label: "Matching log", icon: ScrollText, roles: ["coordinator"] },
];

const ROLE_LABEL: Record<Role, string> = {
  support_worker: "Support worker",
  coordinator: "Coordinator",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AppLayout({ name, role, onSignOut }: Props) {
  const links = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <aside className="sidebar">
        <NavLink to="/clients" className="sidebar-logo">
          Nīkau
        </NavLink>

        <nav className="sidebar-nav" aria-label="Main">
          <ul>
            {links.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} className="sidebar-link">
                  <Icon size={20} aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-avatar" aria-hidden="true">
              {initials(name)}
            </span>
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

      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}