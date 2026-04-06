# 🍺 Barcraft

Echtzeit-Bestellsystem für die LAN-Party-Bar. Gäste bestellen vom PC oder Handy, der Barkeeper sieht die Bestellungen live auf dem Tablet.

---

## Features

- **Gast-Modus** – Getränk auswählen oder neu hinzufügen, Bestellung absenden, Statusupdates in Echtzeit
- **Bar-Modus** – Bestellqueue mit Accept/Reject, Zubereitungs-Timer, auffälliges Overlay bei neuen Bestellungen
- **Leaderboard** – Live-Statistiken: meistbestellte Drinks, treueste Gäste, Aktivitätsfeed
- **Push-Benachrichtigungen** – Web Push per Service Worker (automatisch konfiguriert)
- **Dark Mode** – standardmäßig, weil LAN-Party
- **Passwortschutz** – gemeinsames Passwort für alle Seiten
- **Datenpersistenz** – JSON-Dateien in `/data/`, kein Datenbankvorbereitung nötig

---

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla HTML/CSS/JS, kein Framework, kein Bundler
- **Datenbank**: JSON-Dateien mit Write-Queue gegen Korruption
- **Push**: Web Push API (`web-push`), Service Worker

---

## Setup

### Voraussetzungen

- Node.js 18+

### Installation

```bash
git clone https://github.com/total-verpLANt/barcraft.git
cd barcraft
npm install --omit=dev
```

### Konfiguration

**`config.json`** – Passwort und Bar-Name:
```json
{
  "password": "barcraft2026",
  "barName": "Barcraft"
}
```

**`.env`** (optional) – Port und CORS konfigurieren:
```bash
cp .env.example .env
```

| Variable | Beschreibung | Beispiel |
|---|---|---|
| `PORT` | Server-Port (Standard: 3000) | `3000` |
| `ALLOWED_ORIGINS` | Kommagetrennte Liste erlaubter Origins. Leer lassen in `development` (erlaubt alle). In Production ohne Eintrag werden alle Cross-Origin-Requests blockiert. | `http://192.168.1.42:3000` |

### Starten

```bash
node server/index.js
```

Mit Auto-Reload (Entwicklung):
```bash
npm run dev
```

Dauerhaft im Hintergrund mit PM2:
```bash
npm install -g pm2
pm2 start server/index.js --name barcraft
pm2 save && pm2 startup
```

---

## Nutzung

| URL | Beschreibung |
|-----|--------------|
| `/` | Startseite – Modus wählen |
| `/guest.html` | Gast-Modus – Bestellung aufgeben |
| `/bar.html` | Bar-Modus – Bestellungen verwalten |
| `/leaderboard.html` | Statistiken & Leaderboard |

Alle Seiten sind mit demselben Passwort aus `config.json` geschützt.

### Gast-Workflow

1. Namen eingeben oder aus der Liste wählen
2. Getränk aus dem Menü wählen, neu hinzufügen oder per Freitext bestellen
3. Menge wählen, absenden
4. Statusupdates kommen in Echtzeit: **Accepted → Ready 🎉**

### Bar-Workflow

1. `/bar.html` öffnen (am besten auf einem Tablet im Querformat)
2. Bei neuer Bestellung erscheint ein großes Overlay (10 Sekunden, oder antippen zum Schließen)
3. Bestellung **annehmen** oder **ablehnen** (mit optionalem Kommentar)
4. Angenommene Bestellungen in den "In Prep"-Bereich, Timer läuft mit
5. **Ready ✓** drücken wenn fertig → Gast wird benachrichtigt

### Bar-Controls

| Aktion | Beschreibung |
|--------|--------------|
| ✅ Öffnen | Bar ist offen, Bestellungen möglich |
| ⏸ Pausieren | Keine neuen Bestellungen, Queue bleibt sichtbar |
| 🔒 Schließen | Bar geschlossen, Gäste sehen eine Meldung |
| Schließzeit | Bar schließt automatisch zur eingestellten Uhrzeit |

### Getränke verwalten

- **Hinzufügen**: Im Gast-Modus unter Tab "Add Drink" → wird ins Menü aufgenommen
- **Löschen**: In der Bar unter "🍹 Getränkeliste" → ✕-Button

---

## Dateistruktur

```
barcraft/
├── config.json          # Passwort, Bar-Name
├── .env                 # Port-Konfiguration (optional, nicht eingecheckt)
├── server/
│   ├── index.js         # Express + Socket.io
│   ├── routes/api.js    # REST-Endpunkte
│   ├── routes/push.js   # Push-Subscription
│   ├── socket/handlers.js
│   ├── db/              # JSON-Datenbank (fileDb, orders, drinks, users, stats)
│   └── utils/           # Konstanten, ID-Generator, Push-Notifications
├── public/
│   ├── index.html / guest.html / bar.html / leaderboard.html
│   ├── css/             # base.css, components.css, animations.css
│   ├── js/              # utils.js, auth.js, socket-client.js, push-client.js
│   │   └── pages/       # index.js, guest.js, bar.js, leaderboard.js
│   └── sw.js            # Service Worker für Push
└── data/                # Auto-erstellt, nicht eingecheckt
    ├── orders.json
    ├── drinks.json
    ├── users.json
    ├── bar-state.json
    ├── push-subscriptions.json
    └── vapid-keys.json  # Automatisch generierte VAPID-Keys für Web Push
```

---

## Push-Benachrichtigungen

VAPID-Keys werden beim ersten Start automatisch generiert und in `data/vapid-keys.json` gespeichert. Push funktioniert ohne manuelle Konfiguration.

Gäste können im Browser Push-Benachrichtigungen aktivieren und werden informiert wenn ihre Bestellung angenommen oder fertig ist.

> **iOS**: Push über Web App erfordert "Zum Home-Bildschirm hinzufügen" (PWA-Install).

---

## Lizenz

MIT
