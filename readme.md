# Sjöstadsfärjetrafiken

![Sjöstadsfärjetrafiken Screenshot](images/screenshot.png)
![Sjöstadsfärjetrafiken med meny för personliga inställningar](images/screenshot2.png)

En modern webbapplikation för att visa realtidstidtabeller för båtlinjerna i Hammarby Sjöstad: **Sjöstadstrafiken** och **M/S Emelie**.

**Live-demo:**  
https://minaprojekt.github.io/ressel-timetable/

---

## Funktioner

- **Realtidsvisning** – Avgångar uppdateras automatiskt varje minut
- **Smart tidmarkering**
  - 🟢 Grön ram = Nästa avgång (mer än 10 minuter)
  - 🟡 Gul ram = Snar avgång (mindre än 10 minuter)
  - *Kursiv text* = Morgondagens första avgångar
- **Flexibel visning** – Anpassa antal avgångar och vilka linjer som visas
- **Brygganpassning** – Markera din brygga för snabb översikt
- **Mörkt tema** – Perfekt för digital skyltning
- **Offline-stöd** – Fungerar även utan internetuppkoppling
- **Mobilvänlig / PWA** – Installeras som app
- **Helgdagshantering** – Växlar automatiskt till helgtidtabell

---

## Kom igång

### Enkel start
1. Gå till https://minaprojekt.github.io/ressel-timetable/
2. Klart! 🎉

### Lokal användning
1. Klona eller ladda ner repot
2. Öppna `index.html` i webbläsaren

Alternativt:
```bash
python3 -m http.server 8000
```

---

## Anpassa applikationen

### Via inställningsmenyn
Klicka på **”Inställningar”** längst ner i appen:

1. Tidtabeller – välj vilka linjer som ska visas
2. Visning – ändra antal avgångar (3–15 st)
3. Bryggor – markera din hemmabrygga
4. Riktningar – visa/dölj returresor för M/S Emelie

Dina val sparas automatiskt i webbläsaren.

### Via URL-parametrar
Perfekt för digital skyltning med fasta inställningar.

Exempel:
```
?sjo=1&emelie=1&highlight=Lumabryggan&maxdep=8
```

Parametrar:
```
sjo=1/0
emelie=1/0
bothdir=1/0
highlight=Brygga
cityhighlight=Brygga
returnstop=Brygga
maxdep=3-15
```

---

## Datastruktur

```
data/
├── ressel-sjo-config.json
├── ressel-city-config.json
├── ressel-sjo-weekday-standard.json
├── ressel-sjo-weekday-summer.json
├── ressel-sjo-weekend.json
├── ressel-city-weekday-winter.json
├── ressel-city-weekend-winter.json
└── ressel-city-maintenance-*.json
```

---


## Bidra

Pull requests och issues är välkomna:  
https://github.com/minaprojekt/ressel-timetable/issues

---

## Licens

MIT License – fri användning, modifiering och distribution är tillåten.  
**Cred till upphovspersonen krävs.**

Se `LICENSE` för fullständig text.

---

## Upphovsperson & kontakt

**Christian Gillinger**  
📧 christian.gillinger@proton.me
