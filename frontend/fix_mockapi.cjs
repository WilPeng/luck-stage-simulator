const fs = require('fs');

const content = fs.readFileSync('src/services/mockApi.ts', 'utf-8');

const oldCode = `        const score = calculatePlayerScore(user, song, randomInt(-5, 10), teamBonus)
        playerScores.push({
          id: 'ps_' + memberId,
          userId: memberId,
          teamId: team.id,
          vocalScore: user.attributes.vocal * song.vocalWeight,
          danceScore: user.attributes.dance * song.danceWeight,
          charmScore: user.attributes.charm * song.charmWeight,
          randomScore: score.randomScore,
          teamBonus: score.teamBonus,
          finalScore: score.finalScore,
          rank: 0
        })`;

const newCode = `        const randomScoreVal = randomInt(-5, 10)
        const finalScoreVal = calculatePlayerScore(user, song, randomScoreVal, teamBonus)
        playerScores.push({
          id: 'ps_' + memberId,
          userId: memberId,
          teamId: team.id,
          vocalScore: user.attributes.vocal * song.vocalWeight,
          danceScore: user.attributes.dance * song.danceWeight,
          charmScore: user.attributes.charm * song.charmWeight,
          randomScore: randomScoreVal,
          teamBonus,
          finalScore: finalScoreVal,
          rank: 0
        })`;

const fixedContent = content.replace(oldCode, newCode);

fs.writeFileSync('src/services/mockApi.ts', fixedContent, 'utf-8');

console.log("Fixed mockApi.ts");
