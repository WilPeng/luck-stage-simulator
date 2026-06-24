const fs = require('fs');

const content = fs.readFileSync('src/services/mockApi.ts', 'utf-8');

const insertPoint = 'export function getPerformanceResults(): Promise<PerformanceResult[]> {\n  return new Promise((resolve) => {\n    const results = getFromStorage<PerformanceResult[]>(STORAGE_KEYS.PERFORMANCE, []);\n    resolve(results.sort((a, b) => a.rank - b.rank));\n  })\n}';

const newFunction = 'export function getRehearsalResults(): Promise<RehearsalResult[]> {\n  return new Promise((resolve) => {\n    const results = getFromStorage<RehearsalResult[]>(STORAGE_KEYS.REHEARSAL, []);\n    resolve(results);\n  })\n}\n\nexport function getPerformanceResults(): Promise<PerformanceResult[]> {\n  return new Promise((resolve) => {\n    const results = getFromStorage<PerformanceResult[]>(STORAGE_KEYS.PERFORMANCE, []);\n    resolve(results.sort((a, b) => a.rank - b.rank));\n  })\n}';

const fixedContent = content.replace(insertPoint, newFunction);

fs.writeFileSync('src/services/mockApi.ts', fixedContent, 'utf-8');

console.log("Added getRehearsalResults function");
