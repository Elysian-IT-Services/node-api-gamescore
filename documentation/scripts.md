# Scripts Documentation

This document provides a detailed explanation of each script located in the `src/scripts` directory. These scripts are designed to be run manually or as scheduled tasks (e.g., using PM2 cron jobs) to perform various data processing, synchronization, and population tasks.

---

## `runLiveFixtureMonitors.js`

### Purpose

Discovers cs2 fixtures that just went live and hands each one off to a persistent per-fixture WebSocket listener, so live scores/status/end_time stay in sync in near-real-time. Unlike every other script in this document, this one is not a scheduled batch job — it's meant to run continuously as a single long-lived process (PM2 process `RUN-LIVE-FIXTURE-MONITORS`, `autorestart: true`, no `cron_restart`; see `documentation/pm2/pm2Commands.md`).

### Detailed Workflow

1.  **Poll for started fixtures**: Every 15 minutes (`setInterval`, not PM2 cron), calls `GET /fixtures?status=started&sport=cs2` against GameScorekeeper's REST API for the current day.
2.  **Track fixtures already being monitored**: Keeps an in-memory `Set` of fixture IDs it has already opened a WebSocket for, so it doesn't reconnect to the same fixture on every poll.
3.  **Open a WebSocket per new fixture**: For each newly detected fixture ID, calls `connectWebSocket(fixtureId)` from `../live-data-updater.js`, which holds the connection open and processes `fixture_started` / `score_changed` / `fixture_ended` events until the match ends.

**Key Dependencies**: `axios`, `../live-data-updater.js`

**Known limitations** (see `TECHNICAL_DISCOVERY.md` for the full audit): only monitors `sport=cs2` (`SPORTS_TO_MONITOR = ['cs2']`) even though the feed also serves lol/dota2; in-memory `trackedFixtures` set is lost on restart, so a restart mid-match relies on the next 15-minute poll picking the fixture back up.

---

## `fetchCompetitionsDescriptions.js`

### Purpose

This script automatically generates and updates descriptions for competitions in the database that are missing one.

### Detailed Workflow

1.  **Database Connection**: It connects to the main MySQL database using credentials from environment variables.
2.  **Identify Missing Descriptions**: The script queries the `competitions` table to find all entries where the `description` column is `NULL`.
3.  **Call Gemini API**: For each competition without a description, it sends a request to the Google Gemini API. The request asks the AI to generate a brief, descriptive text for the tournament based on its name.
4.  **Parse Response**: It parses the JSON response from the Gemini API to extract the generated description.
5.  **Update Database**: The script then runs an `UPDATE` query to save the newly generated description into the corresponding row in the `competitions` table.
6.  **Looping and Delay**: The process runs in a loop, continuing as long as there are competitions with `NULL` descriptions. A one-second delay is included between each API call to prevent rate-limiting issues.

**Key Dependencies**: `axios`, `mysql2/promise`

---

## `runAllActiveUpdates.js`

### Purpose

This script is responsible for updating the map breakdown data for all currently active tournaments across all supported sports (e.g., CS2, LoL).

### Detailed Workflow

1.  **Import Dependencies**: It imports the core function `updateActiveMapBreakdowns` and the database connections for each sport (`dbCS2`, `dbLOL`).
2.  **Iterate Through Sports**: The script dynamically identifies the configured sports from the imported database connections. It then loops through each one.
3.  **Execute Update**: Inside the loop, it calls the `updateActiveMapBreakdowns(sport)` function. This function contains the logic to identify active tournaments for that sport and update their associated map breakdown data.
4.  **Logging**: It logs the start and end of processing for each sport and provides a final summary of which sports were processed successfully or unsuccessfully.

**Key Dependencies**: `../middleware/updateActiveTournamentsMapBreakdowns.js`, `../db.js`

---

## `runAllCsMatchEventsCopy.js`

### Purpose

This script processes and inserts match events (like kills, assists, etc.) from a source to a destination table for all supported sports. While named with "Cs" (Counter-Strike), it is designed to be sport-agnostic.

### Detailed Workflow

1.  **Import Dependencies**: It imports the main processing function `processCsMatchEvents` from `../inserts/csMatchEventsCopy.js` and the database connections.
2.  **Iterate Through Sports**: It loops through each configured sport (CS2, LoL, etc.).
3.  **Process Events**: For each sport, it calls `processCsMatchEvents(sport)`, which handles the logic for fetching, transforming, and inserting match event data into the database.
4.  **Logging**: The script provides detailed logs for which sports are being processed and reports a final count of successful and failed operations.

**Key Dependencies**: `../inserts/csMatchEventsCopy.js`, `../db.js`

---

## `runAllInsertMapTeamPlayers.js`

### Purpose

This script populates the database with data that links players to specific teams for each map played in a fixture.

### Detailed Workflow

1.  **Import Dependencies**: It imports the `processMapTeamPlayers` function from `../inserts/insertMapTeamPlayers.js` and the database connections.
2.  **Iterate Through Sports**: The script runs in a loop for each supported sport.
3.  **Insert Data**: In each iteration, it calls `processMapTeamPlayers(sport)`. This function contains the logic to fetch player, team, and map associations and insert them into the relevant database tables.
4.  **Logging**: It logs the progress for each sport and provides a summary at the end of the execution.

**Key Dependencies**: `../inserts/insertMapTeamPlayers.js`, `../db.js`

---

## `runAllOtherFixtures.js`

### Purpose

This script is responsible for inserting "other" fixtures into the database. This likely refers to fixtures that are not from a primary source or require a different processing method.

### Detailed Workflow

1.  **Import Dependencies**: It imports the `processFixtures` function from `../inserts/insertOnlyOtherFixtures.js` and the database connections.
2.  **Iterate Through Sports**: It loops through all configured sports.
3.  **Process and Insert Fixtures**: For each sport, it calls `processFixtures(sport)`, which handles the fetching and insertion of these specific types of fixtures.
4.  **Logging**: The script logs its progress and reports a summary of successful and failed operations across the different sport databases.

**Key Dependencies**: `../inserts/insertOnlyOtherFixtures.js`, `../db.js`

---

## `runAllUpdateCompetitionStatusDaily.js`

### Purpose

This script runs on a daily basis to update the status of competitions (e.g., changing from "upcoming" to "active" or "active" to "finished").

### Detailed Workflow

1.  **Import Dependencies**: It imports the `updateCompetitionStatus` function from `../sync/updateCompetitionStatusDaily.js` and the database connections.
2.  **Iterate Through Sports**: The script loops through each supported sport.
3.  **Update Status**: In each loop, it calls `updateCompetitionStatus(sport)`. This function implements the logic to check the dates and status of competitions and update them as necessary.
4.  **Logging**: It provides logs for each sport being processed and a final summary of the execution.

**Key Dependencies**: `../sync/updateCompetitionStatusDaily.js`, `../db.js`

---

## `runAllInsertCompetitions.js`

### Purpose

This script is designed to fetch and insert new competitions into the database for all supported sports.

### Detailed Workflow

1.  **Import Dependencies**: It imports the core function `getAndSaveCompetitions` from `../inserts/insertCompetitions.js` and the database connections for each sport.
2.  **Iterate Through Sports**: The script dynamically identifies the configured sports and loops through each one (e.g., CS2, LoL).
3.  **Execute Insertion**: Inside the loop, it calls `getAndSaveCompetitions(sport)`. This function contains the logic to fetch competition data from an external source and save it into the database for the specified sport.
4.  **Logging**: It logs the start and end of processing for each sport and provides a final summary report detailing which sports were processed successfully and which failed.

**Key Dependencies**: `../inserts/insertCompetitions.js`, `../db.js`

---

## `runAllCompetitionDescriptionsAI.js`

### Purpose

This script orchestrates the generation of AI-powered descriptions for competitions across all supported sports (e.g., CS2, LoL). It iterates through each sport and runs a dedicated script to handle the description generation for that sport's database.

### Detailed Workflow

1.  **Import Dependencies**: It imports the database connections (`dbCS2`, `dbLOL`) to dynamically identify the configured sports.
2.  **Iterate Through Sports**: The script loops through each sport identified from the database connections.
3.  **Execute Child Script**: For each sport, it spawns a new Node.js child process to execute `src/inserts/insertCompetitionDescriptionsGeneralAI.js`, passing the current sport as an argument. This ensures that each sport is processed in isolation.
4.  **Logging**: It provides real-time output from the child script to the console. It logs the start and end of processing for each sport and provides a final summary of which sports were processed successfully or unsuccessfully.

**Key Dependencies**: `child_process`, `path`, `../inserts/insertCompetitionDescriptionsGeneralAI.js`, `../db.js`

---

## `insertCompetitionDescriptionsGeneralAI.js`

*Note: This script is located in `src/inserts` and is typically executed by `runAllCompetitionDescriptionsAI.js`.*

### Purpose

This script generates descriptive text for tournaments using a configurable AI provider (Google Gemini or OpenAI) and saves it to the database. It is designed to be run for a specific sport.

### Detailed Workflow

1.  **Configuration**: The script determines the target sport (e.g., 'cs2', 'lol') and AI provider ('gemini' or 'openai') from command-line arguments or environment variables. It selects the appropriate database configuration based on the sport.
2.  **Database Connection**: It connects to the specified sport's database.
3.  **Identify Missing Descriptions**: It queries the `competitions` table to find records where the `description` is `NULL` or set to a placeholder like `'Waiting for information'`.
4.  **Process in Batches**: The script processes a limited number of records in each run (`TOTAL_RECORDS_LIMIT`) and fetches them in batches (`BATCH_SIZE`) to avoid overwhelming the database or API.
5.  **Generate Prompt**: For each competition, it constructs a detailed prompt for the AI, asking for a concise and informative description based on the tournament's name and sport.
6.  **Call AI API**: It sends a request to the configured AI provider's API (Gemini or OpenAI). It includes error handling and retry logic, especially for rate-limiting (429) errors.
7.  **Update Database**: If a valid description is returned from the AI, the script updates the corresponding row in the `competitions` table.
8.  **Optional File Saving**: If enabled via an environment variable (`SAVE_TOURNAMENTS_TO_FILE`), it saves the generated descriptions to a local JSON file for review.
9.  **Logging**: It logs the progress for each tournament, including which AI is being used, and reports success or failure for each operation.

**Key Dependencies**: `axios`, `mysql2/promise`, `dotenv`