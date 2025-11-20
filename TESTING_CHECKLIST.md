# v0.6.0 Testing Checklist

Quick reference checklist for testing tonight. See TEST_PLAN_V0.6.0.md for detailed test scenarios.

## Pre-Testing Setup
- [ ] All processes running (`npm run dev:all`)
- [ ] PM2 status check (`npx pm2 status`)
- [ ] Database migrations completed
- [ ] Discord bot online
- [ ] Browser console open

## Critical Features (Must Test)

### Rocket League
- [ ] Create match with all 4 modes (1v1, 2v2, 3v3, 4v4)
- [ ] Verify all 15 maps load
- [ ] Create tournament with Rocket League
- [ ] Test signup form

### Voice Channel Auto-Creation
- [ ] Create match → transition to assign
- [ ] Verify 2 voice channels created (dual team)
- [ ] Complete match → wait 10 minutes
- [ ] Verify channels cleaned up by scheduler

### Health Monitoring
- [ ] Stop scheduler → wait 12 minutes
- [ ] Verify Discord alert sent
- [ ] Restart scheduler → verify recovery

### Match Transitions
- [ ] Create → gather (check announcement)
- [ ] Gather → assign (check voice channels created)
- [ ] Assign → battle (check match start message)

## Regression Tests (If Time Allows)
- [ ] Test one existing game (Overwatch 2 or Valorant)
- [ ] Create simple tournament (single elimination, 4 teams)
- [ ] Test scoring system
- [ ] Discord bot commands (`/ping`, `/match info`)

## Next.js 16 Compatibility
- [ ] All pages load without errors
- [ ] No console warnings
- [ ] Navigation works
- [ ] API routes respond correctly

## Issues Found
Record any issues here during testing:

| Feature | Issue | Severity |
|---------|-------|----------|
|         |       |          |

## Test Results Summary
- **Started**: _______________
- **Completed**: _______________
- **Critical Tests Passed**: _____ / _____
- **Regression Tests Passed**: _____ / _____
- **Blocker Issues**: _____
- **Recommendation**: ⬜ Merge | ⬜ Fix Issues | ⬜ Needs More Testing
