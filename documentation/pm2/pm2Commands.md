# PM2 Commands Reference Guide

This document explains each PM2 command used in your Node.js API GameScore project, breaking down every parameter and option.

## Command 1: Main Application Server
## name:  new-node-api-gamescore

```bash
pm2 start npm --name new-node-api-gamescore -- start --prefix /mnt/data/home/master/new-node-api-gamescore/
```

### Breakdown:
- **`pm2 start`**: PM2 command to start a new process
- **`npm`**: The command to execute (npm in this case)
- **`--name new-node-api-gamescore`**: Sets a custom name for the PM2 process
- **`--`**: Separator that passes everything after it as arguments to the npm command
- **`start`**: The npm script to run (equivalent to `npm start`)
- **`--prefix /mnt/data/home/master/new-node-api-gamescore/`**: Sets the working directory for npm commands

**Purpose**: Starts the main Node.js API server using npm start from the specified directory.

---

## Command 2: Twice Daily Fixture Updates
## name: new-insert-other-fixtures-twice-daily

```bash
pm2 start /mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllOtherFixtures.js \
  --name "new-insert-other-fixtures-twice-daily" \
  --no-autorestart \
  --cron "0 0,12 * * *" \
  --cwd /mnt/data/home/master/new-node-api-gamescore
```

### Breakdown:
- **`pm2 start`**: PM2 command to start a new process
- **`/mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllOtherFixtures.js`**: The JavaScript file to execute
- **`--name "new-insert-other-fixtures-twice-daily"`**: Custom name for the process
- **`--no-autorestart`**: Prevents PM2 from automatically restarting the process when it exits
- **`--cron "0 0,12 * * *"`**: Cron expression for scheduling
  - `0`: Minutes (0 = at the top of the hour)
  - `0,12`: Hours (runs at midnight and noon)
  - `*`: Day of month (every day)
  - `*`: Month (every month)
  - `*`: Day of week (every day of the week)
- **`--cwd /mnt/data/home/master/new-node-api-gamescore`**: Sets the current working directory

**Purpose**: Runs fixture updates twice daily at midnight (00:00) and noon (12:00).

---

## Command 3: Twice Daily Map Players Update
## name: new-insert-map-stats-team-players-twice-daily

```bash
pm2 start /mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllInsertMapTeamPlayers.js \
  --name "new-insert-map-stats-team-players-twice-daily" \
  --no-autorestart \
  --cron "10 0,12 * * *" \
  --cwd /mnt/data/home/master/new-node-api-gamescore/
```

### Breakdown:
- **`pm2 start`**: PM2 command to start a new process
- **`/mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllInsertMapTeamPlayers.js`**: Script for mapping team players
- **`--name "new-insert-map-stats-team-players-twice-daily"`**: Process identifier
- **`--no-autorestart`**: Disables automatic restart on exit
- **`--cron "10 0,12 * * *"`**: Cron expression
  - `10`: At minute 10
  - `0,12`: Every 12 hours (at midnight and noon)
  - `*`: Every day of month
  - `*`: Every month
  - `*`: Every day of week
- **`--cwd /mnt/data/home/master/new-node-api-gamescore/`**: Working directory specification

**Purpose**: Updates player mappings twice a day at 00:10 and 12:10.

---

## Command 4: Once Daily Active Updates
## name: new-active-updates-once-daily

```bash
pm2 start /mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllActiveUpdates.js \
  --name "new-active-updates-once-daily" \
  --no-autorestart \
  --cron "0 3 * * *" \
  --cwd /mnt/data/home/master/new-node-api-gamescore/
```

### Breakdown:
- **`pm2 start`**: PM2 command to start a new process
- **`/mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllActiveUpdates.js`**: Script for active data updates
- **`--name "new-active-updates-once-daily"`**: Process identifier
- **`--no-autorestart`**: Disables automatic restart on exit
- **`--cron "0 3 * * *"`**: Runs once daily at 3:00 AM
- **`--cwd /mnt/data/home/master/new-node-api-gamescore/`**: Working directory specification

**Purpose**: Performs active data updates once every day at 3:00 AM.

---

## Command 5: Once Daily Competition Status Update
## name: new-update-competition-status-once-daily

```bash
pm2 start /mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllUpdateCompetitionStatusDaily.js \
  --name "new-update-competition-status-once-daily" \
  --no-autorestart \
  --cron "0 22 * * *" \
  --cwd /mnt/data/home/master/new-node-api-gamescore/
```

### Breakdown:
- **`pm2 start`**: PM2 command to start a new process
- **`/mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllUpdateCompetitionStatusDaily.js`**: Competition status update script
- **`--name "new-update-competition-status-once-daily"`**: Process identifier
- **`--no-autorestart`**: Disables automatic restart on exit
- **`--cron "0 22 * * *"`**: Runs once daily at 10:00 PM (22:00)
- **`--cwd /mnt/data/home/master/new-node-api-gamescore/`**: Working directory specification

**Purpose**: Updates competition status once every day at 10:00 PM.

---

## Command 6: Six Times Per Hour Match Events Update
## name: six-times-per-hour-match-events-update

```bash
pm2 start /mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllCsMatchEventsCopy.js \
  --name "six-times-per-hour-match-events-update" \
  --no-autorestart \
  --cron "5-59/10 * * * *" \
  --cwd /mnt/data/home/master/new-node-api-gamescore/
```

### Breakdown:
- **`pm2 start`**: PM2 command to start a new process
- **`/mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllCsMatchEventsCopy.js`**: CS (Counter-Strike) match events copying script
- **`--name "six-times-per-hour-match-events-update"`**: Process identifier
- **`--no-autorestart`**: Disables automatic restart on exit
- **`--cron "5-59/10 * * * *"`**: Runs 6 times per hour, at minutes 5, 15, 25, 35, 45, and 55.
- **`--cwd /mnt/data/home/master/new-node-api-gamescore/`**: Working directory specification

**Purpose**: Copies Counter-Strike match events data six times every hour.

---

## Command 7: Create New Competitions Twice Daily
## name: new-create-competitions-twice-daily

```bash
pm2 start /mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllInsertCompetitions.js \
  --name "new-create-competitions-twice-daily" \
  --no-autorestart \
  --cron "0 1,13 * * *" \
  --cwd /mnt/data/home/master/new-node-api-gamescore/
```

### Breakdown:
- **`pm2 start`**: PM2 command to start a new process
- **`/mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllInsertCompetitions.js`**: Script to insert new competitions
- **`--name "new-create-competitions-twice-daily"`**: Process identifier
- **`--no-autorestart`**: Disables automatic restart on exit
- **`--cron "0 1,13 * * *"`**: Runs twice daily at 1:00 AM and 1:00 PM (13:00)
- **`--cwd /mnt/data/home/master/new-node-api-gamescore/`**: Working directory specification

**Purpose**: Creates new competitions twice a day at 1:00 AM and 1:00 PM.

---

## Command 8: AI Competition Descriptions Update
## name: new-all-competition-descriptions-ai

```bash
pm2 start /mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllCompetitionDescriptionsAI.js \
  --name "new-all-competition-descriptions-ai" \
  --no-autorestart \
  --cron "*/20 * * * *" \
  --cwd /mnt/data/home/master/new-node-api-gamescore/
```

### Breakdown:
- **`pm2 start`**: PM2 command to start a new process
- **`/mnt/data/home/master/new-node-api-gamescore/src/scripts/runAllCompetitionDescriptionsAI.js`**: The script that generates AI descriptions for competitions.
- **`--name "new-all-competition-descriptions-ai"`**: Custom name for the process.
- **`--no-autorestart`**: Prevents PM2 from automatically restarting the process upon completion.
- **`--cron "*/20 * * * *"`**: A cron pattern that schedules the script to run every 20 minutes.
- **`--cwd /mnt/data/home/master/new-node-api-gamescore/`**: Sets the script's working directory.

**Purpose**: Periodically generates and updates competition descriptions using an AI model. It runs every 20 minutes to process competitions that are missing a description.

---

## Command 9: Live Fixture Monitor (persistent WebSocket listener)
## name: RUN-LIVE-FIXTURE-MONITORS

```bash
pm2 start /mnt/data/home/master/new-node-api-gamescore/src/scripts/runLiveFixtureMonitors.js \
  --name "RUN-LIVE-FIXTURE-MONITORS" \
  --cwd /mnt/data/home/master/new-node-api-gamescore
```

### Breakdown:
- **`pm2 start`**: PM2 command to start a new process
- **`/mnt/data/home/master/new-node-api-gamescore/src/scripts/runLiveFixtureMonitors.js`**: Polls GameScorekeeper's REST API every 15 minutes (`sport=cs2` only) for fixtures with `status=started`, then opens a persistent per-fixture WebSocket via `src/live-data-updater.js` for each newly detected fixture.
- **`--name "RUN-LIVE-FIXTURE-MONITORS"`**: Process identifier.
- **`--cwd /mnt/data/home/master/new-node-api-gamescore`**: Working directory specification.

**Purpose**: Keeps live cs2 fixture scores/status/end_time in sync in near-real-time and forwards each update via HTTP POST to WP dev/staging/prod, RR dev, and Pickem prod/staging.

**Unlike every other process in this document, this one does NOT use `--cron` / `--no-autorestart`.** It's a long-running listener, not a scheduled batch job — it has to stay up continuously to hold its WebSocket connections open, so it runs with the default `autorestart: true` and no cron schedule. If it crashes, PM2 restarts it immediately instead of waiting for the next cron tick.

**Note**: this process must be restarted manually (`pm2 restart RUN-LIVE-FIXTURE-MONITORS`) whenever `src/live-data-updater.js` or any of its dependencies (`src/inserts/insertUpdatesOnLiveFixturesScores.js`, `src/inserts/live-data/*`) are deployed — PM2 does not reload it automatically on file change.

---

## Common PM2 Options Explained

### `--cwd` (Current Working Directory)
Sets the working directory where the script will run. This ensures file paths are resolved correctly.

### `--name`
Assigns a human-readable name to the PM2 process, making it easier to identify and manage.

### `--no-autorestart`
Prevents PM2 from automatically restarting the process when it completes or crashes. Useful for scheduled tasks that should run once and then stop.

### `--cron`
Enables cron-based scheduling using standard cron syntax:
```
* * * * *
| | | | |
| | | | └─ Day of week (0-6, Sunday = 0)
| | | └─── Month (1-12)
| | └───── Day of month (1-31)
| └─────── Hour (0-23)
└───────── Minute (0-59)
```

## Schedule Summary

| Process |
|-----------|-----------|----------------------------------------------------|
| new-insert-other-fixtures-twice-daily | Every 12 hours | 00:00, 12:00 |
| new-insert-map-stats-team-players-twice-daily | Twice a day | 00:10, 12:10 |
| new-active-updates-once-daily | Once a day | 03:00 |
| new-update-competition-status-once-daily | Once a day | 22:00 |
| six-times-per-hour-match-events-update | 6 times per hour | Every hour at minutes 5, 15, 25, 35, 45, 55 |
| new-create-competitions-twice-daily | Twice a day | 01:00, 13:00 |
| new-all-competition-descriptions-ai | 3 times per hour | Every hour at minutes 0, 20, 40 |
| RUN-LIVE-FIXTURE-MONITORS | Continuous (not cron-based) | Runs permanently; polls internally every 15 min |

## Useful PM2 Management Commands

Here’s a more detailed guide to common PM2 commands for managing your processes. You can target a process using its `name` (e.g., `new-node-api-gamescore`) or its `id`.

---

### Listing Processes

To see all processes currently managed by PM2, use `list`.

```bash
# List all processes with their status and resource usage
pm2 list
```
*Alias: `pm2 ls`*

The output table includes:
- **`id`**: The unique process ID.
- **`name`**: The name you assigned with `--name`.
- **`mode`**: `fork` or `cluster`.
- **`status`**: `online`, `stopped`, `errored`, etc.
- **`cpu`**: CPU percentage being used.
- **`memory`**: Memory usage.

---

### Monitoring Processes

For a real-time dashboard inside your terminal, use `monit`.

```bash
# Monitor CPU and memory of all processes in real-time
pm2 monit
```
This is great for a quick health check.

---

### Viewing Logs

To view the logs of a specific process or all processes, use `logs`.

```bash
# View logs for a specific process
pm2 logs <name>

# Example:
pm2 logs new-node-api-gamescore

# View logs for all processes combined
pm2 logs

# Show the last 200 lines
pm2 logs --lines 200

# Stream logs in real-time (similar to tail -f)
pm2 logs --raw
```

---

### Stopping a Process

To stop a running process without removing it from the PM2 list, use `stop`. The process can be started again later.

```bash
# Stop a specific process by name
pm2 stop <name>

# Example:
pm2 stop new-node-api-gamescore

# Stop a process by ID
pm2 stop <id>

# Stop all processes
pm2 stop all
```

---

### Starting a Stopped Process

If a process is stopped, you can start it again without re-creating it.

```bash
# Start a previously stopped process by name
pm2 start <name>

# Example:
pm2 start new-node-api-gamescore
```

---

### Restarting a Process

To restart a process, use `restart`. This is often a zero-downtime operation for clustered applications.

```bash
# Restart a specific process by name
pm2 restart <name>

# Example:
pm2 restart "twice-daily-fixture-update"

# Restart all processes
pm2 restart all
```
**Note**: For cron-based jobs (`--no-autorestart`), `restart` will run them immediately, and they will still run on their next scheduled time.

---

### Reloading a Process (Zero-downtime)

For applications running in `cluster` mode, `reload` provides a true zero-downtime restart by restarting each worker one by one.

```bash
# Reload a specific process
pm2 reload <name>

# Reload all processes
pm2 reload all
```
This is generally preferred over `restart` for stateless web servers.

---

### Deleting a Process

To stop a process AND remove it from the PM2 list, use `delete`. Once deleted, you must use the original `pm2 start` command to run it again.

```bash
# Delete a specific process by name
pm2 delete <name>

# Example:
pm2 delete new-node-api-gamescore

# Delete all processes
pm2 delete all
```

---

### Saving Your Process List

To ensure your processes restart automatically after a server reboot, you need to do two things: save the process list and create a startup script.

```bash
# Save the list of currently running processes
pm2 save
```
This command saves the process list to a file in your PM2 home directory (usually `~/.pm2/dump.pm2`).

### Automating Startup on Server Reboot

PM2 can generate a script that will automatically start PM2 and your saved processes when the server boots up.

```bash
# Generate a startup script for your OS
pm2 startup
```
This command will output another command that you need to run with administrator/root privileges. Once you run it, your saved process list will be restored on every server reboot.
