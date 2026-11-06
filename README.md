# Matt Gilman Simulator

A lightweight 3D arcade open-world sandbox for mobile Safari (and desktop), inspired by *The Simpsons: Hit & Run*, GTA and Saints Row.

It is 7:30 AM in Tallahassee. Matt has to sprint to his Black Camry in a Southwood apartment complex, tear through Cascades Park and downtown, park outside the EY Office at 210 E College Ave by 8:30 AM, then survive a full workday: Copilot approvals, a backup Scrum facilitator gig, mandatory ground beef and rice, and EY Christmas Connections. Clock out with a high score and earn an ice-cold **RPG** (Rum, Pineapple, and Ginger Ale).

**Play it:** https://colinstephens93.github.io/mattgilmansimulator/

Hosted on GitHub Pages (Settings > Pages > Deploy from branch > `main` / root). Every push to `main` republishes the game.

## Stack

Pure static client-side app. No build step, no backend.

- `index.html` - viewport setup, HUD layout, mini-game modals, script imports
- `style.css` - arcade UI, responsive touch controls, safe-area handling
- `game.js` - Three.js (r128 via CDN) world, Camry physics, walkable EY office, clock, mini-games, Web Audio synth
- `matt.png` - Matt's headshot (HUD reaction portrait, 3D nameplate billboard, title and victory screens). If it is missing or renamed, a canvas cartoon avatar is used instead.

## Controls

| | Touch | Desktop |
|---|---|---|
| Move / steer | Dynamic joystick (bottom-left) | WASD / arrows |
| Drive | GAS (green), BRAKE / DRIFT (red), EXIT CAR (blue) | W gas, Space brake/drift, E exit |
| On foot | SPRINT (yellow), INTERACT (green, label changes by ring) | Shift sprint, E interact |

While driving, the stick's horizontal axis steers; pulling down while nearly stopped reverses.

## Workday timeline

1 real second = 1 in-game minute, except the morning commute (7:30 - 8:30 AM) which runs at one-third speed (hunger drains slower too), so you get about 3 real minutes to reach the office.

| Time | Event |
|---|---|
| 7:30 AM | Start in Southwood |
| 8:30 AM | Hard deadline: park in the yellow zone, walk in, badge in at the turnstile |
| 8:30 - 1:30 PM | Approve 20 Copilot completions (approve the good diffs, reject the hallucinated ones) |
| 10:15 - 11:00 AM | Backup Scrum Facilitator standup (3 rounds, 4 seconds each) |
| 11:00 AM - 1:30 PM | Microwave and eat the mandatory ground beef and rice |
| 1:30 - 5:00 PM | EY Christmas Connections |

When nothing is available until the next event, a **Fast-Forward** button appears and pays out bonus points for each minute saved.

### Meters

- **Copilot Tokens:** +8% per approved diff, +35% for approving a hallucinated one, cools at 4% per second when you pause. At 100% the laptop locks for 12 seconds unless you grab the floating Token Coolant. Three rate-limit lockouts is a Game Over.
- **Hunger:** drains 0.4% per second (faster while sprinting) until lunch is eaten. Under 30% you slow down and your stomach growls. At 0% Matt passes out. Eating lunch grants the golden "Clean Bulk" speed buff.

### Scoring and ranks

Objectives, arrival time, cones launched, Capitol drifts, collectibles (Golden Tupperware, Token Coolers, Cold Brew, Golden EY Badges) and time remaining all count.

| Rank | Score | Result |
|---|---|---|
| S | 5,000+ | THE RPG unlocked, confetti and fanfare |
| A | 3,000 - 4,999 | Promoted, but no RPG |
| Clocked Out | under 3,000 | All five objectives done, no promotion |
| BUSTED | Any objective missed | Stamp with the exact reason and a one-tap retry |

## Running locally

Any static file server works (the page needs to be served over `http://` so the portrait loads cleanly into WebGL):

```
python3 -m http.server 8000
```

then open `http://localhost:8000`.

## Notes for iPhone Safari

The viewport is locked, `touch-action: none` / `user-select: none` suppress zoom and selection, the pixel ratio is capped at 2, and audio unlocks on the first tap on the title screen.
