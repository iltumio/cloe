# Chrome Web Store Listing

## Name
CLOE — Custom Links Opened Externally

## Summary (132 char max)
Open specific PWA links in your default browser. Configure URL patterns or intercept all links with one click.

## Description
CLOE lets you control which links inside Progressive Web Apps (PWAs) open in your system's default browser instead of navigating inside the app.

**How it works:**
When you click a link inside a PWA running in standalone mode, CLOE checks the URL against your configured patterns. If it matches, the link opens in your default browser (e.g. Firefox, Zen, Arc) via a native messaging host. If it doesn't match, the link behaves normally.

**Features:**
• Regex-based URL patterns — full control over which links are intercepted
• Preset patterns — one-click setup for Google Meet, Zoom, Microsoft Teams, Slack, Discord, GitHub, Google Calendar, and YouTube
• Intercept-all toggle — open every external link in the default browser
• Instant apply — changes take effect immediately, no restart needed
• Zero tracking — no analytics, no data collection, fully local

**Example use cases:**
• Always open Google Meet links in your main browser instead of the PWA
• Route GitHub links from your Slack PWA to your default browser
• Keep Zoom meeting links opening externally while everything else stays in-app

**Requirements:**
CLOE needs a small native messaging host binary installed on your system. See the GitHub repo for a one-line install command.

**Open source:** https://github.com/iltumio/cloe

## Category
Productivity

## Language
English
