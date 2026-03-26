import fs from 'fs';
import path from 'path';

const filesToPatch = [
  'src/shared/lib/plan-limits.ts',
  'src/modules/employees/services.ts',
  'src/app/(company)/app/documents/page.tsx',
  'src/app/(company)/app/dashboard/page.tsx',
  'src/app/(superadmin)/superadmin/organizations/page.tsx',
  'src/app/(employee)/portal/home/page.tsx',
  'src/app/(employee)/portal/documents/page.tsx',
  'src/app/api/company/employees/route.ts',
  'src/app/api/company/document-folders/route.ts',
  // 'src/app/api/company/documents/route.ts', // Let's skip this one to patch manually since it has insert/update
  'src/app/api/company/ai/chat/route.ts',
  'src/app/api/company/documents/export/route.ts',
  'src/app/api/company/documents/share-email/route.ts',
  'src/app/api/documents/[documentId]/download/route.ts'
];

let changedFiles = 0;

filesToPatch.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf-8');
    
    // We want to find `.from("documents").select(something)` or `.from('documents').select(...)`
    // and append `.is('deleted_at', null)` right after the closing parenthesis of `select(...)`.
    // Since `select` can have newlines, we'll use a regex that handles whitespace but avoids greediness.
    // Basic regex for select: \.select\([^)]*\)
    // We'll replace `.from("documents").select(...)` with `.from("documents").select(...).is("deleted_at", null)`
    // To handle chainings that might have newlines between .from and .select:
    
    // Actually, we can just replace `.from("documents")` and `.from('documents')` 
    // Wait, `.from("documents")` is immediately followed by `.select` or `.update` or `.delete` usually.
    // Let's do a string replacement on `.from("documents")\n      .select(` or similar, but what if we just replace `.from("documents")` with `.from("documents")\n      /* soft-delete */`? No.
    
    const regex = /(\.from\(\s*['"]documents['"]\s*\)(?:\s*\n\s*)?\.select\((?:[^()]*|\([^()]*\))*\))/g;
    
    const newContent = content.replace(regex, (match) => {
      if (match.includes("deleted_at")) return match;
      return match + `\n.is('deleted_at', null)`;
    });
    
    if (newContent !== content) {
      fs.writeFileSync(fullPath, newContent, 'utf-8');
      console.log("Patched SELECT in", file);
      changedFiles++;
    }
  }
});
console.log("Total files patched:", changedFiles);
