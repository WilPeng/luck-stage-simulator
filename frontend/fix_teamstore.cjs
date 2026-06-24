const fs = require('fs');

const content = fs.readFileSync('src/stores/teamStore.ts', 'utf-8');

let fixedContent = content;

fixedContent = fixedContent.replace(
  'async function fetchApplications(teamId?: string): Promise<void> {\n    const data = await getTeamApplications(teamId)',
  'async function fetchApplications(): Promise<void> {\n    const data = await getTeamApplications()'
);

fixedContent = fixedContent.replace(
  'async function fetchInvites(userId?: string): Promise<void> {\n    const data = await getTeamInvites(userId)',
  'async function fetchInvites(): Promise<void> {\n    const data = await getTeamInvites()'
);

fixedContent = fixedContent.replace(
  'await fetchApplications(teamId)',
  'await fetchApplications()'
);

fixedContent = fixedContent.replace(
  'await fetchInvites(userId)',
  'await fetchInvites()'
);

fs.writeFileSync('src/stores/teamStore.ts', fixedContent, 'utf-8');

console.log("Fixed teamStore.ts");
