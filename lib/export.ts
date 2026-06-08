export function exportToCSV(filename: string, headers: string[], data: unknown[][]) {
  // Add BOM (Byte Order Mark) for UTF-8 to ensure Excel reads special characters correctly
  const BOM = '\uFEFF'
  
  // Format each row
  const csvContent = [
    headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','),
    ...data.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
  ].join('\n')

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
