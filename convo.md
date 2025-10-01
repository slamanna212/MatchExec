> scoring for the grand finals reset match show red team and blue team and not the team names 

● Search(pattern: "red team|blue team", glob: "**/components/**/*.{tsx,ts}")
  ⎿  Found 5 files (ctrl+o to expand)

● Bash(sqlite3 app_data/data/matchexec.db "SELECT id, name, team1_name, team2_name, red_team_id, blue_team_id FROM matches WHERE name LIKE '%Grand Finals Reset%'")
  ⎿  4396258e-788a-45ff-846b-22f3b645ec09|Grand Finals Reset: Team 1 vs Team 2|||Charlie|Bravo
  ⎿  Session limit reached ∙ resets 12am
     /upgrade to increase your usage limit.

> /upgrade 
  ⎿  Login interrupted

> i didnt know i was near a limit 

● No problem! I can see the issue now - in the grand finals reset match, the team1_name and team2_name fields are empty, but the team IDs are stored in red_team_id and
  blue_team_id instead.

  Let me check the generateGrandFinalsResetMatch function to see why it's not setting the team names properly:

● Read(src/lib/tournament-bracket.ts)
  ⎿  Read 30 lines (ctrl+o to expand)

● I see - the function is receiving team1Id and team2Id but in the progress route, it's passing the team names instead of IDs. Let me check how it's being called:

● Read(src/app/api/tournaments/[tournamentId]/progress/route.ts)
  ⎿  Read 20 lines (ctrl+o to expand)

● Found it! The issue is that we're passing team1_name instead of team IDs. Let me check what fields are available:

● Read(src/app/api/tournaments/[tournamentId]/progress/route.ts)
  ⎿  Read 35 lines (ctrl+o to expand)
  ⎿  Session limit reached ∙ resets 12am
     /upgrade to increase your usage limit.



Need to fix bug with grand finals reset match then we are done with tournaments. 
Want to add support for Fortnite and give it the option of teams or 1v1 - should do standard, no build for modes? For maps there is just one
Also need to check todo file for last bits