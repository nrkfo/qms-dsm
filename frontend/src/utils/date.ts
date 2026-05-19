/**
 * Formats a date string (YYYY-MM-DD) to DD.MM.YYYY
 */
export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  
  // If already in DD.MM.YYYY format
  if (/^\d{2}\.\d{2}\.\d{4}/.test(dateStr)) return dateStr;
  
  // If it's YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const [y, m, d] = dateStr.split('T')[0].split('-');
    return `${d}.${m}.${y}`;
  }
  
  // Fallback for JS Date objects or other strings
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('ru-RU');
    }
  } catch {
    // Ignore invalid date strings
  }
  
  return dateStr;
};
