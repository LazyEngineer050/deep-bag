/**
 * Deep Bag — Stats Updater
 * Run this script to pull fresh NBA stats from ESPN.
 *
 * Usage:  node update-stats.js
 *
 * It fetches:
 *   1. All 30 team rosters  → player names + team abbreviations
 *   2. League-wide stat leaders → per-game stats for all 9 fantasy categories
 *
 * Writes:  data.js  (loaded automatically by index.html)
 * Runtime: ~10–20 seconds
 */

const https = require('https');
const zlib  = require('zlib');
const fs    = require('fs');
const path  = require('path');

// ── helpers ────────────────────────────────────────────────────────────────
function get(hostname, urlPath) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname,
            path: urlPath,
            headers: {
                'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept':          'application/json',
                'Accept-Encoding': 'gzip, deflate',
            },
        };
        const req = https.get(options, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                zlib.gunzip(buf, (err, decoded) => {
                    const text = err ? buf.toString('utf8') : decoded.toString('utf8');
                    try { resolve(JSON.parse(text)); }
                    catch (e) { reject(new Error('Bad JSON: ' + text.substring(0, 200))); }
                });
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function log(msg) { process.stdout.write('\r' + msg.padEnd(70)); }

// ── 1. fetch team IDs ──────────────────────────────────────────────────────
async function fetchTeamIds() {
    log('Fetching team list...');
    const data = await get(
        'sports.core.api.espn.com',
        '/v2/sports/basketball/leagues/nba/seasons/2025/teams?limit=50'
    );
    // each item is { $ref: "http://...teams/1?..." }
    return data.items.map(item => {
        const match = item['$ref'].match(/\/teams\/(\d+)/);
        return match ? match[1] : null;
    }).filter(Boolean);
}

// ── 2. fetch roster for one team ──────────────────────────────────────────
async function fetchRoster(teamId) {
    const data = await get(
        'site.api.espn.com',
        `/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`
    );
    // returns { athletes: [{id, fullName, ...}] }
    const abbr = data.team?.abbreviation ?? '???';
    return (data.athletes || []).map(a => ({
        id:   String(a.id),
        name: a.fullName,
        team: abbr,
        age:  a.dateOfBirth ? (Date.now() - new Date(a.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000) : null,
        pos:  a.position?.abbreviation ?? '—',
    }));
}

// ── 3. fetch all player stats via leaders endpoint ────────────────────────
async function fetchStats() {
    log('Fetching league stats...');
    const data = await get(
        'sports.core.api.espn.com',
        '/v2/sports/basketball/leagues/nba/seasons/2025/types/2/leaders?limit=500'
    );

    // Map ESPN category names → our internal keys
    const catMap = {
        pointsPerGame:        'pts',
        reboundsPerGame:      'reb',
        assistsPerGame:       'ast',
        stealsPerGame:        'stl',
        blocksPerGame:        'blk',
        '3PointsMadePerGame': 'fg3m',
        fieldGoalPercentage:  'fg_pct',
        FreeThrowPct:         'ft_pct',
        avgTurnovers:         'turnover',
        minutesPerGame:       'min',
        points:               'totalPts',  // used to derive GP
    };

    const statsById = {}; // { athleteId: { pts, reb, ... } }

    for (const cat of data.categories) {
        const key = catMap[cat.name];
        if (!key) continue;

        for (const leader of cat.leaders) {
            // extract athlete id from the $ref URL
            const refMatch = leader.athlete['$ref'].match(/\/athletes\/(\d+)/);
            if (!refMatch) continue;
            const id = refMatch[1];

            if (!statsById[id]) statsById[id] = {};
            statsById[id][key] = leader.value;
        }
    }

    return statsById;
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
    console.log('Deep Bag — Stats Updater\n');

    // Team IDs
    const teamIds = await fetchTeamIds();
    console.log(`\nFound ${teamIds.length} teams.`);

    // Rosters (parallel, but polite — 5 at a time)
    const playerMap = {}; // id → { name, team }
    for (let i = 0; i < teamIds.length; i += 5) {
        const batch = teamIds.slice(i, i + 5);
        log(`Fetching rosters... (${Math.min(i + 5, teamIds.length)}/${teamIds.length})`);
        const rosters = await Promise.all(batch.map(fetchRoster));
        rosters.flat().forEach(p => { playerMap[p.id] = { name: p.name, team: p.team, age: p.age, pos: p.pos }; });
    }
    console.log(`\nLoaded ${Object.keys(playerMap).length} players.`);

    // Stats
    const statsById = await fetchStats();
    console.log(`\nReceived stats for ${Object.keys(statsById).length} players.`);

    // Merge — start from ALL rostered players, attach stats where available
    const players = Object.entries(playerMap).map(([id, info]) => {
        const stats = statsById[id] ?? {};
        const hasStats = Object.keys(stats).length > 0;
        return {
            id,
            name:     info.name,
            team:     info.team,
            age:      info.age  ?? null,
            pos:      info.pos  ?? '—',
            hasStats,
            gp:  (stats.pts && stats.totalPts) ? Math.round(stats.totalPts / stats.pts) : null,
            min: stats.min ?? null,
            pts:      stats.pts      ?? null,
            reb:      stats.reb      ?? null,
            ast:      stats.ast      ?? null,
            stl:      stats.stl      ?? null,
            blk:      stats.blk      ?? null,
            fg3m:     stats.fg3m     ?? null,
            fg_pct:   stats.fg_pct   != null ? stats.fg_pct   / 100 : null,
            ft_pct:   stats.ft_pct   != null ? stats.ft_pct   / 100 : null,
            turnover: stats.turnover ?? null,
        };
    });

    // Write data.js
    const outPath = path.join(__dirname, 'data.js');
    const timestamp = new Date().toISOString();
    const js = `// Auto-generated by update-stats.js — ${timestamp}
// Do not edit manually. Run: node update-stats.js

window.PLAYER_DATA = ${JSON.stringify(players, null, 2)};
window.DATA_TIMESTAMP = "${timestamp}";
`;
    fs.writeFileSync(outPath, js, 'utf8');

    console.log(`\n✓ Wrote ${players.length} players to data.js`);
    console.log('  Open index.html in your browser to see the rankings.\n');
}

main().catch(err => {
    console.error('\nError:', err.message);
    process.exit(1);
});
