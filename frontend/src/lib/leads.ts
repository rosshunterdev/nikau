import type { LeadSource } from './types'

// How each lead source is shown on screen
export const SOURCE_LABEL: Record<LeadSource, string> = {
  ai_match: 'AI match',
  manual_search: 'Catalogue search',
}

// "1 Nov 2026"
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// SCRUM-129 fix 05: tell the sidebar badge a lead was saved or removed, so the count
// updates straight away instead of on the next page change
export const LEADS_CHANGED = 'nikau:leads-changed'

export function announceLeadsChanged() {
  window.dispatchEvent(new Event(LEADS_CHANGED))
}
