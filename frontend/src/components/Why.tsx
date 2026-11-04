// One part of the AI's explanation, e.g. "Why it fits", as a list.
// Shared by the match results and the saved leads.
export default function Why({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <>
      <h4>{title}</h4>
      <ul>
        {/* The position, not the text, is the key: two lines can say the same thing */}
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </>
  )
}
