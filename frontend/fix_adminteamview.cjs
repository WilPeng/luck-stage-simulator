const fs = require('fs');

const content = fs.readFileSync('src/views/admin/AdminTeamView.vue', 'utf-8');

let fixedContent = content;

fixedContent = fixedContent.replace(
  'playerStore.getUserById',
  'playerStore.getPlayerById'
);

fixedContent = fixedContent.replace(
  'teamStore.lockTeam',
  'teamStore.lock'
);

fixedContent = fixedContent.replace(
  'teamStore.saveTeams',
  'teamStore.fetchTeams'
);

fs.writeFileSync('src/views/admin/AdminTeamView.vue', fixedContent, 'utf-8');

console.log("Fixed AdminTeamView.vue");
