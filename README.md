# 🏆 MatchExec — Your Personal Video Game Tournament Manager
<p align="center">
  <img src="https://raw.githubusercontent.com/slamanna212/MatchExec/refs/heads/dev/public/logo.svg" height="200" alt="MatchExec Logo" />
</p>

---

## ❔ What is MatchExec
MatchExec handles all aspects of managing video game matches. Do you want to host tournaments, organize game nights, or prove you're better than the other team? MatchExec is for you! 

Inspired by a Discord server I am a part of, I wanted to improve the process of private video game matches. They take a lot of time to setup, coordinate, and orchestrate. MatchExec handles all of that so you can focus on playing, and winning.

Create a Match, and MatchExec handles the rest!

---

## ✨ Features
✅ **Full Discord Integration** — Creates native Discord events, Rich detailed Embeds, Sign-up forms inside of Discord, announcements, reminders, and more \
✅ **Modern, Responsive Web UI** — No matter the device or size, a beautiful, fast web interface awaits you \
✅ **No Timezone Issues** — MatchExec shows you all times in your local timezone, and stores them in UTC. No need to worry about missing matches due to conversion errors \
✅ **Keep Score** — Keep score of who wins each map and declare an overall winner \
✅ **Flexible** — Support for different scoring types, custom modes, custom maps, whatever you want, it's playable \
✅ **Voice Announcers** — 4 different personas to choose from: A evil queen, a British football announcer, a London radio DJ, and an American Wrestling Announcer 

---

## 📷 Screenshots

![Matches Screen](https://github.com/slamanna212/MatchExec/blob/main/.github/assets/WebScreenshots/Matches.png?raw=true "Matches Screen")
![Games Screen](https://github.com/slamanna212/MatchExec/blob/main/.github/assets/WebScreenshots/Games.png?raw=true "Games Screen")
![Channels Screen](https://github.com/slamanna212/MatchExec/blob/main/.github/assets/WebScreenshots/Channels.png?raw=true "Channels Screen")
![Settings Screen](https://github.com/slamanna212/MatchExec/blob/main/.github/assets/WebScreenshots/Settings.png?raw=true "Settings Screen")
![Discord Match Embed](https://github.com/slamanna212/MatchExec/blob/main/.github/assets/DiscordScreenshots/FlJmJP.png?raw=true "Discord Match Embed")
![Discord Sign Up Form](https://github.com/slamanna212/MatchExec/blob/main/.github/assets/DiscordScreenshots/O4CAe4.png?raw=true "Discord Sign Up Form")

---

## 🛸 Get Started

Documentation is [available here](https://docs.matchexec.com/docs/getting-started/getting-started/) Reading it is recommended, but TLDR:

```
docker run -d \
  --name MatchExec \
  -p 3000:3000 \
  -e TZ=UTC \
  -v $(pwd)/app_data:/app/app_data \
  -v $(pwd)/uploads:/app/public/uploads \
  ghcr.io/slamanna212/matchexec:latest
```
---

## ✉️ Connect

Need Help? Want to add more games?

[Open an issue](https://github.com/slamanna212/MatchExec/issues/new/choose)

[Join our Discord](https://discord.gg/nPKp95Cc6k)

---

### 🎮 Good Luck, Have Fun!