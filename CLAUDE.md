# Deep Bag — Claude Instructions

## Project Overview
NBA dynasty fantasy rankings website at thedeepbag.com. Static site hosted on GitHub Pages with a daily GitHub Actions workflow that fetches fresh ESPN data and commits it back to the repo.

## File Structure
- `index.html` — entire frontend: HTML, CSS, and JS in one file
- `update-stats.js` — Node.js script that fetches ESPN data and writes data.js and news.js
- `data.js` — auto-generated player stats (do not edit manually)
- `news.js` — auto-generated ESPN injury/news feed (do not edit manually)
- `favicon.svg` — site favicon
- `.github/workflows/update-stats.yml` — daily GitHub Action that runs update-stats.js and commits output files

## How to Update Data
```
cd C:\Users\User\deep-bag
node update-stats.js
```
Then commit and push data.js and news.js.

## Git Workflow
- Remote often has commits from the daily GitHub Action — always `git pull --rebase` before pushing
- When data.js or news.js conflict during rebase, use `git checkout --theirs data.js news.js` (our freshly generated files win)
- Use `GIT_EDITOR=true git rebase --continue` to proceed without opening an editor

## ESPN API
- No authentication required
- Season ID for 2025-26 season is `2026`
- Roster endpoint: `site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{id}/roster`
- Stats leaders: `sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/types/2/leaders?limit=500`
- Athlete stats: `sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/types/2/athletes/{id}/statistics/0`
- Injuries/news: `site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries`

## Code Conventions
- No build tools, no npm, no frameworks — plain HTML/CSS/JS only
- All JS lives inside a single `<script>` tag at the bottom of index.html
- CSS lives in a single `<style>` tag in the `<head>`
- State variables are module-level `let` declarations
- Use `const` for fixed config (CATS array, NAME_ALIASES, PEAK_AGE)
- No TypeScript, no transpilation
- Prefer editing existing code over adding new files
- Do not add comments unless logic is genuinely non-obvious
- Do not add error handling for scenarios that can't happen

## Design System
- Dark theme only
- CSS variables defined in `:root` — always use them, never hardcode colors
  - `--bg: #0d0d14` — page background
  - `--surface: #1a1a2e` — card/panel background
  - `--surface2: #16213e` — secondary surface
  - `--border: #2a2a4a` — borders
  - `--accent: #f97316` — orange, primary accent
  - `--accent-dim: rgba(249, 115, 22, 0.12)` — subtle accent tint
  - `--text: #e2e8f0` — primary text
  - `--text-dim: #94a3b8` — secondary/muted text
  - `--green: #22c55e`
  - `--red: #ef4444`
- Buttons use `.heatmap-btn` class (toggle buttons in the controls bar)
- Active state: `.active` class on buttons

## Key State Variables
```js
let allRanked      // output of rankPlayers(), source of truth for the table
let filtered       // current filtered/sorted slice shown in the table
let rawData        // raw ESPN player array, mutated by Fantrax import for positions
let leagueData     // Map of normName → { owner, fantaxPos }
let myTeam         // Set of normNames on user's team
let myTeamName     // string, user's selected Fantrax team name
let showZCats      // bool, swap stat columns to Z-scores
let newsMode       // bool, show simplified news layout
let heatmap        // bool, color stat cells by Z-score
let faOnly         // bool, show only FA + my team
let minGP          // number, minimum games played filter
let ageFactor      // 0–0.15, from age weight slider
let availWeight    // 0–1.0, from availability slider
let scarcityWeight // 0–1.0, from scarcity slider
```

## Player Name Matching
- `normName(n)` — strips Jr/Sr/II/III/IV/V suffixes, removes non-alphanumeric, lowercases
- `NAME_ALIASES` map handles players whose ESPN and Fantrax names differ genuinely
- When a new name mismatch is found, add it to NAME_ALIASES in index.html

## Fantasy Categories (9 standard)
PTS, REB, AST, STL, BLK, 3PM, FG%, FT%, TO
- TO is bad (lower is better) — handled by `cat.good = false` in the CATS array
- FG%/FT% use impact scoring: `(player% − leagueAvg%) × makes/game`

## Fantrax CSV Import
- Columns: ID, Player, Team, Position, RkOv, Status, Age, Opponent, Score, Ros, +/-, FG%, 3PTM, FT%, PTS, REB, AST, ST, BLK, TO
- Status column = fantasy owner (FA = free agent, otherwise team name)
- Position field is quoted and may contain commas e.g. "PG,SG,G" — use the quoted CSV parser
- Currently only uses first position from the list (multi-position support is a backlog item)

## Backlog
1. **Slider-weighted category Z-scores** — Currently the age, availability, and scarcity sliders only affect Dynasty Z. Adjust the individual category Z-score columns (and the base Z-Score total) to also reflect the slider weightings, so the whole table is consistent with the displayed Dynasty Z.
2. **Recent-form bias** — Add a slider or toggle to weight rankings toward the last 7, 14, 30, or 60 days of stats instead of the full season. Requires fetching shorter time-window stats from ESPN (the athlete stats endpoint may support date-range params, or use the game log endpoint to aggregate recent games).
3. **Free agent schedule analysis** — When browsing free agents, surface each player's upcoming game count for the current/next week so the user can prioritize pickups based on schedule density, not just season averages.
4. **Multi-position support** — Fantrax CSV import currently only uses the first position from the list; support all positions (e.g. "PG,SG,G")
5. **Matchup analyzer** — After importing a Fantrax CSV, user selects an opponent team. The tool shows a head-to-head category breakdown (my team vs. theirs), recommends a strategic focus (e.g. "concede TO, attack BLK/STL"), and generates an optimal day-by-day lineup for the week that maximizes the projected category wins given each player's scheduled games. Requires knowing which players are on the opponent's roster (available from `leagueData`) and each player's remaining game schedule for the week (ESPN schedule API).
6. **Win/win trade finder** — Analyze all other teams' rosters to infer their likely punt categories (categories where their roster is systematically weak), then identify trades where the user gives away excess in a punted category and receives back in a targeted one — flagging deals that are net positive for both sides.
7. **Multi-platform league import** — Currently supports Fantrax CSV only. Add ingestion of roster/ownership data from other major fantasy platforms (ESPN, Yahoo, etc.) so users on those platforms can use all league-aware features (matchup analyzer, trade finder, FA filter, etc.).
8. **Pay/free tier** — Gate advanced features (e.g. matchup analyzer, trade finder) behind a paid tier; keep core rankings and stats free.

## User
- Complete beginner, non-technical. Build autonomously and explain what was done in plain English.
- Commit and push after every meaningful change — don't leave things in a half-deployed state.
- Always run `node update-stats.js` and push data.js/news.js when changes to update-stats.js are made.
