/**
 * Sjöstadsfärjetrafiken Web Application - Renderer Module
 * 
 * Denna modul är ansvarig för att rendera och uppdatera användargränssnittet för
 * Sjöstadsfärjetrafiken webbapplikation. Den skapar tidtabellsvyer och hanterar
 * highlight-effekter för avgångar.
 * 
 * Versionshistorik:
 * 4.2.0 - Tillagd varning för utgångna tidtabeller med utgångsdatum
 * 4.1.0 - Tillagd support för maintenance mode (tillfälliga trafikuppehåll)
 * 4.0.0 - Förbättrad versionshantering och uppdateringsnotifieringar
 * 
 * @author Christian Gillinger
 * @version 4.2.0
 * @license MIT
 */

// Definiera Renderer som en global klass för att undvika "not defined" fel
class Renderer {
    /**
     * Initierar Renderer
     * @param {Object} config - Konfigurationsobjekt
     */
    constructor(config) {
        this.config = config;
        // Håll reda på aktiva talsyntesinstanser
        this.activeSpeechSynthesis = null;
        // Lagra senaste upplästa stop och tid
        this.lastReadStop = null;
        this.lastReadTime = null;
    }

    /**
     * Skapar en huvudbehållare för applikationen
     * @returns {HTMLElement} Huvudbehållarelement
     */
    createWrapper() {
        const wrapper = document.createElement("div");
        wrapper.className = "MMM-Resseltrafiken";
        return wrapper;
    }

    /**
     * Visar uppdateringsmeddelande
     * @param {string} newVersion - Ny version tillgänglig
     */
    showUpdateNotification(newVersion) {
        const notification = document.createElement("div");
        notification.className = "update-banner";
        notification.setAttribute("role", "alert");
        
        const content = document.createElement("div");
        content.className = "update-banner-content";
        
        const message = document.createElement("span");
        message.textContent = `Ny version (${newVersion}) tillgänglig!`;
        
        const updateButton = document.createElement("button");
        updateButton.className = "update-button";
        updateButton.textContent = "Uppdatera nu";
        updateButton.addEventListener("click", () => {
            // Rensa cache och ladda om sidan
            if ('caches' in window) {
                caches.keys().then(cacheNames => {
                    Promise.all(
                        cacheNames.map(cacheName => caches.delete(cacheName))
                    ).then(() => {
                        window.location.reload(true);
                    });
                });
            } else {
                window.location.reload(true);
            }
        });
        
        content.appendChild(message);
        content.appendChild(updateButton);
        notification.appendChild(content);
        
        // Lägg till notifikationen högst upp i appen
        const appElement = document.getElementById("app");
        if (appElement && appElement.firstChild) {
            appElement.insertBefore(notification, appElement.firstChild);
        } else if (appElement) {
            appElement.appendChild(notification);
        } else {
            document.body.insertBefore(notification, document.body.firstChild);
        }
    }

    /**
     * Skapar en tidtabellsvy
     * UPPDATERAD: Hanterar nu utgångna tidtabeller
     * @param {Object} timetableData - Tidtabellsdata
     * @param {string} title - Tidtabellstitel
     * @param {string} subtitle - Tidtabellsundertitel (används inte längre)
     * @param {string} highlightStop - Hållplats att markera
     * @param {Object} disembarkOnlyToday - "Endast avstigning"-tider för idag
     * @param {Object} disembarkOnlyTomorrow - "Endast avstigning"-tider för imorgon
     * @param {boolean} isExpired - Om tidtabellen har gått ut
     * @param {string} expiryDate - Datum när tidtabellen gick ut (YYYY-MM-DD format)
     * @returns {HTMLElement} Tidtabellselement
     */
    createTimetable(timetableData, title, subtitle, highlightStop, disembarkOnlyToday, disembarkOnlyTomorrow, isExpired = false, expiryDate = null) {
        const timetable = document.createElement("div");
        timetable.className = "timetable";
        
        // Lägg till titel (utan undertitel) och talsyntes-knapp om aktiverad
        timetable.appendChild(this.createTitleSection(title, timetableData, highlightStop, disembarkOnlyToday, disembarkOnlyTomorrow));
        
        // Visa varning om tidtabellen är utgången
        if (isExpired && expiryDate) {
            const expiryWarning = document.createElement("div");
            expiryWarning.className = "notification warning";
            expiryWarning.style.marginTop = "10px";
            expiryWarning.style.marginBottom = "15px";
            
            const expDate = new Date(expiryDate);
            const formattedDate = expDate.toLocaleDateString('sv-SE', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            
            expiryWarning.innerHTML = `⚠️ Denna tidtabell gick ut ${formattedDate}. Tiderna nedan kan vara inaktuella.`;
            timetable.appendChild(expiryWarning);
        }
        
        // Kontrollera om detta är maintenance mode
        if (timetableData && timetableData.metadata && timetableData.metadata.maintenance_mode) {
            // Visa maintenance-meddelande istället för tidtabell
            const maintenanceMessage = document.createElement("div");
            maintenanceMessage.className = "notification warning";
            maintenanceMessage.style.marginTop = "15px";
            maintenanceMessage.textContent = timetableData.metadata.maintenance_message || "Linjen har tillfälligt uppehåll i trafiken.";
            timetable.appendChild(maintenanceMessage);
            return timetable;
        }
        
        // Kolla om det finns avgångar att visa
        if (timetableData && timetableData.departures && Object.keys(timetableData.departures).length > 0) {
            const hasDisembarkOnlyTimes = this.hasDisembarkOnlyTimes(disembarkOnlyToday, disembarkOnlyTomorrow);
            
            // Tidrubriker
            if (this.config.maxVisibleDepartures > 0) {
                timetable.appendChild(this.createDeparturesHeader());
            }
            
            // Skapa avgångsrader för varje hållplats
            Object.entries(timetableData.departures).forEach(([stop, times]) => {
                const isHighlightedStop = stop === highlightStop;
                
                // Skapa rad för hållplatsen
                const row = this.createStopRow(stop, times, isHighlightedStop, disembarkOnlyToday, disembarkOnlyTomorrow);
                timetable.appendChild(row);
            });
            
            // Lägg till fotnot för "Endast avstigning" om aktiverat och det finns sådana tider
            if (this.config.showDisembarkOnly && hasDisembarkOnlyTimes) {
                timetable.appendChild(this.createDisembarkFootnote());
            }
        } else {
            // Om det inte finns några avgångar, visa ett meddelande
            const noData = document.createElement("div");
            noData.className = "notification warning";
            noData.textContent = "Inga avgångar tillgängliga för denna tidtabell.";
            timetable.appendChild(noData);
        }
        
        return timetable;
    }

    /**
     * Skapar titelsektionen för en tidtabell med talsyntes-knapp
     * @param {string} title - Huvudtitel
     * @param {Object} timetableData - Tidtabellsdata
     * @param {string} highlightStop - Hållplats att markera
     * @param {Object} disembarkOnlyToday - "Endast avstigning"-tider för idag
     * @param {Object} disembarkOnlyTomorrow - "Endast avstigning"-tider för imorgon
     * @returns {HTMLElement} Titelsektionselement
     */
    createTitleSection(title, timetableData, highlightStop, disembarkOnlyToday, disembarkOnlyTomorrow) {
        const titleSection = document.createElement("div");
        titleSection.className = "title-section";
        
        const titleElement = document.createElement("div");
        titleElement.className = "title";
        titleElement.textContent = title;
        
        // Lägg till titelelementet
        titleSection.appendChild(titleElement);
        
        // Lägg till talsyntes-knapp om aktiverad och data finns
        if (this.config.showSpeechSynthesis && timetableData && timetableData.departures && highlightStop) {
            // Kolla om det finns tider för den markerade hållplatsen
            const times = timetableData.departures[highlightStop];
            if (times && times.length > 0) {
                // Skapa och lägg till talsyntes-knapp i titelsektionen
                const speechButton = this.createSpeechButtonForTitle(
                    highlightStop, 
                    times[0], 
                    this.isDisembarkOnlyTime(highlightStop, times[0], disembarkOnlyToday, disembarkOnlyTomorrow)
                );
                titleSection.appendChild(speechButton);
            }
        }
        
        return titleSection;
    }

    /**
     * Skapar en talsyntes-knapp för titelsektionen
     * @param {string} highlightStop - Markerad hållplats
     * @param {Object} firstTime - Första tiden för hållplatsen
     * @param {boolean} isDisembarkOnly - Om avgången är "Endast avstigning"
     * @returns {HTMLElement} Talsyntes-knapp
     */
    createSpeechButtonForTitle(highlightStop, firstTime, isDisembarkOnly) {
        const button = document.createElement("button");
        button.className = "speech-button title-speech-button";
        button.innerHTML = "&#128266;"; // Högtalarsymbol
        button.setAttribute("aria-label", "Läs upp nästa avgång från " + highlightStop);
        button.setAttribute("title", "Läs upp nästa avgång");
        
        button.addEventListener("click", () => {
            // Stoppa eventuell pågående uppläsning
            if (this.activeSpeechSynthesis) {
                window.speechSynthesis.cancel();
                this.activeSpeechSynthesis = null;
                
                // Ta bort highlighting från andra knappar
                document.querySelectorAll('.speech-button.speaking').forEach(btn => {
                    if (btn !== button) {
                        btn.classList.remove('speaking');
                    }
                });
            }
            
            // Avgör om det är en snar avgång (inom 10 minuter)
            const [hours, minutes] = firstTime.time.split(":").map(Number);
            const timeInMinutes = hours * 60 + minutes;
            
            const now = new Date();
            const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
            const diffMinutes = timeInMinutes - currentTimeInMinutes;
            
            const isImminentDeparture = firstTime.isToday && diffMinutes >= 0 && diffMinutes < 10;
            
            // Skapa meddelande baserat på om det är "Endast avstigning" och/eller snar avgång
            let message = "";
            
            if (isDisembarkOnly) {
                if (isImminentDeparture) {
                    message = `Snar avgång från ${highlightStop} klockan ${firstTime.time.replace(':', ' och ')}. Observera, endast avstigning vid denna hållplats.`;
                } else if (firstTime.isToday) {
                    message = `Nästa avgång från ${highlightStop} är klockan ${firstTime.time.replace(':', ' och ')}. Observera, endast avstigning vid denna hållplats.`;
                } else {
                    message = `Nästa avgång från ${highlightStop} är i morgon klockan ${firstTime.time.replace(':', ' och ')}. Observera, endast avstigning vid denna hållplats.`;
                }
            } else {
                if (isImminentDeparture) {
                    message = `Snar avgång från ${highlightStop} klockan ${firstTime.time.replace(':', ' och ')}.`;
                } else if (firstTime.isToday) {
                    message = `Nästa avgång från ${highlightStop} är klockan ${firstTime.time.replace(':', ' och ')}.`;
                } else {
                    message = `Nästa avgång från ${highlightStop} är i morgon klockan ${firstTime.time.replace(':', ' och ')}.`;
                }
            }
            
            const speech = new SpeechSynthesisUtterance(message);
            speech.lang = "sv-SE";
            
            speech.onstart = () => {
                button.classList.add("speaking");
                this.activeSpeechSynthesis = speech;
                
                // Spara senaste upplästa stopp och tid
                this.lastReadStop = highlightStop;
                this.lastReadTime = firstTime.time;
            };
            
            speech.onend = () => {
                button.classList.remove("speaking");
                this.activeSpeechSynthesis = null;
            };
            
            speech.onerror = () => {
                button.classList.remove("speaking");
                this.activeSpeechSynthesis = null;
                console.error("Fel vid talsyntes");
            };
            
            window.speechSynthesis.speak(speech);
        });
        
        return button;
    }

    /**
     * Skapar ett rubrikelement för avgångstider
     * @returns {HTMLElement} Avgångsrubrikelement
     */
    createDeparturesHeader() {
        const header = document.createElement("div");
        header.className = "departures-header";
        header.textContent = "Avgångar";
        return header;
    }

    /**
     * Skapar en rad för en hållplats med dess avgångstider
     * @param {string} stop - Hållplatsnamn
     * @param {Array} times - Array med tidsobjekt
     * @param {boolean} isHighlighted - Om denna hållplats ska markeras
     * @param {Object} disembarkOnlyToday - "Endast avstigning"-tider för idag
     * @param {Object} disembarkOnlyTomorrow - "Endast avstigning"-tider för imorgon
     * @returns {HTMLElement} Hållplatsradelement
     */
    createStopRow(stop, times, isHighlighted, disembarkOnlyToday, disembarkOnlyTomorrow) {
        const row = document.createElement("div");
        row.className = "row";
        if (isHighlighted) {
            row.classList.add("highlight-stop");
        }
        
        // Skapa hållplatscell
        const stopElement = document.createElement("div");
        stopElement.className = "stop";
        stopElement.textContent = stop;
        row.appendChild(stopElement);
        
        // Skapa avgångstidsceller
        const timesElement = document.createElement("div");
        timesElement.className = "times";
        
        // Om inga tider finns, visa ett meddelande
        if (!times || times.length === 0) {
            const noTimesSpan = document.createElement("span");
            noTimesSpan.textContent = "Inga avgångar";
            noTimesSpan.style.fontStyle = "italic";
            timesElement.appendChild(noTimesSpan);
        } else {
            // Kontrollera om det finns några avgångar för idag
            const hasRemainingTodayDepartures = times.some(timeObj => timeObj.isToday && this.isDepartureInFuture(timeObj.time));
            
            // Skapa tidselement för varje avgång
            times.forEach((timeObj, index) => {
                const timeElement = this.createTimeElement(
                    timeObj.time, 
                    timeObj.isToday, 
                    (index === 0 && isHighlighted && (hasRemainingTodayDepartures || !timeObj.isToday)),  // Markera även första morgondagens avgång
                    this.isDisembarkOnlyTime(stop, timeObj, disembarkOnlyToday, disembarkOnlyTomorrow),
                    hasRemainingTodayDepartures
                );
                timesElement.appendChild(timeElement);
            });
        }
        
        row.appendChild(timesElement);
        return row;
    }

    /**
     * Kontrollerar om en avgångstid är i framtiden
     * @param {string} time - Tidssträng (HH:MM)
     * @returns {boolean} Sant om tiden är i framtiden
     */
    isDepartureInFuture(time) {
        const [hours, minutes] = time.split(":").map(Number);
        const timeInMinutes = hours * 60 + minutes;
        
        const now = new Date();
        const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
        
        return timeInMinutes > currentTimeInMinutes;
    }

    /**
     * Kontrollerar om en tid är markerad som "Endast avstigning"
     * @param {string} stop - Hållplatsnamn
     * @param {Object} timeObj - Tidsobjekt med .time och .isToday
     * @param {Object} disembarkOnlyToday - "Endast avstigning"-tider för idag
     * @param {Object} disembarkOnlyTomorrow - "Endast avstigning"-tider för imorgon
     * @returns {boolean} Sant om tiden är "Endast avstigning"
     */
    isDisembarkOnlyTime(stop, timeObj, disembarkOnlyToday, disembarkOnlyTomorrow) {
        if (!this.config.showDisembarkOnly) {
            return false;
        }
        
        const { time, isToday } = timeObj;
        
        if (isToday && disembarkOnlyToday && disembarkOnlyToday[stop]) {
            return disembarkOnlyToday[stop].includes(time);
        }
        
        if (!isToday && disembarkOnlyTomorrow && disembarkOnlyTomorrow[stop]) {
            return disembarkOnlyTomorrow[stop].includes(time);
        }
        
        return false;
    }

    /**
     * Skapar ett tidselement för en avgång
     * @param {string} time - Tidssträng (HH:MM)
     * @param {boolean} isToday - Om tiden är för idag
     * @param {boolean} isNextDeparture - Om detta är nästa avgång
     * @param {boolean} isDisembarkOnly - Om detta är "Endast avstigning"
     * @param {boolean} hasRemainingTodayDepartures - Om det finns kvarvarande avgångar för idag
     * @returns {HTMLElement} Tidselement
     */
    createTimeElement(time, isToday, isNextDeparture, isDisembarkOnly, hasRemainingTodayDepartures) {
        const timeElement = document.createElement("span");
        timeElement.textContent = time;
        timeElement.className = "time";
        
        // Hitta tidsskillnad för att avgöra om det är inom 10 minuter
        const [hours, minutes] = time.split(":").map(Number);
        const timeInMinutes = hours * 60 + minutes;
        
        const now = new Date();
        const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
        const diffMinutes = timeInMinutes - currentTimeInMinutes;
        
        // Lägg till klasser baserat på om det är morgondagens tid
        if (!isToday) {
            timeElement.classList.add("tomorrow-time");
        }
        
        // Highlight-logik för nästa avgång
        if (isNextDeparture) {
            // Om det är dagens tid eller om den är morgondagens första tid och det inte finns några kvarvarande idag
            if (isToday) {
                // Normal highlight för dagens avgångar
                if (diffMinutes < 10 && diffMinutes >= 0) {
                    timeElement.classList.add("highlight-yellow");
                } else if (diffMinutes >= 0) {
                    timeElement.classList.add("highlight-green");
                }
            } else if (!hasRemainingTodayDepartures) {
                // Om det inte finns några avgångar kvar idag, markera morgondagens första avgång med grön ram
                timeElement.classList.add("highlight-green");
            }
        }
        
        // Hantera "Endast avstigning"-indikator
        if (isDisembarkOnly) {
            timeElement.classList.add("disembark-only");
            
            const indicator = document.createElement("span");
            indicator.className = "disembark-indicator";
            indicator.textContent = "*";
            indicator.setAttribute("title", "Endast avstigning");
            indicator.setAttribute("aria-label", "Endast avstigning");
            
            timeElement.appendChild(indicator);
        }
        
        return timeElement;
    }

    /**
     * Skapar en fotnot för "Endast avstigning"
     * @returns {HTMLElement} Fotnot-element
     */
    createDisembarkFootnote() {
        const footnote = document.createElement("div");
        footnote.className = "disembark-footnote";
        footnote.innerHTML = "<span>*</span> Endast avstigning";
        return footnote;
    }

    /**
     * Kontrollerar om det finns "Endast avstigning"-tider i schemat
     * @param {Object} disembarkOnlyToday - Dagens "Endast avstigning"-tider
     * @param {Object} disembarkOnlyTomorrow - Morgondagens "Endast avstigning"-tider
     * @returns {boolean} Sant om det finns "Endast avstigning"-tider
     */
    hasDisembarkOnlyTimes(disembarkOnlyToday, disembarkOnlyTomorrow) {
        if (!this.config.showDisembarkOnly) {
            return false;
        }
        
        // Kontrollera dagens "Endast avstigning"-tider
        if (disembarkOnlyToday && Object.keys(disembarkOnlyToday).length > 0) {
            for (const stop in disembarkOnlyToday) {
                if (disembarkOnlyToday[stop] && disembarkOnlyToday[stop].length > 0) {
                    return true;
                }
            }
        }
        
        // Kontrollera morgondagens "Endast avstigning"-tider
        if (disembarkOnlyTomorrow && Object.keys(disembarkOnlyTomorrow).length > 0) {
            for (const stop in disembarkOnlyTomorrow) {
                if (disembarkOnlyTomorrow[stop] && disembarkOnlyTomorrow[stop].length > 0) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Konfigurerar overflow-observatörer för bättre mobilvisning
     * @param {HTMLElement} wrapper - Huvudbehållarelement
     */
    setupOverflowObservers(wrapper) {
        // Använd IntersectionObserver för att detektera när element blir synliga/osynliga
        if ('IntersectionObserver' in window) {
            const timetables = wrapper.querySelectorAll('.timetable');
            timetables.forEach(timetable => {
                const times = timetable.querySelectorAll('.times');
                times.forEach(timeContainer => {
                    // Kontrollera om container flödar över
                    if (timeContainer.scrollWidth > timeContainer.clientWidth) {
                        timeContainer.classList.add('overflow');
                        
                        // Lägg till swiping-indikator
                        const indicator = document.createElement('div');
                        indicator.className = 'swipe-indicator';
                        indicator.innerHTML = '&#8594;'; // Höger pil
                        timeContainer.appendChild(indicator);
                        
                        // Aktivera horisontell scrollning på mobil
                        timeContainer.style.overflowX = 'auto';
                        timeContainer.style.webkitOverflowScrolling = 'touch';
                    }
                });
            });
        }
    }
}
