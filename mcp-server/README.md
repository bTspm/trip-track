# TripDNA MCP Server

This is an MCP (Model Context Protocol) server that lets Claude Desktop read and write your TripDNA data. When connected, you can chat naturally with Claude and it will directly interact with your trips.

## What is MCP?

MCP is a protocol that lets Claude Desktop call functions on your machine. You define "tools" (functions), and Claude decides when to use them based on your conversation.

**Without MCP:**
```
You: "Plan a trip based on my preferences"
Claude: "Please paste your travel profile JSON..."
You: *copies 200 lines of JSON, pastes*
Claude: *plans trip*
Claude: "Here's the trip JSON, copy it into your app"
You: *copies, opens app, imports*
```

**With MCP:**
```
You: "Plan a trip based on my preferences"
Claude: *calls get_travel_profile tool* → reads your profile automatically
Claude: *plans trip*
Claude: *calls create_trip tool* → trip appears in your app instantly
```

## How It Works

```
┌─────────────────┐     stdio      ┌──────────────┐     HTTPS     ┌──────────┐
│ Claude Desktop  │ ◄─────────────► │  MCP Server  │ ◄────────────► │ Supabase │
│ (you chat here) │                 │  (Node.js)   │               │ (your DB) │
└─────────────────┘                 └──────────────┘               └──────────┘
```

1. Claude Desktop launches the MCP server as a subprocess
2. They communicate via stdin/stdout (JSON messages)
3. The MCP server has tools that query Supabase
4. Claude calls tools when relevant to your conversation

## Setup

### 1. Install dependencies

```bash
cd mcp-server
npm install
```

### 2. Configure environment

Create a `.env` file:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...your-service-key
TRIPDNA_USER_ID=your-uuid-from-auth
```

### 3. Connect to Claude Desktop

Add to `~/.claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "tripdna": {
      "command": "node",
      "args": ["/Users/bt/Desktop/GIT/trip-track/mcp-server/index.js"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_KEY": "eyJhbGc...your-service-key",
        "TRIPDNA_USER_ID": "your-uuid"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

Claude will now show a 🔌 icon indicating MCP tools are available.

## Available Tools

| Tool | What it does | Example prompt |
|------|-------------|----------------|
| `get_travel_profile` | Reads your Travel DNA | "What are my travel preferences?" |
| `update_travel_profile` | Updates preferences | "Add 'prefers window seats' to my profile" |
| `list_trips` | Shows all your trips | "What trips have I taken?" |
| `get_trip` | Reads a specific trip | "Show me my West Texas trip" |
| `create_trip` | Creates a new trip | "Plan a 3-day trip to Fredericksburg" |
| `update_trip` | Modifies a trip | "Move the dinner reservation to 7 PM" |
| `get_trip_stats` | Aggregated stats | "How many miles have I driven total?" |
| `search_activities` | Search across trips | "Find all hikes I've rated 5 stars" |

## Example Conversations

### Planning a new trip
```
You: Plan a long weekend trip to Fredericksburg. We like wineries,
     good food, and one moderate hike.

Claude: [calls get_travel_profile]
        I see you prefer warm weather, hotel over camping, max 2 hikes/day
        with rest between, and no alcohol. Since you don't drink, I'll
        skip the wineries and focus on the food scene and hiking instead.

        [calls create_trip with generated JSON]
        Done! The trip is in your app now. 3 days:
        - Day 1: Drive from Kyle (1.5 hrs), Enchanted Rock hike, dinner at Otto's
        - Day 2: LBJ Ranch, Wildseed Farms, dinner at Cabernet Grill
        - Day 3: Old Tunnel Bat Cave at sunset, drive home

        I scheduled the hike for 6:30 AM based on your pattern of
        starting hikes early. Dinner is at 6 PM since that's your
        usual dinner time.
```

### Post-trip review
```
You: Analyze my West Texas trip and update my profile with what you learn.

Claude: [calls get_trip("west-texas-2026")]
        Looking at your trip data...

        Patterns I found:
        - You ran 22 min late on average for morning activities
        - Hikes took 35% longer than planned
        - You skipped all "rest" activities (0/4 completed)
        - You rated experiences (stargazing, hot springs) highest (avg 4.8★)
        - Food averaged $55/day

        Recommendations for your profile:
        1. Add 30 min buffer to morning schedules
        2. Plan hikes at 1.35x duration
        3. Stop scheduling dedicated "rest" blocks — you rest organically
        4. Prioritize "experience" activities — they're your favorites

        [calls update_travel_profile]
        Profile updated!
```

## Local-Only Mode (No Supabase)

If you don't have Supabase set up yet, the MCP server can read/write trip JSON files directly from your filesystem:

```json
{
  "mcpServers": {
    "tripdna": {
      "command": "node",
      "args": ["/Users/bt/Desktop/GIT/trip-track/mcp-server/index.js"],
      "env": {
        "TRIPDNA_MODE": "local",
        "TRIPDNA_DATA_DIR": "/Users/bt/Desktop/GIT/trip-track"
      }
    }
  }
}
```

This reads `.json` files from your project directory — no database needed. Good for getting started before setting up Supabase.
