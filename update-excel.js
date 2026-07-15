const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const excelPath = path.join(__dirname, 'apps/web/public/templates/Plantilla Importacion de datos.xlsx');

if (!fs.existsSync(excelPath)) {
  console.error("Excel file not found at", excelPath);
  process.exit(1);
}

const workbook = XLSX.readFile(excelPath);

function getRandomPhone() {
  return '09' + Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
}

// UPDATE "Prácticas" sheet (this is the one we prioritize reading)
const practicasSheetName = workbook.SheetNames.find(n => n.includes('Prácticas') || n.includes('Practicas'));
if (practicasSheetName) {
  const practicasSheet = workbook.Sheets[practicasSheetName];
  const data = XLSX.utils.sheet_to_json(practicasSheet, { header: 1 });
  
  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    if (data[i] && data[i].join('').toLowerCase().includes('cédula')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx !== -1) {
    // Insert "Celular" at index 4 (Column E)
    data[headerIdx].splice(4, 0, 'Celular');
    for (let i = headerIdx + 1; i < data.length; i++) {
      if (data[i] && data[i].length > 2) {
        data[i].splice(4, 0, getRandomPhone());
      }
    }
    const newSheet = XLSX.utils.aoa_to_sheet(data);
    workbook.Sheets[practicasSheetName] = newSheet;
    console.log("Updated Prácticas sheet with Celular at index 4");
  }
}

// UPDATE "Estudiantes" sheet (the one shown in the screenshot)
const estudiantesSheetName = workbook.SheetNames.find(n => n.includes('Estudiantes'));
if (estudiantesSheetName) {
  const estudiantesSheet = workbook.Sheets[estudiantesSheetName];
  const data = XLSX.utils.sheet_to_json(estudiantesSheet, { header: 1 });
  
  // Header is row 1 (0-indexed: 1)
  let headerIdx = 1;
  if (data[headerIdx] && data[headerIdx].includes('Cédula')) {
    data[headerIdx].splice(4, 0, 'Celular');
    for (let i = headerIdx + 1; i < data.length; i++) {
      if (data[i] && data[i].length >= 2) {
        data[i].splice(4, 0, getRandomPhone());
      }
    }
    const newSheet = XLSX.utils.aoa_to_sheet(data);
    workbook.Sheets[estudiantesSheetName] = newSheet;
    console.log("Updated Estudiantes sheet with Celular at index 4");
  }
}

XLSX.writeFile(workbook, excelPath);
console.log("Excel template successfully updated!");
