import { useOutletContext } from 'react-router'

type Role = 'support_worker' | 'coordinator'

// The signed-in person's role, for showing or hiding buttons.
// The API and RLS still enforce it; this only tidies the screen.
export function useRole() {
  return useOutletContext<{ role: Role }>().role
}
