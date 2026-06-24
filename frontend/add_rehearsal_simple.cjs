const fs = require('fs');

const content = fs.readFileSync('src/services/mockApi.ts', 'utf-8');

const newFunction = `

export function getRehearsalResults(): Promise<RehearsalResult[]> {
  return new Promise((resolve) => {
    const results = getFromStorage<RehearsalResult[]>(STORAGE_KEYS.REHEARSAL, []);
    resolve(results);
  })
}`;

const fixedContent = content + newFunction;

fs.writeFileSync('src/services/mockApi.ts', fixedContent, 'utf-8');

console.log("Added getRehearsalResults function at end of file");
