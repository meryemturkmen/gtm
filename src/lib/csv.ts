// Just enough CSV for domain lists in and property tables out. Quoted fields, escaped quotes, CRLF.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(f => f.trim() !== ''))
}

/** Picks the column that looks like a domain or URL: by header name first, then by content. */
export function domainsFromCsv(text: string): string[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const header = rows[0]!.map(h => h.trim().toLowerCase())
  let col = header.findIndex(h => /^(domain|website|url|site|web|homepage|company domain)$/.test(h))
  const body = col === -1 ? rows : rows.slice(1)
  if (col === -1) {
    const looksLikeDomain = (s: string) => /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(s.trim())
    const width = Math.max(...rows.map(r => r.length))
    const scores = Array.from({ length: width }, (_, c) => body.filter(r => looksLikeDomain(r[c] ?? '')).length)
    col = scores.indexOf(Math.max(...scores))
    if (scores[col] === 0) return []
  }
  return body.map(r => (r[col] ?? '').trim()).filter(Boolean)
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n')
}
