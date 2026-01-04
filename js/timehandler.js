/**
 * Resseltrafiken Web Application - Time Handling Module
 * 
 * Hanterar tidsrelaterade beräkningar och schemabearbetning för Resseltrafiken
 * tidtabellsapplikation. Denna modul hanterar tidskonverteringar och sortering av avgångar.
 * 
 * Versionshistorik:
 * 4.0.0 - Förbättrad kompatibilitet med "Endast avstigning"-hantering, versionshantering
 * 3.1.0 - Tagit bort passerade avgångar från visningen; nästa avgång alltid först
 * 3.0.1 - Fixat avdupliceringlogik för att använda uniqueId istället för tid
 * 3.0.0 - Lagt till dagsbaserad tidsidentifiering för korrekt sortering och avduplicering
 * 2.0.0 - Förenklad för ny JSON-struktur, borttagen schematypidentifikation
 * 1.0.0 - Originalversion baserad på MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 4.0.0
 * @license MIT
 */

class TimeHandler {
    /**
     * Initierar TimeHandler
     */
    constructor() {
        // Ingen initialisering behövs i denna version
    }

    /**
     * Konverterar tidssträng (HH:MM) till minuter sedan midnatt
     * @param {string} timeStr Tid i HH:MM-format
     * @returns {number} Minuter sedan midnatt
     */
    timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(":").map(Number);
        return hours * 60 + minutes;
    }

    /**
     * Konverterar minuter sedan midnatt till tidssträng (HH:MM)
     * @param {number} minutes Minuter sedan midnatt
     * @returns {string} Tid i HH:MM-format
     */
    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    /**
     * Konverterar JavaScript dag (0-6, där 0 är söndag) till app-dag (1-7, där 1 är måndag)
     * @param {number} jsDay JavaScript dag (0-6)
     * @returns {number} App-dag (1-7)
     */
    convertJsDayToAppDay(jsDay) {
        // Konvertera JavaScript's 0-6 (sön-lör) till 1-7 (mån-sön)
        return jsDay === 0 ? 7 : jsDay;
    }

    /**
     * Hämtar dagnumret (1-7) för ett givet datum
     * @param {Date} date Datum att hämta dagnummer för
     * @returns {number} Dagnummer (1-7, där 1 är måndag)
     */
    getDayNumber(date) {
        return this.convertJsDayToAppDay(date.getDay());
    }

    /**
     * Beräknar dagsskillnaden mellan två dagnummer, hanterar veckans övergång
     * @param {number} day1 Första dagen (1-7)
     * @param {number} day2 Andra dagen (1-7)
     * @returns {number} Dagsskillnad (positiv om dag2 är efter dag1, negativ om före)
     */
    getDayDifference(day1, day2) {
        // Hantera direkt skillnad
        let diff = day2 - day1;
        
        // Justera för veckans övergång
        if (diff > 3) {
            diff = diff - 7;
        } else if (diff < -3) {
            diff = diff + 7;
        }
        
        return diff;
    }

    /**
     * Skapar ett unikt ID för en tid-dag-kombination
     * @param {number} day Dagnummer (1-7)
     * @param {string} time Tid i HH:MM-format
     * @returns {string} Unikt ID
     */
    createUniqueTimeId(day, time) {
        return `${day}-${time}`;
    }

    /**
     * Bearbetar och sorterar schematider för visning
     * Nu förbättrad med dagsbaserad identifiering för korrekt sortering och avduplicering
     * 
     * @param {Array<Object>} times Array av tidsobjekt med format: 
     *                              {time: "HH:MM", isToday: boolean, day?: number, dayOffset?: number}
     * @param {number} maxDepartures Maximalt antal avgångar att returnera
     * @returns {Array<Object>} Bearbetade och sorterade avgångstider
     */
    processScheduleTimes(times, maxDepartures) {
        if (!Array.isArray(times)) {
            console.error("Ogiltig tidsarray:", times);
            return [];
        }

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const currentDay = this.getDayNumber(now);
        
        // Bearbeta tider och skapa utökad information med dagsmedvetenhet
        let processedTimes = times.map(timeObj => {
            const minutesSinceMidnight = this.timeToMinutes(timeObj.time);
            
            // Hämta dagen och dayOffset - antingen från objektet eller beräkna från isToday
            let day = timeObj.day;
            let dayOffset = timeObj.dayOffset;
            
            // Om day inte tillhandahålls men isToday är det, beräkna day och dayOffset
            if (day === undefined) {
                if (timeObj.isToday) {
                    day = currentDay;
                    dayOffset = 0;
                } else {
                    // För morgondagen
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    day = this.getDayNumber(tomorrow);
                    dayOffset = 1;
                }
            }
            
            // Beräkna totala minuter inklusive dagsförskjutning
            const totalMinutes = dayOffset * 24 * 60 + minutesSinceMidnight;
            
            // Skapa ett unikt ID för denna tid-dag-kombination
            const uniqueId = this.createUniqueTimeId(day, timeObj.time);
            
            // Beräkna tidsskillnad från nu
            let diff;
            if (dayOffset === 0 && minutesSinceMidnight >= currentMinutes) {
                // Idag och tiden är i framtiden
                diff = minutesSinceMidnight - currentMinutes;
            } else if (dayOffset === 0 && minutesSinceMidnight < currentMinutes) {
                // Idag men tiden är i det förflutna
                diff = minutesSinceMidnight - currentMinutes;
            } else {
                // Framtida dag
                diff = (dayOffset * 24 * 60) + minutesSinceMidnight - currentMinutes;
            }
            
            return {
                time: timeObj.time,
                minutes: totalMinutes,
                day: day,
                dayOffset: dayOffset,
                diff: diff,
                isPast: diff < 0,
                isToday: dayOffset === 0,
                uniqueId: uniqueId
            };
        });

        // Avduplicera tider genom att välja den instans som är närmast nu
        const uniqueTimes = [];
        const seenIds = new Set();
        
        // Sortera först efter diff för att säkerställa att vi får de närmaste instanserna
        processedTimes.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
        
        // Avduplicera sedan med uniqueId istället för bara tid
        for (const time of processedTimes) {
            if (!seenIds.has(time.uniqueId)) {  // Fixat: Nu används uniqueId istället för time
                uniqueTimes.push(time);
                seenIds.add(time.uniqueId);     // Fixat: Nu används uniqueId istället för time
            }
        }
        
        // Sortera om efter absolut tidsskillnad
        uniqueTimes.sort((a, b) => a.diff - b.diff);

        // Hitta nästa avgång
        const nextDepartureIndex = uniqueTimes.findIndex(t => !t.isPast);
        
        let selectedTimes;
        if (nextDepartureIndex === -1) {
            // Om alla avgångar är passerade, visa de sista
            selectedTimes = uniqueTimes.slice(-maxDepartures);
        } else {
            // FIXAT: Hämta ENDAST nästa avgång och framtida avgångar
            // Inga passerade avgångar inkluderas alls
            selectedTimes = uniqueTimes.slice(nextDepartureIndex, nextDepartureIndex + maxDepartures);
        }

        // Returnera slutformat som är kompatibelt med ursprungligt API
        return selectedTimes.map(t => ({
            time: t.time,
            isToday: t.isToday
        }));
    }
}