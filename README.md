# Job Application Outreach Agent

Monitors Gmail for application confirmations, finds 5 relevant contacts at the target company, drafts personalized outreach emails, and sends them after your approval.

## Project Structure

```
outreach-agent/
├── CLAUDE.md              # Claude Code instructions
├── .env.example           # Required environment variables
├── package.json
├── src/
│   ├── index.ts           # Entry point (CLI)
│   ├── monitor.ts         # Gmail polling + application detection
│   ├── researcher.ts      # Contact discovery + scoring
│   ├── drafter.ts         # Email generation per contact archetype
│   ├── approver.ts        # Terminal approval UI
│   ├── sender.ts          # Gmail send + label tracking
│   ├── tracker.ts         # Reply tracking + learning loop
│   └── types.ts           # Shared types
├── prompts/
│   ├── extract-job.txt    # Prompt: parse application email
│   ├── research-contacts.txt  # Prompt: shortlist + score contacts
│   ├── draft-recruiter.txt
│   ├── draft-peer-pm.txt
│   ├── draft-hiring-manager.txt
│   ├── draft-executive.txt
│   └── draft-generic.txt
├── data/
│   ├── profile.json       # Your background, moat, achievements
│   └── outreach-log.json  # History of sent emails + responses
└── mcp/
    └── .mcp.json          # Claude Code MCP config
```

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in keys
3. Set up Gmail MCP (see below)
4. Run: `npm start`

## Gmail MCP Setup

```bash
# Authenticate Gmail MCP
npx @gongrzhe/server-gmail-autoauth-mcp auth

# Add to Claude Code
claude mcp add gmail -- npx @gongrzhe/server-gmail-autoauth-mcp
```

## Running Modes

```bash
npm start          # Watch mode: polls Gmail every 2 min
npm run once       # Single run: check inbox now
npm run approve    # Review pending drafts from last run
npm run track      # Check for replies on sent outreach
```
