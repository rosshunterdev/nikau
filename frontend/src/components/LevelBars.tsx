import { LEVELS } from '../lib/options'

// Three small bars filled up to the level (low = 1, medium = 2, high = 3), like the hi-fi.
// Decorative only: the words next to them ("Up to medium", "Low") say the same thing.
// Used on the client profile and the activity detail page; styles in ClientProfile.css.
export default function LevelBars({ level }: { level: string | null }) {
  if (!level) return null
  const filled = LEVELS.findIndex((l) => l.value === level) + 1
  return (
    <span className="level-bars" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= filled ? 'on' : undefined} />
      ))}
    </span>
  )
}
