const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'web/src/modules/employees/actions.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replace error redirects
content = content.replace(/redirect\(\s*"\/app\/employees\?status=error&message="\s*\+\s*qs\((.*?)\),?\s*\);/gs, 'return { success: false, message: $1 };');

// Replace success redirects
content = content.replace(/redirect\(\s*"\/app\/employees\?status=success&message="\s*\+\s*qs\((.*?)\),?\s*\);/gs, 'return { success: true, message: $1, timestamp: Date.now() };');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Refactored actions.ts");
