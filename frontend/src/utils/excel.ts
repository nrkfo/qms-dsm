import XLSX from 'xlsx-js-style';

/**
 * Calculates column widths based on content
 */
export const getColumnWidths = (data: any[]) => {
  if (!data || data.length === 0) return [];
  
  const keys = Object.keys(data[0]);
  return keys.map(key => {
    let maxLen = key.toString().length;
    data.forEach(row => {
      const val = row[key] ? row[key].toString() : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    // Add a bit of padding
    return { wch: Math.min(maxLen + 4, 100) };
  });
};

/**
 * Export to Excel with auto-fitted columns and borders
 */
export const exportToExcel = (data: any[], fileName: string, sheetName: string) => {
  const ws = XLSX.utils.json_to_sheet(data);
  
  // Set column widths
  ws['!cols'] = getColumnWidths(data);
  
  // Add borders and styling to every cell
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) continue;
      
      const isHeader = R === 0;
      
      ws[cellAddress].s = {
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        },
        font: {
          name: 'Calibri',
          sz: 11,
          bold: isHeader
        },
        alignment: {
          vertical: 'center',
          horizontal: isHeader ? 'center' : 'left',
          wrapText: true
        },
        fill: isHeader ? {
          fgColor: { rgb: 'EEEEEE' }
        } : undefined
      };
    }
  }
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};
