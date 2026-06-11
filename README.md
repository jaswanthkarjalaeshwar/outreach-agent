# Outreach Agent

An agentic job search automation tool that monitors Gmail for application confirmations, researches relevant contacts at target companies, drafts personalized outreach emails per contact archetype, and sends them after user approval — all controlled through a conversational CLI interface.

---

## Why I Built This

Job applications disappear into ATS black holes. The people who get callbacks are the ones who also show up in someone's inbox. I built this because I wanted a system that removes the manual work from that follow-up loop entirely — scan, research, draft, approve, send — without me having to think about it after every application.

The goal was to send five highly targeted emails to the right people at the right company, each written differently depending on whether they're a recruiter, a peer PM, a hiring manager, or an executive. That nuance is what separates outreach that gets replies from outreach that gets ignored.

---

## How It Works

```
Gmail Inbox
    ↓
Detect application confirmation emails (paginated search across full inbox)
    ↓
Extract company + role from email headers using Claude
    ↓
Web search for 5 relevant contacts at the company (scored by role relevance, seniority, activity signal)
    ↓
Draft personalized emails per contact archetype using Claude
    ↓
User reviews and approves each email via conversational CLI
    ↓
Send approved emails via Gmail API + label for reply tracking
```

---

## Architecture

### MCP Integration (Model Context Protocol)

The agent is built around **MCP (Model Context Protocol)** — Anthropic's open standard for connecting AI models to external tools and data sources. Specifically:

- **Gmail MCP server** (`@gongrzhe/server-gmail-autoauth-mcp`) handles authenticated Gmail access — reading inbox, sending emails, and applying labels for tracking
- **Web Search tool** (Anthropic's native `web_search_20250305`) runs inside the Claude API call that researches contacts — giving the model live access to LinkedIn, company pages, and email pattern databases like Hunter.io
- The Claude SDK orchestrates all tool calls, with each pipeline stage (monitor → research → draft → send) running as a separate AI-powered function with its own system prompt and tool access

This MCP-first architecture means the agent can be extended to other data sources (Slack, CRM, ATS) simply by adding MCP server configs — no custom API integrations needed.

### Contact Scoring

Each contact is scored 0–100 across four dimensions:

| Signal | Weight |
|---|---|
| Role relevance to applied position | 40pts |
| Seniority match (not too senior, not too junior) | 20pts |
| Recent activity (LinkedIn post, blog, etc.) | 20pts |
| Estimated connection distance | 20pts |

### Email Archetypes

Each of the 5 emails is drafted with a different strategy:

| Archetype | Hook | Length |
|---|---|---|
| Recruiter | Just applied, put a face to the application | 80 words |
| Hiring Manager | Relevant proof point tied to their team's challenges | 100 words |
| Peer PM | Specific observation about their product work | 90 words |
| Eng Manager | Technical credibility, eng-PM dynamic | 90 words |
| Executive | Sharpest hook, one proof point, one ask | 70 words |

### Conversational Control

The agent runs as an interactive CLI chat powered by Claude. You don't run commands — you talk to it:

```
You: scan my emails
🤖  Found 14 applications. Here they are:
    1. Likewize — Associate Product Manager
    2. Ramp — Product Manager, Growth
    ...

You: run outreach for Ramp
🤖  On it — researching contacts at Ramp now...

You: skip the executive, approve the rest
🤖  Got it. Sending 4 emails...
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| AI Model | Claude Sonnet (Anthropic API) |
| Tool Protocol | MCP (Model Context Protocol) |
| Gmail Access | Gmail MCP Server + Google OAuth2 |
| Web Research | Anthropic Web Search tool |
| Auth | Google Cloud OAuth2 + token persistence |

---

## Setup

```bash
# Install dependencies
npm install

# Authenticate Gmail (opens browser)
npx @gongrzhe/server-gmail-autoauth-mcp auth

# Add Gmail MCP to Claude Code
claude mcp add gmail -- npx @gongrzhe/server-gmail-autoauth-mcp

# Add your Anthropic API key to .env
cp .env.example .env

# Run
npm start
```

---

## Project Structure

```
src/
├── chat.ts        # Conversational CLI interface
├── monitor.ts     # Gmail polling + application detection
├── researcher.ts  # Contact discovery + scoring (web search via MCP)
├── drafter.ts     # Per-archetype email generation
├── approver.ts    # Terminal approval UI
├── sender.ts      # Gmail send + label tracking
├── tracker.ts     # Reply monitoring + learning loop
└── types.ts       # Shared TypeScript types
data/
└── profile.json   # Your background and moat (used in email drafting)
```

---

## About

Built by **Jaswanth (Jay) Karjala Eshwar** — PM with a CS background and M.Eng Management from NC State.

I build things at the intersection of product and AI. This project came out of a real problem during my own job search — and turned into a practical demonstration of agentic AI, MCP integration, and multi-step tool orchestration.
---
