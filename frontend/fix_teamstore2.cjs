const fs = require('fs');

const content = fs.readFileSync('src/stores/teamStore.ts', 'utf-8');

let fixedContent = content;

fixedContent = fixedContent.replace(
  'async function fetchApplications(): Promise<void> {\n    const data = await getTeamApplications()\n    if (teamId) {\n      applications.value = data\n    } else {\n      applications.value = data\n    }\n  }',
  'async function fetchApplications(): Promise<void> {\n    const data = await getTeamApplications()\n    applications.value = data\n  }'
);

fixedContent = fixedContent.replace(
  'await fetchInvites(userId)',
  'await fetchInvites()'
);

fs.writeFileSync('src/stores/teamStore.ts', fixedContent, 'utf-8');

console.log("Fixed teamStore.ts");
