const path = require('path');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

function isExcelFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  return ext === '.xlsx' || ext === '.xls';
}

function isCsvFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  return ext === '.csv' || file.mimetype === 'text/csv';
}

function parseCsvBuffer(buffer) {
  const content = buffer.toString('utf-8');
  return parse(content, { columns: true, skip_empty_lines: true, bom: true });
}

function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
}

function parseImportFile(file) {
  if (!file) {
    throw new Error('请先选择导入文件');
  }

  if (isExcelFile(file)) {
    return parseExcelBuffer(file.buffer);
  }

  if (isCsvFile(file)) {
    return parseCsvBuffer(file.buffer);
  }

  throw new Error('仅支持导入 CSV / XLSX / XLS 文件');
}

module.exports = {
  parseImportFile,
};
