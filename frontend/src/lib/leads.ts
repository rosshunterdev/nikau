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
