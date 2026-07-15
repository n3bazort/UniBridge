const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const excelPath = path.join(__dirname, 'apps/web/public/templates/Plantilla Importacion de datos.xlsx');
if (!fs.existsSync(excelPath)) {
  console.error("Excel file not found");
  process.exit(1);
}

const workbook = XLSX.readFile(excelPath);

// REMOVE "Celular" column from "Prácticas" sheet
const practicasSheetName = workbook.SheetNames.find(n => n.includes('Prácticas') || n.includes('Practicas'));
if (practicasSheetName) {
  const practicasSheet = workbook.Sheets[practicasSheetName];
  const data = XLSX.utils.sheet_to_json(practicasSheet, { header: 1 });
  
  let headerIdx = -1;
  let celularColIdx = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    if (data[i] && data[i].join('').toLowerCase().includes('cédula')) {
      headerIdx = i;
      celularColIdx = data[i].findIndex(c => String(c).toLowerCase() === 'celular');
      break;
    }
  }

  if (headerIdx !== -1 && celularColIdx !== -1) {
    for (let i = headerIdx; i < data.length; i++) {
      if (data[i] && data[i].length > celularColIdx) {
        data[i].splice(celularColIdx, 1);
      }
    }
    const newSheet = XLSX.utils.aoa_to_sheet(data);
    workbook.Sheets[practicasSheetName] = newSheet;
    console.log("Removed Celular column from Prácticas sheet");
  } else {
    console.log("Celular column not found in Prácticas sheet");
  }
}

XLSX.writeFile(workbook, excelPath);
console.log("Excel template successfully updated (Prácticas reverted).");
