// Today's date in the user's own time zone, as YYYY-MM-DD (the format <input type="date"> uses).
// Don’t use toISOString(): it returns the UTC date (which in NZ is still yesterday until 1 pm)
export function todayLocal() {
  return new Date().toLocaleDateString('en-CA')
}
