#!/bin/bash
# PLDT Reddit Scraper — runs every 8 hours via launchd
# Fetches Reddit data from residential IP and pushes to Hetzner

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export FANDOM_TRACKER_URL="https://pldt-fandom.aiailabs.net"
export FANDOM_TRACKER_SECRET="NzQxYjYwZDU4ZjQ4NGY3ZGE5NGVjYjYwZDU4ZjQ4NGY="

LOGFILE="/tmp/pldt-reddit-scraper.log"
cd /Users/enricopena/Desktop/pldt-fandom-tracker

echo "=== $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOGFILE"
npx tsx scripts/reddit-scraper.ts >> "$LOGFILE" 2>&1
echo "" >> "$LOGFILE"
