# Sjöstadsfärjetrafiken

![Sjöstadsfärjetrafiken Screenshot](images/screenshot.png)

![Sjöstadsfärjetrafiken med meny för personliga inställningar](images/screenshot2.png)

En modern webbapplikation för att visa realtidstidtabeller för båtlinjerna i Hammarby Sjöstad: Sjöstadstrafiken och M/S Emelie.

**Demo:** https://cgillinger.github.io/ressel-static/

## Funktioner

- **Realtidsvisning** - Avgångar uppdateras automatiskt varje minut
- **Smart tidmarkering:**
  - 🟢 Grön ram = Nästa avgång (mer än 10 minuter)
  - 🟡 Gul ram = Snar avgång (mindre än 10 minuter)
  - *Kursiv text* = Morgondagens första avgångar
- **Flexibel visning** - Anpassa antal avgångar och vilka linjer som visas
- **Brygganpassning** - Markera din brygga för snabb översikt
- **Mörkt tema** - Perfekt för digital skyltning
- **Offline-stöd** - Fungerar även utan internetuppkoppling
- **Mobilvänlig** - Installeras som app på telefon/surfplatta
- **Helgdagshantering** - Byter automatiskt till helgtidtabell

## Kom igång

### Enkel start
1. Gå till https://cgillinger.github.io/ressel-static/
2. Klart! 🎉

### Lokal installation
1. Ladda ner/klona detta repo
2. Öppna `index.html` i webbläsaren
3. Klart!

### Egen server/hosting
Applikationen är helt statisk och fungerar på vilken webbserver som helst:

**Apache:**
```bash
# Kopiera filerna till webbroot
sudo cp -r ressel-static /var/www/html/farjetrafiken

# Se till att filerna är läsbara
sudo chmod -R 755 /var/www/html/farjetrafiken

# Besök: http://din-server/farjetrafiken
```

**Nginx:**
```nginx
server {
    listen 80;
    server_name farjetrafiken.example.com;
    root /var/www/farjetrafiken;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    # Cache-headers för tidtabellsfiler
    location ~* \.json$ {
        add_header Cache-Control "no-cache, must-revalidate";
    }
}
```

**Python (enkel testserver):**
```bash
cd ressel-static
python3 -m http.server 8000

# Besök: http://localhost:8000
```

**Node.js (http-server):**
```bash
npm install -g http-server
cd ressel-static
http-server -p 8000

# Besök: http://localhost:8000
```

**Docker:**
```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```
```bash
docker build -t farjetrafiken .
docker run -p 8080:80 farjetrafiken
```

💡 **Viktigt:** Service worker kräver HTTPS i produktion (lokalt funkar HTTP)

### För digital skyltning
**Raspberry Pi:**
```bash
chromium-browser --kiosk --noerrdialogs --disable-infobars index.html
```

**Windows (Chrome):**
```
chrome.exe --kiosk --app=file:///C:/path/to/index.html
```

**Android/iOS:**
1. Öppna sidan i webbläsaren
2. Tryck "Lägg till på hemskärmen"
3. Appen installeras som native app

**iPhone (Safari):**
1. Öppna https://cgillinger.github.io/ressel-static/ i Safari
2. Tryck på delningsknappen (📤) längst ner
3. Scrolla ner och välj "Lägg till på hemskärmen"
4. Bekräfta genom att trycka "Lägg till"
5. Appen syns nu som en vanlig app på hemskärmen 🎉

## Anpassa applikationen

### Via inställningsmenyn
Klicka på **"Inställningar"** längst ner:

1. **Tidtabeller** - Välj vilka linjer som ska visas
2. **Visning** - Ändra antal avgångar (3-15 st)
3. **Bryggor** - Markera din hemmabrygga
4. **Riktningar** - Visa/dölj returresor för M/S Emelie

💡 *Dina val sparas automatiskt i webbläsaren*

### Via URL-parametrar
Perfekt för digital skyltning med fasta inställningar:

**Exempel:**
```
index.html?sjo=1&emelie=1&highlight=Lumabryggan&maxdep=8
```

**Alla parametrar:**
```
sjo=1/0              Visa/dölj Sjöstadstrafiken
emelie=1/0           Visa/dölj M/S Emelie
bothdir=1/0          Visa/dölj returresor
highlight=Brygga     Markera brygga (Sjöstadstrafiken)
cityhighlight=Brygga Markera brygga till city (M/S Emelie)
returnstop=Brygga    Markera brygga från city (M/S Emelie)
maxdep=3-15          Antal avgångar att visa
```

**Användningsexempel:**

```
Endast Sjöstadstrafiken:
?sjo=1&emelie=0

Endast M/S Emelie utan returresor:
?sjo=0&emelie=1&bothdir=0

Barnängsbryggan fokus med många avgångar:
?highlight=Barnängsbryggan&maxdep=12

Mobilanpassad:
?maxdep=5
```

## Hur det fungerar

### Datastruktur
Applikationen använder en smart filstruktur där tidtabeller återanvänds mellan säsonger:

```
data/
├── ressel-sjo-config.json              ← Konfiguration Sjöstadstrafiken
├── ressel-city-config.json             ← Konfiguration M/S Emelie
├── ressel-sjo-weekday-standard.json    ← Vardagar (höst/vinter/vår)
├── ressel-sjo-weekday-summer.json      ← Sommarvardagar
├── ressel-sjo-weekend.json             ← Helger (alla säsonger)
├── ressel-city-weekday-winter.json     ← Vardagar (vinter/vår/höst)
├── ressel-city-weekend-winter.json     ← Helger (vinter/vår/höst)
└── ressel-city-maintenance-*.json      ← Tillfälliga trafikuppehåll (vid behov)
```

**Varför smart:**
- Samma tidtabell för vinter/vår/höst → färre filer att uppdatera
- Ändra en fil → påverkar automatiskt alla säsonger som använder den
- Mindre risk för fel och inkonsekvenser
- Maintenance-filer används bara vid tillfälliga stopp (broarbeten osv.)

### Konfigurationsfiler
`ressel-sjo-config.json` och `ressel-city-config.json` innehåller:
- Säsongsmappning (datum → tidtabellsfil)
- Helgdagsregler
- Specialdagar
- Metadata (priser, anteckningar)

**Exempel från config:**
```json
{
  "name": "Winter 2025-2026",
  "period": {
    "start": "2025-12-15",
    "end": "2026-04-19"
  },
  "files": {
    "weekday": "ressel-city-weekday-winter.json",
    "saturday": "ressel-city-weekend-winter.json",
    "sunday": "ressel-city-weekend-winter.json"
  },
  "holiday_rules": {
    "no_traffic": ["2025-12-24", "2025-12-25"],
    "weekend_schedule": ["2026-01-06"]
  }
}
```

### Tidtabellsfiler
Enkelt JSON-format:
```json
{
  "metadata": {
    "valid_period": {
      "start": "2025-12-15",
      "end": "2026-04-19"
    },
    "day_type": "weekday"
  },
  "operating_hours": {
    "start": "06:00",
    "end": "00:00"
  },
  "departures": {
    "Barnängsbryggan": ["06:00", "06:20", "06:40", ...],
    "Lumabryggan": ["06:05", "06:25", "06:45", ...],
    "Henriksdalsbryggan": ["06:10", "06:30", "06:50", ...]
  }
}
```

## Uppdatera tidtabeller

### Lägg till ny säsong
De flesta säsonger kan återanvända befintliga filer:

**1. Kontrollera om tidtabellen är identisk med tidigare säsong**

**2. Uppdatera bara config-filen:**
```json
{
  "name": "Summer 2026",
  "period": {
    "start": "2026-06-20",
    "end": "2026-08-17"
  },
  "files": {
    "weekday": "ressel-sjo-weekday-summer.json",    ← Återanvänd
    "weekend": "ressel-sjo-weekend.json"            ← Återanvänd
  }
}
```

**3. Klart!** 🎉

### Skapa ny tidtabellsfil
Endast nödvändigt om avgångstider är **annorlunda** än alla befintliga filer:

**1. Kopiera en liknande fil**
```bash
cp ressel-sjo-weekday-standard.json ressel-sjo-weekday-newtype.json
```

**2. Uppdatera avgångstider och metadata**

**3. Lägg till i config:**
```json
"files": {
  "weekday": "ressel-sjo-weekday-newtype.json"
}
```

### Trafikuppehåll (Maintenance Mode)
För tillfälliga stopp (broarbeten, service):

**1. Skapa maintenance-filer:**
```json
{
  "metadata": {
    "valid_period": {
      "start": "2026-03-01",
      "end": "2026-03-15"
    },
    "day_type": "weekday",
    "maintenance_mode": true,
    "maintenance_message": "Trafiken är tillfälligt inställd. Välkomna åter 16 mars!"
  },
  "to_city": { "departures": {} },
  "from_city": { "departures": {} }
}
```

**2. Uppdatera config:**
```json
{
  "name": "Maintenance March 2026",
  "period": {
    "start": "2026-03-01",
    "end": "2026-03-15"
  },
  "files": {
    "weekday": "ressel-city-maintenance-2026-weekday.json",
    "saturday": "ressel-city-maintenance-2026-saturday.json",
    "sunday": "ressel-city-maintenance-2026-sunday.json"
  },
  "maintenance_mode": true
}
```

**Resultat:** Istället för tidtabell visas meddelandet! ✅

## Projektstruktur

```
sjostadsfärjetrafiken/
├── index.html                 Huvudsida
├── manifest.json              PWA-konfiguration
├── service-worker.js          Offline-stöd
├── css/
│   └── styles.css             Alla stilar
├── js/
│   ├── app.js                 Huvudlogik
│   ├── timehandler.js         Tidsberäkningar
│   └── renderer.js            UI-rendering
├── data/
│   ├── *.json                 Tidtabeller och konfiguration
└── icons/
    └── boat.png               App-ikon
```

## Teknisk dokumentation

### Versionshantering
Filer som måste uppdateras vid ny version:

1. **manifest.json** - `"version": "X.Y.Z"`
2. **index.html** - `<meta name="version" content="X.Y.Z">`
3. **service-worker.js** - `const APP_VERSION = 'X.Y.Z'`
4. **js/app.js** - `version: 'X.Y.Z'`

### Service Worker Cache
Vid uppdatering:
1. Öka versionsnummer
2. Service worker skapar nytt cache
3. Gamla cacher rensas automatiskt
4. Användare ser uppdateringsnotis

### PWA-funktioner
- Offline-stöd via service worker
- Installeras som app på mobil/desktop
- Automatiska uppdateringar
- Fast installerad ikon

## Felsökning

**Uppdateringar visas inte:**
```
1. Öppna DevTools (F12)
2. Application → Clear storage → Clear site data
3. Håll Ctrl+Shift+R (hard reload)
```

**Fel tidtabell visas:**
```
Kontrollera datum i config-filerna:
- period.start och period.end
- Överlappande perioder?
```

**Appen fungerar inte offline:**
```
Kontrollera service worker:
DevTools → Application → Service Workers
Status ska vara "activated and running"
```

## Utveckling

### Lokalt
```bash
# Klona repo
git clone https://github.com/cgillinger/ressel-static.git
cd ressel-static

# Starta lokal server (valfritt)
python3 -m http.server 8000

# Öppna http://localhost:8000
```

### Deployment
```bash
# Uppdatera versionsnummer i alla filer
# Committa ändringar
git add .
git commit -m "Version X.Y.Z: Beskrivning"
git push

# GitHub Pages uppdateras automatiskt
```

## Bidra

Pull requests välkomna! För större ändringar, öppna först en issue.

### Rapportera buggar
Använd GitHub Issues: https://github.com/cgillinger/ressel-static/issues

Inkludera:
- Webbläsare och version
- Steg för att återskapa
- Förväntad vs faktisk funktion
- Skärmdump om relevant

## Licens

MIT License - Se LICENSE-fil för detaljer

## Utvecklare

**Christian Gillinger**  
GitHub: [@cgillinger](https://github.com/cgillinger)

---

**Version:** 5.0.0  
**Senast uppdaterad:** December 2025
