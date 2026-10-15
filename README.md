# Schattenkanzler – Partyspiel für Fernseher & Handys

Der **Fernseher** zeigt das Spielbrett, jedes **Handy** ist ein geheimer Controller.
5 bis 10 Spieler, komplett auf Deutsch, mit Animationen, Soundeffekten und Musik (alles im Browser erzeugt – keine Audiodateien nötig).

## Starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 16.

```bash
npm install
npm start
```

Im Terminal erscheinen zwei Adressen, z. B.:

```
📺 Fernseher / Spielbrett:  http://192.168.1.23:3000/
📱 Handys / Controller:     http://192.168.1.23:3000/play
```

1. Öffne die **Fernseher-Adresse** im Browser des Smart-TVs – oder auf einem Laptop, der per HDMI am Fernseher hängt. Einmal klicken/Taste drücken aktiviert den Sound.
2. Alle scannen den **QR-Code** auf dem Fernseher (oder tippen die Adresse ein) und geben ihren Namen ein.
3. Der erste Spieler ist Spielleiter und startet das Spiel am Handy (oder man klickt am Fernseher auf „Spiel starten“).

Alle Geräte müssen im **selben WLAN** sein. Falls die Handys nicht verbinden: Windows-Firewall-Abfrage für Node.js erlauben (privates Netzwerk).
Anderer Port: `PORT=8080 npm start` (Windows PowerShell: `$env:PORT=8080; npm start`).

## Spielablauf

- **Rollen:** Jeder hält die Rollenkarte am Handy gedrückt (loslassen = verstecken). Faschisten kennen sich gegenseitig und Hitler; Hitler kennt seine Faschisten nur bei 5–6 Spielern.
- **Wahl:** Der Präsident nominiert einen Kanzler, alle stimmen gleichzeitig mit JA!/NEIN ab. Die Stimmen werden am Fernseher aufgedeckt.
- **Gesetzgebung:** Präsident zieht 3 Gesetze und legt eines ab, der Kanzler erlässt eines der beiden übrigen.
- **Wahltracker:** Drei gescheiterte Regierungen hintereinander ⇒ Chaos, das oberste Gesetz tritt in Kraft.
- **Präsidiale Vollmachten** (je nach Spielerzahl): Gesetzesvorschau, Loyalität prüfen, Sonderwahl, Hinrichtung. Ab 5 faschistischen Gesetzen gibt es das Veto-Recht.
- **Sieg der Liberalen:** 5 liberale Gesetze oder Hitler hingerichtet.
- **Sieg der Faschisten:** 6 faschistische Gesetze oder Hitler wird nach 3 faschistischen Gesetzen zum Kanzler gewählt.

Verliert ein Handy die Verbindung (Standby, Akku), einfach die Seite wieder öffnen – man landet automatisch wieder auf seinem Platz.

## Steuerung am Fernseher

Oben rechts: Soundeffekte an/aus, Musik an/aus, Vollbild. In der Lobby kann man Spieler per ✕ entfernen. In der Rollenphase gibt es „Weiter ▸“, falls jemand vergisst zu bestätigen.

## Test

`npm test` lässt Bots hunderte Spielzüge für 5–10 Spieler durchspielen und prüft die Regeln.

## Lizenz

Das Spielprinzip basiert auf dem Spiel „Secret Hitler“ von Mike Boxleiter, Tommy Maranges und Max Temkin (secrethitler.com),
lizenziert unter **CC BY-NC-SA 4.0**. Diese digitale Umsetzung ist ein nicht-kommerzielles Fanprojekt unter derselben Lizenz;
alle Grafiken sind eigene Entwürfe.
