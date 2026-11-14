import type { ReactNode } from 'react'

// SCRUM-129: one part of the form. On wide screens it's an open card with a heading,
// like hi-fi 04, so nothing (including required fields) is hidden. On phones it's a
// section you can open and close, with only the first one open to start.
// Shared by the client form and the activity form (SCRUM-129 fix 08). Styles in ClientForm.css.
export default function FormSection(props: {
  id: string
  title: string
  mi?: string // te reo name under the heading
  wide: boolean
  startOpen?: boolean // phones only
  children: ReactNode
}) {
  const { id, title, mi, wide, startOpen, children } = props
  if (!wide) {
    return (
      <details className="form-card" open={startOpen}>
        <summary>{title}</summary>
        {children}
      </details>
    )
  }
  return (
    <section className="form-card" aria-labelledby={id}>
      <h2 id={id} className="form-card-heading">
        {title}
        {mi && <span lang="mi">{mi}</span>}
      </h2>
      {children}
    </section>
  )
}
