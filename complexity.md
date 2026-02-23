# Complexity Issues Tracker

All functions exceeding the ESLint complexity limit of 15. Fix and check off each item.

## Backend

- [ ] **49** — `processMatchEditQueue` — `processes/discord-bot/modules/queue-processor.ts:1475`
  Summary of changes to queue-processor.ts:                                                                                                          
                                                                                                                                                     
  1. Added MatchEditData and MatchMessageRecord interfaces (near line 73) to type the extracted method signatures.                                   
  2. Extracted updateEmbedTimeFields — synchronous helper (~complexity 4) that mutates the embed's time fields in place.                             
  3. Extracted updateEmbedMapsField — async helper (~complexity 6) that parses map JSON, looks up display names in DB, and updates/removes the maps
  field. Returns { maps, changed }.
  4. Extracted updateMatchScheduledEvent — async helper (~complexity 5) with its own try/catch for the guild → scheduled event edit block.
  5. Extracted updateMatchAnnouncementEmbed — async helper (~complexity 8) wrapping the full embed rebuild with its own try/catch. Calls the three
  helpers above.
  6. Extracted processSingleMatchEdit — handles the per-item lifecycle: mark processing → fetch data → call embed/event updaters → mark completed.
  7. processMatchEditQueue is now ~complexity 6 — just fetches pending edits, loops, delegates to processSingleMatchEdit, and handles failures.

- [ ] **17** — `processVoiceAnnouncementQueue` — `processes/discord-bot/modules/queue-processor.ts:1112`
- [ ] **21** — `POST` — `src/app/api/tournaments/route.ts:68`
- [ ] **19** — `PUT` — `src/app/api/matches/[matchId]/route.ts:60`
- [ ] **17** — `POST` — `src/app/api/tournaments/[tournamentId]/transition/route.ts:15`
- [ ] **16** — `POST` — `src/app/api/tournaments/[tournamentId]/generate-matches/route.ts:31`

## Frontend Components

- [ ] **36** — `MatchDetailsModal` — `src/components/match-details-modal.tsx:95`
- [ ] **29** — Arrow function — `src/components/navigation.tsx:177`
- [ ] **28** — `MatchInfoPanel` — `src/components/match-details/MatchInfoPanel.tsx:64`
- [ ] **21** — Arrow function — `src/app/matches/[matchId]/edit/page.tsx:133`
- [ ] **20** — `MatchContentPanel` — `src/components/match-details/MatchContentPanel.tsx:102`
- [ ] **19** — `MapDetailPanel` — `src/components/scoring/SimpleMapScoring.tsx:249`
- [ ] **18** — `ReminderCard` — `src/components/match-details/ReminderCard.tsx:25`
- [ ] **16** — `TournamentInfoPanel` — `src/components/tournament-details/TournamentInfoPanel.tsx:39`
