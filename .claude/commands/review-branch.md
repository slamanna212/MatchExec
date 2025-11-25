Perform a comprehensive bug and logic error review before merging the current branch into the target branch.

**Instructions for Claude:**

1. Detect the current branch name
2. Ask me which target branch to compare against (default: dev)
3. Launch a Plan/Explore subagent with "very thorough" analysis

**Subagent Tasks:**

**Compare Branches**
- Run `git log <target>..<current>` to see commits unique to current branch
- Run `git diff <target>...<current> --stat` for file change summary
- Run `git diff <target>...<current>` for detailed changes
- Identify which files and systems were modified

**Categorize Changes by System**
- Web app (Next.js, API routes, UI components in src/app/)
- Discord bot (processes/discord-bot/)
- Scheduler (processes/scheduler/)
- Database (migrations/, schema changes)
- Shared libraries (src/lib/)
- Configuration (ecosystem.config.js, package.json, Dockerfile)

**Look for Common Bug Patterns**
- Error handling issues (missing try/catch, unhandled promises)
- SQLite3 callback API misuse (this project uses sqlite3, NOT better-sqlite3)
- Race conditions in async code
- Missing null/undefined checks
- Type safety issues (TypeScript any types, missing validations)
- API endpoint validation (missing input validation, error responses)
- Discord bot error handling (queue operations, voice channel management)
- Off-by-one errors, boundary conditions
- Timezone handling issues

**Review Critical Areas**
- Database queries and migrations (SQLite callback patterns)
- Match state transitions (created → gather → assign → battle → complete/cancelled)
- Tournament bracket logic (single/double elimination)
- Scoring system calculations
- Discord integration (announcements, reminders, voice, queues)
- API authentication/authorization
- Process communication between web/bot/scheduler
- PM2 and s6-overlay process management

**Check Configuration and Dependencies**
- package.json for dependency changes or version bumps
- Environment variable usage and validation
- Migration files in /migrations/
- Game data seeding logic

**Identify High-Risk Code**
- Complex logic that was recently modified
- Code with multiple nested conditionals
- Database transactions and concurrent operations
- State management changes
- API route handlers with side effects

**Required in Final Report:**
- Executive summary of changes (what was added/modified/removed)
- List of modified files grouped by system
- Prioritized list of areas requiring manual review (highest risk first)
- Specific files and line numbers for any issues found
- Code snippets showing potential bugs with explanations
- Recommendations for testing focus areas
- Any critical bugs or logic errors discovered

**Focus on finding issues that could cause:**
- Data corruption or inconsistency
- Application crashes or process failures
- Discord bot failures or command errors
- Match/tournament state inconsistencies
- Race conditions or deadlocks
- Security vulnerabilities (injection, XSS, etc.)
- Memory leaks or resource exhaustion
- Incorrect business logic
