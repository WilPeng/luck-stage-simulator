const fs = require('fs');

const content = fs.readFileSync('src/views/player/PlayerTeamView.vue', 'utf-8');

let fixedContent = content;

fixedContent = fixedContent.replace(
  'await teamStore.fetchApplications(currentTeam.value?.id)',
  'await teamStore.fetchApplications()'
);

fixedContent = fixedContent.replace(
  'await teamStore.fetchInvites(currentUser.value?.id)',
  'await teamStore.fetchInvites()'
);

fs.writeFileSync('src/views/player/PlayerTeamView.vue', fixedContent, 'utf-8');

console.log("Fixed PlayerTeamView.vue");
