# Spirit of the Wild — National Parks Voice Agent

A voice agent that lets you talk to the spirit of America's national parks. Plan a visit, discover wildlife, and build a personalized nature spotter bingo card — all through natural conversation.

Built with [AssemblyAI Voice Agent API](https://www.assemblyai.com/docs/voice-agent), the [National Park Service API](https://www.nps.gov/subjects/developer/get-started.htm), and [iNaturalist](https://www.inaturalist.org/pages/api+reference).

---

## Features

- **Four distinct personas** — choose Elder Ranger, Voice of the Forest, The Naturalist, or an Animal Spirit at the start of every session
- **Real park data** — entrance fees, hours, activities, and weather pulled live from the NPS API
- **Live wildlife sightings** — recent research-grade observations near each park from iNaturalist
- **Visual itinerary planner** — agent builds a narrative day plan and renders it as a timeline on screen
- **Nature bingo card** — personalized 3×3 spotter grid calibrated to your interests and actual iNat data; tap cells to mark as found
- **Full-duplex voice** — speak naturally, interrupt the agent mid-sentence, hear responses in real time

---

## Requirements

- Node.js 22+
- A free [AssemblyAI API key](https://www.assemblyai.com/dashboard/api-keys)
- A free [NPS API key](https://www.nps.gov/subjects/developer/get-started.htm)
- Chrome or Edge (required for AudioWorklet + hardware echo cancellation)

---

## Setup

```bash
git clone <your-repo-url>
cd spirit-of-the-wild

cp .env.example .env
# Fill in your keys in .env

npm start
# Open http://localhost:3000
```

---

## Project structure

```
.
├── server.js       # Token minting + NPS/iNaturalist API proxy
├── index.html      # Voice agent UI — all client logic inline
├── package.json
├── .env.example    # Template — copy to .env and fill in keys
└── .gitignore
```

The server keeps both API keys off the client. The browser fetches a single-use AssemblyAI session token from `/token` on each connect. NPS and iNaturalist calls are proxied through `/api/park` and `/api/sightings`.

---

## Usage

1. Click **Enter the Wild** and allow mic access
2. Choose your persona when prompted
3. Ask about any US national park — e.g. *"Tell me about Yellowstone"*
4. Ask for a bingo card — *"Can you make me a spotter list? I love birds and mammals."*
5. Ask to plan your visit — *"I have one day at the Grand Canyon, I'm into photography"*

Interrupt the agent at any time by speaking.
