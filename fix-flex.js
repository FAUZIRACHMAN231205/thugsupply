const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Pattern 1: header containers with padding and border-bottom
  // <div style={{ padding: '1.25rem', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  content = content.replace(
    /<div style=\{\{\s*padding:\s*'1\.25rem'(?:\s*1\.5rem')?,\s*borderBottom:\s*'[^']+',\s*display:\s*'flex',\s*justifyContent:\s*'space-between',\s*alignItems:\s*'center'\s*\}\}>/g,
    '<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 border-b border-slate-800">'
  );

  content = content.replace(
    /<div style=\{\{\s*padding:\s*'1\.5rem',\s*borderBottom:\s*'1px solid #1e293b',\s*display:\s*'flex',\s*justifyContent:\s*'space-between',\s*alignItems:\s*'center'\s*\}\}>/g,
    '<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 border-b border-slate-800">'
  );

  content = content.replace(
    /<div style=\{\{\s*padding:\s*'1\.25rem 1\.5rem',\s*borderBottom:\s*'[^']+',\s*display:\s*'flex',\s*justifyContent:\s*'space-between',\s*alignItems:\s*'center'\s*\}\}>/g,
    '<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-slate-800/50">'
  );

  // Pattern 2: Modal Headers
  // <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(201, 168, 76, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  content = content.replace(
    /<div style=\{\{\s*padding:\s*'1\.25rem 1\.5rem',\s*borderBottom:\s*'1px solid rgba\(201,\s*168,\s*76,\s*0\.2\)',\s*display:\s*'flex',\s*justifyContent:\s*'space-between',\s*alignItems:\s*'center'\s*\}\}>/g,
    '<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-gold-500/20">'
  );

  // Pattern 3: general flex container space-between
  // <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' ... }}>
  content = content.replace(
    /<div style=\{\{\s*display:\s*'flex',\s*justifyContent:\s*'space-between',\s*alignItems:\s*'center'(?:,\s*marginBottom:\s*'0\.75rem')?\s*\}\}>/g,
    '<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-3">'
  );
  
  content = content.replace(
    /<div style=\{\{\s*display:\s*'flex',\s*justifyContent:\s*'space-between',\s*alignItems:\s*'center'\s*\}\}>/g,
    '<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">'
  );

  // General flex space-between
  content = content.replace(
    /style=\{\{\s*display:\s*'flex',\s*justifyContent:\s*'space-between',\s*alignItems:\s*'center'\s*\}\}/g,
    'className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"'
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

walkDir(path.join(__dirname, 'app'), processFile);
console.log('Done');
