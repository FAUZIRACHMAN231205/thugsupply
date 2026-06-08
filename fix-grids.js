const fs = require('fs');
const path = require('path');

const targetDir = 'c:\\Laragon\\www\\thugsupply\\app';

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walk(dirPath, callback);
    } else if (f.endsWith('.tsx')) {
      callback(path.join(dir, f));
    }
  });
}

const replacements = [
  {
    regex: /style=\{\{\s*display:\s*'grid',\s*gridTemplateColumns:\s*'repeat\(4,\s*1fr\)',\s*gap:\s*'1rem'(?:,\s*marginBottom:\s*'1\.5rem')?\s*\}\}/g,
    replace: (match) => {
      if (match.includes('marginBottom')) {
        return `className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"`;
      }
      return `className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"`;
    }
  },
  {
    regex: /style=\{\{\s*display:\s*'grid',\s*gridTemplateColumns:\s*'repeat\(3,\s*1fr\)',\s*gap:\s*'1rem'(.*?)\}\}/g,
    replace: (match, p1) => {
      const extra = p1.trim();
      let res = `className="grid grid-cols-1 sm:grid-cols-3 gap-4"`;
      if (extra) res += ` style={{${extra.replace(/^,/, '')}}}`;
      return res;
    }
  },
  {
    regex: /style=\{\{\s*display:\s*'grid',\s*gridTemplateColumns:\s*'1fr 1fr',\s*gap:\s*'1rem'(.*?)\}\}/g,
    replace: (match, p1) => {
      const extra = p1.trim();
      let res = `className="grid grid-cols-1 md:grid-cols-2 gap-4"`;
      if (extra) {
        if (extra.includes("background: '#050811'")) {
           // We can keep it in style
           res += ` style={{${extra.replace(/^,/, '')}}}`;
        } else {
           res += ` style={{${extra.replace(/^,/, '')}}}`;
        }
      }
      return res;
    }
  },
  {
    regex: /style=\{\{\s*display:\s*'grid',\s*gridTemplateColumns:\s*'1fr 2fr',\s*gap:\s*'1rem'(.*?)\}\}/g,
    replace: (match, p1) => {
      const extra = p1.trim();
      let res = `className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4"`;
      if (extra) res += ` style={{${extra.replace(/^,/, '')}}}`;
      return res;
    }
  },
  {
    regex: /style=\{\{\s*display:\s*'grid',\s*gridTemplateColumns:\s*'2fr 1fr',\s*gap:\s*'1rem'(.*?)\}\}/g,
    replace: (match, p1) => {
      const extra = p1.trim();
      let res = `className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4"`;
      if (extra) res += ` style={{${extra.replace(/^,/, '')}}}`;
      return res;
    }
  },
  {
    regex: /style=\{\{\s*display:\s*'grid',\s*gridTemplateColumns:\s*'1\.5fr 1fr',\s*gap:\s*'1rem'(.*?)\}\}/g,
    replace: (match, p1) => {
      const extra = p1.trim();
      let res = `className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4"`;
      if (extra) res += ` style={{${extra.replace(/^,/, '')}}}`;
      return res;
    }
  },
  {
    regex: /style=\{\{\s*display:\s*'grid',\s*gridTemplateColumns:\s*'1\.2fr 0\.8fr',\s*gap:\s*'1\.5rem'(.*?)\}\}/g,
    replace: (match, p1) => {
      const extra = p1.trim();
      let res = `className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6"`;
      if (extra) res += ` style={{${extra.replace(/^,/, '')}}}`;
      return res;
    }
  }
];

let modifiedFiles = 0;

walk(targetDir, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf-8');
  let newContent = content;

  replacements.forEach(rep => {
    newContent = newContent.replace(rep.regex, rep.replace);
  });

  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    modifiedFiles++;
    console.log(`Updated: ${filePath}`);
  }
});

console.log(`Total files modified: ${modifiedFiles}`);
