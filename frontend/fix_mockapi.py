import re

with open('src/services/mockApi.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old_code = '''        const score = calculatePlayerScore(user, song, randomInt(-5, 10), teamBonus)
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
        })'''

new_code = '''        const randomScoreVal = randomInt(-5, 10)
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
        })'''

content = content.replace(old_code, new_code)

with open('src/services/mockApi.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed mockApi.ts")