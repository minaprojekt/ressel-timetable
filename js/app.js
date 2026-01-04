/**
 * Sjöstadsfärjetrafiken Web Application - Main Application
 * 
 * Detta är huvudingångspunkten och styrmodulen för Sjöstadsfärjetrafiken webbapplikation.
 * Den samordnar TimeHandler och Renderer-modulerna, hanterar datainläsning och uppdateringar,
 * och hanterar applikationens övergripande livscykel.
 * 
 * Versionshistorik:
 * 4.2.0 - Hanterar utgångna tidtabeller genom att visa dem med varning
 * 5.0.0 - Simplified timetable structure (50% fewer files), Winter 2025/2026 added
 * 4.2.0 - Expired timetable warnings
 * 4.1.0 - Tillagd support för maintenance mode
 * 4.0.0 - Förbättrad versionshantering, automatisk uppdatering, och reload vid reset
 * 3.3.0 - Ta bort "Senaste uppdatering"-text, ändra standardvärde för talsyntes
 * 3.2.0 - Fixad bugg med Återställ-knappen
 * 3.1.0 - Fixad bugg med Renderer-referens i GitHub Pages
 * 3.0.0 - Fixad cache-busting för GitHub Pages
 * 2.0.0 - Fixat så fotnot bara visas när det faktiskt finns "Endast avstigning"-tider
 * 1.0.0 - Originalversion baserad på MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 5.0.0
 * @license MIT
 */

document.addEventListener('DOMContentLoaded', async function() {
    /**
     * Applikationskonfigurationsobjekt
     * @type {Object}
     */
    const config = {
        version: '5.0.0',                  // Applikationsversion (uppdatera vid varje ny version)
        updateInterval: 60000,             // Uppdateringsintervall i millisekunder (1 minut)
        dataRefreshInterval: 1800000,      // Uppdatera data från server var 30:e minut
        midnightCheckInterval: 60000,      // Kontrollera midnatt var minut
        versionCheckInterval: 3600000,     // Kontrollera versionsuppdateringar varje timme
        showBothDirections: true,          // Visa både utgående och returresor
        showSjostadstrafiken: true,        // Visa Sjöstadstrafiken tidtabell
        showEmelietrafiken: true,          // Visa Emelietrafiken (M/S Emelie) tidtabell
        showSpeechSynthesis: false,        // Visa talsyntes-knappar för tillgänglighet (ändrat till false)
        showDisembarkOnly: true,           // Visa "Endast avstigning" indikator (aktivt som standard)
        highlightStop: "Lumabryggan",      // Hållplats att markera i användargränssnittet
        cityHighlightStop: "Lumabryggan",  // Hållplats att markera för citylinjen (till city)
        cityReturnStop: "Nybroplan",       // Returhållplats att markera för cityriktning
        maxVisibleDepartures: 7,           // Standardantal synliga avgångar per hållplats
        dataPaths: {                       // Sökvägar till konfigurationsfiler
            sjoConfig: './data/ressel-sjo-config.json',
            cityConfig: './data/ressel-city-config.json'
        },
        debug: false                       // Aktivera debugloggning
    };

    // Flag för att spåra om app är nyligen uppdaterad
    let isAppUpdated = false;

    /**
     * Förhindra caching av JSON-anrop genom att lägga till en timestamp som query parameter
     * 
     * @param {string} url - URL att lägga till cache-busting på
     * @returns {string} URL med cache-busting parameter
     */
    function addCacheBuster(url) {
        // Skapa ett nytt URL-objekt baserat på aktuell sida och den relativa URL:en
        const bustedUrl = new URL(url, window.location.href);
        
        // Lägg till en timestamp som query-parameter
        bustedUrl.searchParams.append('_nocache', Date.now().toString());
        
        // Returnera den kompletta URL:en som en sträng
        return bustedUrl.toString();
    }

    /**
     * Kontrollerar om applikationens version har ändrats
     * @returns {Promise<boolean>} Sant om en ny version har upptäckts
     */
    async function checkForUpdates() {
        try {
            // Hämta manifest.json för att jämföra versioner
            const response = await fetch(addCacheBuster('./manifest.json'));
            if (response.ok) {
                const manifest = await response.json();
                
                // Jämför manifest.version med nuvarande config.version
                if (manifest.version && manifest.version !== config.version) {
                    debugLog(`Ny version upptäckt: Manifest=${manifest.version}, App=${config.version}`);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Fel vid kontroll av uppdateringar:', error);
            return false;
        }
    }

    /**
     * Visar uppdateringsnotifieringen
     */
    function showUpdateNotification() {
        const updateNotification = document.getElementById('update-notification');
        if (updateNotification) {
            updateNotification.style.display = 'block';
        }
    }

    /**
     * Rensar cachen och laddar om applikationen
     */
    function clearCacheAndReload() {
        try {
            if ('caches' in window) {
                caches.keys().then(cacheNames => {
                    return Promise.all(
                        cacheNames.map(cacheName => {
                            return caches.delete(cacheName);
                        })
                    );
                }).then(() => {
                    // Ladda om sidan efter att cacherna är rensade
                    window.location.reload(true);
                });
            } else {
                // Fallback om Caches API inte stöds
                window.location.reload(true);
            }
        } catch (error) {
            console.error('Fel vid rensning av cache:', error);
            window.location.reload(true);
        }
    }

    // Försök ladda konfiguration från URL-parametrar om de finns
    loadConfigFromURL();
    
    // Försök ladda konfiguration från localStorage om de finns
    loadConfigFromLocalStorage();

    document.documentElement.style.setProperty('--visible-departures', config.maxVisibleDepartures);

    // Lagra laddad tidtabellsdata för olika dagar
    let timetableData = {
        today: {
            sjo: null,
            city: null,
            disembarkOnly: {
                toCity: null,
                fromCity: null
            },
            isExpired: {
                sjo: false,
                city: false
            },
            expiryDate: {
                sjo: null,
                city: null
            }
        },
        tomorrow: {
            sjo: null,
            city: null,
            disembarkOnly: {
                toCity: null,
                fromCity: null
            }
        },
        config: {
            sjo: null,
            city: null
        },
        lastUpdate: null, // Tidpunkt för senaste uppdatering från server
        lastRefresh: null // Tidpunkt för senaste uppdatering av visning
    };

    // Håll koll på timer-IDs för att kunna avbryta och starta om timers
    let timers = {
        displayUpdate: null,    // För 1-minuts uppdatering av visningen
        dataRefresh: null,      // För 30-minuters uppdatering av data
        midnightCheck: null,    // För kontroll av dagsbyte vid midnatt
        versionCheck: null      // För kontroll av versionsuppdateringar
    };

    const timeHandler = new TimeHandler();
    const renderer = new Renderer(config);
    
    // Behåll en referens till inställningspanelen
    let settingsPanel = null;

    /**
     * Konverterar JavaScript-dag (0-6, där 0 är söndag) till appdagar (1-7, där 1 är måndag)
     * @param {number} jsDay JavaScript-dag (0-6)
     * @returns {number} Appdag (1-7)
     */
    function convertJsDayToAppDay(jsDay) {
        // Konvertera JavaScript's 0-6 (sön-lör) till 1-7 (mån-sön)
        return jsDay === 0 ? 7 : jsDay;
    }

    /**
     * Hämtar dagnumret (1-7) för ett givet datum
     * @param {Date} date Datum att hämta dagnummer för
     * @returns {number} Dagnummer (1-7, där 1 är måndag)
     */
    function getDayNumber(date) {
        return convertJsDayToAppDay(date.getDay());
    }

    /**
     * Skapar tidsobjekt med dagsinformation
     * @param {Array<string>} times Array med tidssträngrar
     * @param {Date} date Datum för dessa tider
     * @param {Date} currentDate Aktuellt datum för jämförelse
     * @returns {Array<Object>} Förbättrade tidsobjekt med dagsinformation
     */
    function createEnhancedTimeObjects(times, date, currentDate) {
        if (!Array.isArray(times)) return [];
        
        const dayNumber = getDayNumber(date);
        let dayOffset = 0;
        
        // Beräkna dagsförskjutning baserat på datum
        if (date.toDateString() !== currentDate.toDateString()) {
            // Enkel beräkning för morgondagen (vanligaste fallet)
            if (date.getDate() === currentDate.getDate() + 1 &&
                date.getMonth() === currentDate.getMonth() &&
                date.getFullYear() === currentDate.getFullYear()) {
                dayOffset = 1;
            } else {
                // För andra fall, beräkna exakt skillnad
                const diffTime = date.getTime() - currentDate.getTime();
                dayOffset = Math.ceil(diffTime / (1000 * 3600 * 24));
            }
        }
        
        return times.map(time => ({
            time: time,
            isToday: dayOffset === 0,
            day: dayNumber,
            dayOffset: dayOffset
        }));
    }

    /**
     * Återställer alla inställningar till standardvärden och laddar om sidan
     */
    function resetSettings() {
        try {
            if (localStorage) {
                localStorage.removeItem('sjostadsfarjetrafiken_settings');
            }
            
            // Rensa URL-parametrar
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Stäng inställningspanelen om den är öppen
            if (settingsPanel) {
                closeSettingsPanel();
            }
            
            // Visa ett laddningsmeddelande
            const loadingElement = document.getElementById('loading');
            if (loadingElement) {
                loadingElement.textContent = 'Återställer inställningar och laddar om...';
                loadingElement.style.display = 'block';
            }
            
            // Rensa cacher och ladda om sidan
            setTimeout(() => {
                clearCacheAndReload();
            }, 500);
        } catch (error) {
            console.error('Fel vid återställning av inställningar:', error);
            
            // Visa felmeddelande
            const appElement = document.getElementById('app');
            const errorNotification = document.createElement('div');
            errorNotification.className = 'notification error';
            errorNotification.textContent = 'Ett fel uppstod vid återställning av inställningar.';
            
            // Lägg till felmeddelande högst upp
            if (appElement.firstChild) {
                appElement.insertBefore(errorNotification, appElement.firstChild);
            } else {
                appElement.appendChild(errorNotification);
            }
            
            // Ta bort felmeddelandet efter 3 sekunder
            setTimeout(() => {
                errorNotification.remove();
            }, 3000);
        }
    }

    /**
     * Laddar konfiguration från localStorage
     * Detta bevarar användarpreferenser mellan sessioner
     */
    function loadConfigFromLocalStorage() {
        try {
            // Ladda bara om localStorage är tillgängligt och vi har sparade inställningar
            if (localStorage && localStorage.getItem('sjostadsfarjetrafiken_settings')) {
                const savedSettings = JSON.parse(localStorage.getItem('sjostadsfarjetrafiken_settings'));
                
                // Tillämpa sparade inställningar om de finns, men överskrid inte URL-parametrar
                if (savedSettings.showSjostadstrafiken !== undefined && !urlHasParam('sjo')) {
                    config.showSjostadstrafiken = savedSettings.showSjostadstrafiken;
                }
                
                if (savedSettings.showEmelietrafiken !== undefined && !urlHasParam('emelie')) {
                    config.showEmelietrafiken = savedSettings.showEmelietrafiken;
                }
                
                if (savedSettings.showBothDirections !== undefined && !urlHasParam('bothdir')) {
                    config.showBothDirections = savedSettings.showBothDirections;
                }
                
                if (savedSettings.maxVisibleDepartures !== undefined && !urlHasParam('maxdep')) {
                    config.maxVisibleDepartures = savedSettings.maxVisibleDepartures;
                    // Uppdatera CSS-variabel
                    document.documentElement.style.setProperty('--visible-departures', config.maxVisibleDepartures);
                }
                
                if (savedSettings.highlightStop !== undefined && !urlHasParam('highlight')) {
                    config.highlightStop = savedSettings.highlightStop;
                }
                
                if (savedSettings.cityHighlightStop !== undefined && !urlHasParam('cityhighlight')) {
                    config.cityHighlightStop = savedSettings.cityHighlightStop;
                }
                
                if (savedSettings.cityReturnStop !== undefined && !urlHasParam('returnstop')) {
                    config.cityReturnStop = savedSettings.cityReturnStop;
                }
                
                if (savedSettings.showSpeechSynthesis !== undefined && !urlHasParam('speech')) {
                    config.showSpeechSynthesis = savedSettings.showSpeechSynthesis;
                }
                
                // Ny inställning för "Endast avstigning"
                if (savedSettings.showDisembarkOnly !== undefined && !urlHasParam('disembark')) {
                    config.showDisembarkOnly = savedSettings.showDisembarkOnly;
                }
                
                // Kontrollera sparad version mot aktuell version för uppdateringsnotifiering
                if (savedSettings.appVersion && savedSettings.appVersion !== config.version) {
                    isAppUpdated = true;
                }
            }
        } catch (error) {
            console.warn('Kunde inte ladda inställningar från localStorage:', error);
        }
    }
    
    /**
     * Kontrollerar om en URL-parameter existerar
     * @param {string} paramName - Parameternamn att kontrollera
     * @returns {boolean} Sant om parametern existerar i URL
     */
    function urlHasParam(paramName) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.has(paramName);
    }
    
    /**
     * Sparar aktuell konfiguration till localStorage
     */
    function saveConfigToLocalStorage() {
        try {
            if (localStorage) {
                const settings = {
                    appVersion: config.version,
                    showSjostadstrafiken: config.showSjostadstrafiken,
                    showEmelietrafiken: config.showEmelietrafiken,
                    showBothDirections: config.showBothDirections,
                    maxVisibleDepartures: config.maxVisibleDepartures,
                    highlightStop: config.highlightStop,
                    cityHighlightStop: config.cityHighlightStop,
                    cityReturnStop: config.cityReturnStop,
                    showSpeechSynthesis: config.showSpeechSynthesis,
                    showDisembarkOnly: config.showDisembarkOnly,
                    lastUpdated: new Date().toISOString()
                };
                
                localStorage.setItem('sjostadsfarjetrafiken_settings', JSON.stringify(settings));
            }
        } catch (error) {
            console.warn('Kunde inte spara inställningar till localStorage:', error);
        }
    }

    /**
     * Laddar konfiguration från URL-parametrar
     * Detta möjliggör enkel anpassning av visning utan att redigera kod
     */
    function loadConfigFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Kontrollera visa/dölj-parametrar
        if (urlParams.has('sjo')) {
            config.showSjostadstrafiken = urlParams.get('sjo') === '1' || 
                                          urlParams.get('sjo') === 'true';
        }
        
        if (urlParams.has('emelie')) {
            config.showEmelietrafiken = urlParams.get('emelie') === '1' || 
                                        urlParams.get('emelie') === 'true';
        }
        
        // Kontrollera markera hållplatsparametrar
        if (urlParams.has('highlight')) {
            config.highlightStop = decodeURIComponent(urlParams.get('highlight'));
        }
        
        if (urlParams.has('cityhighlight')) {
            config.cityHighlightStop = decodeURIComponent(urlParams.get('cityhighlight'));
        }
        
        if (urlParams.has('returnstop')) {
            config.cityReturnStop = decodeURIComponent(urlParams.get('returnstop'));
        }
        
        // Kontrollera riktningsinställning
        if (urlParams.has('bothdir')) {
            config.showBothDirections = urlParams.get('bothdir') === '1' || 
                                        urlParams.get('bothdir') === 'true';
        }
        
        // Kontrollera talsyntes-inställning
        if (urlParams.has('speech')) {
            config.showSpeechSynthesis = urlParams.get('speech') === '1' || 
                                        urlParams.get('speech') === 'true';
        }
        
        // Kontrollera "Endast avstigning"-inställning
        if (urlParams.has('disembark')) {
            config.showDisembarkOnly = urlParams.get('disembark') === '1' || 
                                      urlParams.get('disembark') === 'true';
        }
        
        // Kontrollera maxVisibleDepartures
        if (urlParams.has('maxdep')) {
            let maxDep = parseInt(urlParams.get('maxdep'), 10);
            if (!isNaN(maxDep) && maxDep > 0) {
                config.maxVisibleDepartures = maxDep;
                // Uppdatera CSS-variabel
                document.documentElement.style.setProperty('--visible-departures', config.maxVisibleDepartures);
            }
        } else {
            // Sätt standard baserat på skärmstorlek om ej specificerat i URL
            setDefaultDeparturesBasedOnScreenSize();
        }
        
        // Kontrollera för forceUpdate parameter - används för att tvinga om en uppdatering
        if (urlParams.has('forceUpdate')) {
            clearCacheAndReload();
        }
    }
    
    /**
     * Sätter standardantal synliga avgångar baserat på skärmstorlek
     */
    function setDefaultDeparturesBasedOnScreenSize() {
        // Sätt standard bara om inte redan inställt i localStorage
        if (localStorage && !localStorage.getItem('sjostadsfarjetrafiken_settings')) {
            // Kontrollera om mobil (<768px)
            if (window.innerWidth < 768) {
                config.maxVisibleDepartures = 4;
                document.documentElement.style.setProperty('--visible-departures', 4);
            } else {
                // Desktop standard
                config.maxVisibleDepartures = 7;
                document.documentElement.style.setProperty('--visible-departures', 7);
            }
        }
    }

    /**
     * Loggar debugmeddelanden om debugläge är aktiverat
     * @param {string} message - Meddelande att logga
     * @param {*} [data] - Valfri data att logga
     */
    function debugLog(message, data = null) {
        if (config.debug) {
            console.log(`[Sjöstadsfärjetrafiken] ${message}`, data || '');
        }
    }

    /**
     * Extraherar "Endast avstigning"-tider för en viss tidtabell
     * Hanterar alla möjliga datastrukturer
     * 
     * @param {Object} scheduleData - Tidtabellsdata
     * @param {string} direction - Riktning ('to_city' eller 'from_city')
     * @returns {Object} Objekt med hållplatser som nycklar och arrayer av tider som värden
     */
    function extractDisembarkOnlyTimes(scheduleData, direction) {
        if (!scheduleData || !scheduleData.disembark_only) {
            return null;
        }
        
        const disembarkOnlyTimes = {};
        const dayType = scheduleData.metadata?.day_type || 'unknown';
        
        try {
            // Hantera olika strukturer för disembark_only data
            
            // Struktur 1: Direkt under root med dagtyp (saturday, sunday, weekday)
            if (scheduleData.disembark_only[dayType]) {
                Object.entries(scheduleData.disembark_only[dayType]).forEach(([stop, times]) => {
                    if (Array.isArray(times)) {
                        disembarkOnlyTimes[stop] = times;
                    }
                });
                return disembarkOnlyTimes;
            }
            
            // Struktur 2: Direkt under disembark_only utan dagtyp (för vissa vinterfiler)
            const directStopEntries = Object.entries(scheduleData.disembark_only).filter(
                ([key, value]) => !['to_city', 'from_city', 'saturday', 'sunday', 'weekday'].includes(key)
            );
            
            if (directStopEntries.length > 0) {
                directStopEntries.forEach(([stop, times]) => {
                    if (Array.isArray(times)) {
                        disembarkOnlyTimes[stop] = times;
                    }
                });
                
                // Om det finns direktstop och vi har data, returnera det
                if (Object.keys(disembarkOnlyTimes).length > 0) {
                    return disembarkOnlyTimes;
                }
            }
            
            // Struktur 3: Med riktningsinformation (to_city, from_city)
            if (scheduleData.disembark_only[direction]) {
                // Struktur 3.1: Direkt under riktning
                const directRichtungsStops = Object.entries(scheduleData.disembark_only[direction]).filter(
                    ([key, value]) => !['morning', 'lunch', 'afternoon', 'stops'].includes(key) && Array.isArray(value)
                );
                
                if (directRichtungsStops.length > 0) {
                    directRichtungsStops.forEach(([stop, times]) => {
                        disembarkOnlyTimes[stop] = times;
                    });
                    return disembarkOnlyTimes;
                }
                
                // Struktur 3.2: Under riktning.stops
                if (scheduleData.disembark_only[direction].stops) {
                    return scheduleData.disembark_only[direction].stops;
                }
                
                // Struktur 3.3: Separerade efter tidsperiod (morning, lunch, afternoon)
                if (scheduleData.disembark_only[direction].morning || 
                    scheduleData.disembark_only[direction].lunch || 
                    scheduleData.disembark_only[direction].afternoon) {
                    
                    ['morning', 'lunch', 'afternoon'].forEach(period => {
                        if (scheduleData.disembark_only[direction][period]) {
                            Object.entries(scheduleData.disembark_only[direction][period]).forEach(([stop, times]) => {
                                if (!disembarkOnlyTimes[stop]) disembarkOnlyTimes[stop] = [];
                                disembarkOnlyTimes[stop] = [...disembarkOnlyTimes[stop], ...times];
                            });
                        }
                    });
                    
                    return disembarkOnlyTimes;
                }
            }
            
            // Om inget matchat, returnera tomt objekt
            return {};
        } catch (error) {
            console.error('Fel vid extraktion av "Endast avstigning"-tider:', error);
            return {};
        }
    }

    /**
     * Laddar konfigurationsfiler för Sjöstadstrafiken och Citylinjen
     * med cache-busting för att säkerställa senaste data
     * @returns {Promise<Object>} Den laddade konfigurationsdatan
     */
    async function loadConfigData() {
        try {
            debugLog('Laddar konfigurationsdata...');
            
            // Ladda båda konfigurationsfilerna med cache-busting
            const [sjoConfigResponse, cityConfigResponse] = await Promise.all([
                fetch(addCacheBuster(config.dataPaths.sjoConfig)),
                fetch(addCacheBuster(config.dataPaths.cityConfig))
            ]);
            
            if (!sjoConfigResponse.ok || !cityConfigResponse.ok) {
                throw new Error(`HTTP error! status: ${sjoConfigResponse.status} / ${cityConfigResponse.status}`);
            }

            const sjoConfig = await sjoConfigResponse.json();
            const cityConfig = await cityConfigResponse.json();

            debugLog('Konfigurationsdata laddades framgångsrikt');
            
            return {
                sjo: sjoConfig,
                city: cityConfig
            };
        } catch (error) {
            console.error('Fel vid laddning av konfigurationsdata:', error);
            handleError(error, 'Kunde inte ladda konfigurationsdata');
            return null;
        }
    }

    /**
     * Bestämmer vilka tidtabellsfiler som ska användas baserat på aktuellt datum och konfiguration
     * UPPDATERAD: Returnerar nu även om tidtabellen är utgången och när den gick ut
     * @param {Object} configData - Konfigurationsdata
     * @param {Date} date - Datum att bestämma schema för
     * @returns {Object} Ett objekt med sökvägar, utgångsstatus och datum
     */
    function determineTimetableFiles(configData, date) {
        const result = {
            sjo: null,
            city: null,
            sjoExpired: false,
            cityExpired: false,
            sjoExpiryDate: null,
            cityExpiryDate: null
        };

        try {
            // Bestäm dagtyp
            const dayOfWeek = date.getDay();
            const isSaturday = dayOfWeek === 6;
            const isSunday = dayOfWeek === 0;
            const dayType = isSaturday ? "saturday" : (isSunday ? "sunday" : "weekday");

            // Hitta lämplig Sjöstadstrafiken-tidtabellfil
            let sjoSeason = null;
            let sjoLatestSeason = null;
            
            for (const season of configData.sjo.season_mapping) {
                const seasonStart = new Date(season.period.start);
                const seasonEnd = new Date(season.period.end);
                
                // Spara senaste säsongen vi hittar
                if (!sjoLatestSeason || seasonEnd > new Date(sjoLatestSeason.period.end)) {
                    sjoLatestSeason = season;
                }
                
                if (date >= seasonStart && date <= seasonEnd) {
                    sjoSeason = season;
                    break;
                }
            }
            
            // Använd hittad säsong eller senaste tillgängliga
            if (sjoSeason) {
                result.sjo = dayType === "saturday" || dayType === "sunday" ? 
                    sjoSeason.files.weekend : sjoSeason.files.weekday;
                result.sjoExpired = false;
            } else if (sjoLatestSeason) {
                // Tidtabellen har gått ut - använd senaste tillgängliga
                result.sjo = dayType === "saturday" || dayType === "sunday" ? 
                    sjoLatestSeason.files.weekend : sjoLatestSeason.files.weekday;
                result.sjoExpired = true;
                result.sjoExpiryDate = sjoLatestSeason.period.end;
            }

            // Hitta lämplig Citylinje-tidtabellfil
            let citySeason = null;
            let cityLatestSeason = null;
            
            for (const season of configData.city.season_mapping) {
                const seasonStart = new Date(season.period.start);
                const seasonEnd = new Date(season.period.end);
                
                // Spara senaste säsongen vi hittar
                if (!cityLatestSeason || seasonEnd > new Date(cityLatestSeason.period.end)) {
                    cityLatestSeason = season;
                }
                
                if (date >= seasonStart && date <= seasonEnd) {
                    // Kontrollera om aktuellt datum är en helgdag som ska använda helgschema
                    if (season.holiday_rules && season.holiday_rules.weekend_schedule) {
                        const dateStr = date.toISOString().split('T')[0];
                        if (season.holiday_rules.weekend_schedule.includes(dateStr)) {
                            result.city = season.files.sunday;
                            result.cityExpired = false;
                            return result;
                        }
                    }
                    
                    citySeason = season;
                    break;
                }
            }
            
            // Använd hittad säsong eller senaste tillgängliga
            if (citySeason) {
                result.city = citySeason.files[dayType];
                result.cityExpired = false;
            } else if (cityLatestSeason) {
                // Tidtabellen har gått ut - använd senaste tillgängliga
                result.city = cityLatestSeason.files[dayType] || cityLatestSeason.files.weekday;
                result.cityExpired = true;
                result.cityExpiryDate = cityLatestSeason.period.end;
            }

            return result;
        } catch (error) {
            console.error('Fel vid bestämning av tidtabellsfiler:', error);
            return result;
        }
    }

    /**
     * Laddar och validerar tidtabellsdata för en specifik dag
     * UPPDATERAD: Hanterar nu även utgångna tidtabeller
     * @param {Object} configData - Konfigurationsdata
     * @param {Date} date - Datum att ladda tidtabell för
     * @returns {Promise<Object>} Den parsade och validerade tidtabellsdatan med utgångsstatus
     */
    async function loadTimetableForDate(configData, date) {
        try {
            const timetableFiles = determineTimetableFiles(configData, date);
            debugLog(`Laddar tidtabell för ${date.toDateString()}`, timetableFiles);
            
            if (!timetableFiles.sjo || !timetableFiles.city) {
                throw new Error('Kunde inte bestämma tidtabellsfiler för angivet datum');
            }

            // Ladda båda JSON-filerna med cache-busting för att säkerställa färsk data
            const [sjoResponse, cityResponse] = await Promise.all([
                fetch(addCacheBuster(`./data/${timetableFiles.sjo}`)),
                fetch(addCacheBuster(`./data/${timetableFiles.city}`))
            ]);
            
            if (!sjoResponse.ok || !cityResponse.ok) {
                throw new Error(`HTTP error! status: ${sjoResponse.status} / ${cityResponse.status}`);
            }

            const sjoData = await sjoResponse.json();
            const cityData = await cityResponse.json();

            // Lägg till dagstypen till metadata för referens
            sjoData._loadedForDate = date.toISOString();
            cityData._loadedForDate = date.toISOString();

            // Extrahera "Endast avstigning"-informationen för både till och från city
            const disembarkOnlyToCity = extractDisembarkOnlyTimes(cityData, 'to_city');
            const disembarkOnlyFromCity = extractDisembarkOnlyTimes(cityData, 'from_city');

            debugLog(`Tidtabellsdata laddad för ${date.toDateString()}`);
            
            return {
                sjo: sjoData,
                city: cityData,
                disembarkOnly: {
                    toCity: disembarkOnlyToCity || {},
                    fromCity: disembarkOnlyFromCity || {}
                },
                isExpired: {
                    sjo: timetableFiles.sjoExpired,
                    city: timetableFiles.cityExpired
                },
                expiryDate: {
                    sjo: timetableFiles.sjoExpiryDate,
                    city: timetableFiles.cityExpiryDate
                }
            };
        } catch (error) {
            console.error(`Fel vid laddning av tidtabell för ${date.toDateString()}:`, error);
            return null;
        }
    }

    /**
     * Visar uppdateringsbanner i appen om en ny version är tillgänglig
     */
    function showUpdateBanner() {
        if (isAppUpdated) {
            const appElement = document.getElementById('app');
            if (appElement) {
                const banner = document.createElement('div');
                banner.className = 'update-banner';
                banner.setAttribute('role', 'alert');
                
                const content = document.createElement('div');
                content.className = 'update-banner-content';
                
                const message = document.createElement('span');
                message.textContent = `Ny version (${config.version}) är installerad!`;
                
                content.appendChild(message);
                banner.appendChild(content);
                
                // Lägg till i början av appen
                if (appElement.firstChild) {
                    appElement.insertBefore(banner, appElement.firstChild);
                } else {
                    appElement.appendChild(banner);
                }
                
                // Ta bort bannern efter 10 sekunder
                setTimeout(() => {
                    banner.style.opacity = '0';
                    setTimeout(() => {
                        banner.remove();
                    }, 500);
                }, 10000);
                
                // Återställ flaggan
                isAppUpdated = false;
            }
        }
    }

    /**
     * Uppdaterar visningen med aktuell tidtabellsinformation
     * @param {boolean} forceUpdate - Tvinga uppdatering även om timerna inte har ändrats
     */
    function updateDisplay(forceUpdate = false) {
        const appElement = document.getElementById('app');
        if (!appElement) {
            console.error('App-behållare hittades inte');
            return;
        }

        const now = new Date();
        
        // Bara uppdatera om det har gått en minut sedan senaste uppdatering eller om forceUpdate är true
        if (!forceUpdate && timetableData.lastRefresh && 
            (now.getTime() - timetableData.lastRefresh.getTime() < 60000)) {
            return;
        }

        // Uppdatera senaste uppdateringstidpunkt
        timetableData.lastRefresh = now;
        
        appElement.innerHTML = '';
        const wrapper = renderer.createWrapper();

        // Visa uppdateringsbanner om applikationen nyligen har uppdaterats
        showUpdateBanner();

        if (!timetableData.today || !timetableData.today.sjo || !timetableData.today.city) {
            handleError(null, 'Ingen tidtabellsdata tillgänglig');
            return;
        }

        try {
            debugLog('Uppdaterar visning...');
            
            // Lägg till tidtabellsgiltighetsinfo
            addValidityInfo(wrapper);
            
            // Först rendera tidtabeller
            renderTimetables(wrapper);
            
            // Lägg sedan till inställningsknapp om inte i inbäddat läge
            if (!isEmbedded()) {
                addSettingsButton(wrapper);
            }
            
            renderer.setupOverflowObservers(wrapper);
            appElement.appendChild(wrapper);
            debugLog('Visningsuppdatering komplett');
        } catch (error) {
            handleError(error, 'Fel vid uppdatering av display');
        }
    }

    /**
     * Kontrollerar om appen körs i inbäddat läge
     * @returns {boolean} Sant om appen är inbäddad
     */
    function isEmbedded() {
        return window.location.search.includes('embedded=true');
    }

    /**
     * Lägger till inställningsknapp som öppnar inställningspanelen
     * @param {HTMLElement} wrapper - Behållarelementet
     */
    function addSettingsButton(wrapper) {
        const settingsButton = document.createElement('div');
        settingsButton.className = 'settings-button';
        settingsButton.setAttribute('role', 'button');
        settingsButton.setAttribute('tabindex', '0');
        settingsButton.setAttribute('aria-label', 'Öppna inställningar');
        
        const hamburgerIcon = document.createElement('span');
        hamburgerIcon.className = 'hamburger-icon';
        hamburgerIcon.innerHTML = '&#9776;'; // Unicode för hamburger-ikon
        
        const buttonText = document.createElement('span');
        buttonText.className = 'settings-button-text';
        buttonText.textContent = 'Inställningar';
        
        settingsButton.appendChild(hamburgerIcon);
        settingsButton.appendChild(buttonText);
        
        settingsButton.addEventListener('click', () => {
            openSettingsPanel();
        });
        
        settingsButton.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                openSettingsPanel();
                e.preventDefault();
            }
        });
        
        wrapper.appendChild(settingsButton);
    }
    
    /**
     * Öppnar inställningspanelen
     */
    function openSettingsPanel() {
        // Om panelen redan finns, ta bort den först
        if (settingsPanel) {
            settingsPanel.remove();
            settingsPanel = null;
            return;
        }
        
        // Skapa inställningspanelen
        settingsPanel = document.createElement('div');
        settingsPanel.className = 'settings-panel';
        settingsPanel.setAttribute('role', 'dialog');
        settingsPanel.setAttribute('aria-labelledby', 'settings-title');
        
        // Panelrubrik
        const panelHeader = document.createElement('div');
        panelHeader.className = 'settings-header';
        
        const panelTitle = document.createElement('h2');
        panelTitle.id = 'settings-title';
        panelTitle.textContent = 'Inställningar';
        
        const closeButton = document.createElement('button');
        closeButton.className = 'settings-close-button';
        closeButton.innerHTML = '&times;'; // × symbol
        closeButton.setAttribute('aria-label', 'Stäng inställningar');
        closeButton.addEventListener('click', () => {
            closeSettingsPanel();
        });
        
        panelHeader.appendChild(panelTitle);
        panelHeader.appendChild(closeButton);
        settingsPanel.appendChild(panelHeader);
        
        // Panelinnehåll
        const panelContent = document.createElement('div');
        panelContent.className = 'settings-content';
        
        // 1. Lägg till Tidtabellssektion
        panelContent.appendChild(createSettingsSection('Tidtabeller', [
            {
                type: 'toggle',
                id: 'sjo-toggle',
                label: 'Sjöstadstrafiken',
                checked: config.showSjostadstrafiken,
                onChange: (checked) => {
                    config.showSjostadstrafiken = checked;
                    updateDisplay(true);
                    updateURLParameter('sjo', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            },
            {
                type: 'toggle',
                id: 'emelie-toggle',
                label: 'M/S Emelie',
                checked: config.showEmelietrafiken,
                onChange: (checked) => {
                    config.showEmelietrafiken = checked;
                    
                    // Växla synlighet för riktningssektionen
                    const directionsSection = document.getElementById('emelie-directions-section');
                    if (directionsSection) {
                        directionsSection.style.display = checked ? 'block' : 'none';
                    }
                    
                    updateDisplay(true);
                    updateURLParameter('emelie', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            }
        ]));
        
        // 2. Lägg till M/S Emelie - Riktningar-sektion
        const directionsSection = createSettingsSection('M/S Emelie - Riktningar', [
            {
                type: 'toggle',
                id: 'bothdir-toggle',
                label: 'Visa båda riktningar (till/från City)',
                checked: config.showBothDirections,
                onChange: (checked) => {
                    config.showBothDirections = checked;
                    updateDisplay(true);
                    updateURLParameter('bothdir', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            }
        ]);
        directionsSection.id = 'emelie-directions-section';
        directionsSection.style.display = config.showEmelietrafiken ? 'block' : 'none';
        panelContent.appendChild(directionsSection);
        
        // 3. Lägg till Bryggval för Sjöstadstrafiken-sektion om data är tillgänglig
        if (timetableData.today && timetableData.today.sjo && timetableData.today.sjo.departures) {
            const sjoStops = Object.keys(timetableData.today.sjo.departures || {});
            if (sjoStops.length > 0) {
                panelContent.appendChild(createSettingsSection('Bryggval för Sjöstadstrafiken', [
                    {
                        type: 'select',
                        id: 'highlight-select',
                        label: 'Markera brygga:',
                        value: config.highlightStop,
                        options: sjoStops.map(stop => ({
                            value: stop,
                            text: stop
                        })),
                        onChange: (value) => {
                            config.highlightStop = value;
                            updateDisplay(true);
                            updateURLParameter('highlight', encodeURIComponent(value));
                            saveConfigToLocalStorage();
                        }
                    }
                ]));
            }
        }
        
        // 4. Lägg till Bryggval för M/S Emelie-sektion om data är tillgänglig
        if (timetableData.config && timetableData.config.city && timetableData.config.city.service_configuration) {
            const cityStops = timetableData.config.city.service_configuration.stop_sequence?.to_city || [];
            const fromCityStops = timetableData.config.city.service_configuration.stop_sequence?.from_city || [];
            
            if (cityStops.length > 0 && fromCityStops.length > 0) {
                panelContent.appendChild(createSettingsSection('Bryggval för M/S Emelie', [
                    {
                        type: 'select',
                        id: 'cityhighlight-select',
                        label: 'Till City:',
                        value: config.cityHighlightStop,
                        options: cityStops.map(stop => ({
                            value: stop,
                            text: stop
                        })),
                        onChange: (value) => {
                            config.cityHighlightStop = value;
                            updateDisplay(true);
                            updateURLParameter('cityhighlight', encodeURIComponent(value));
                            saveConfigToLocalStorage();
                        }
                    },
                    {
                        type: 'select',
                        id: 'returnstop-select',
                        label: 'Från City:',
                        value: config.cityReturnStop,
                        options: fromCityStops.map(stop => ({
                            value: stop,
                            text: stop
                        })),
                        onChange: (value) => {
                            config.cityReturnStop = value;
                            updateDisplay(true);
                            updateURLParameter('returnstop', encodeURIComponent(value));
                            saveConfigToLocalStorage();
                        }
                    }
                ]));
            }
        }
        
        // 5. Lägg till Visning-sektion med utökat intervall för avgångar
        panelContent.appendChild(createSettingsSection('Visning', [
            {
                type: 'select',
                id: 'maxdep-select',
                label: 'Antal avgångar:',
                value: config.maxVisibleDepartures,
                options: Array.from({length: 13}, (_, i) => i + 3).map(num => ({
                    value: num,
                    text: num.toString()
                })),
                onChange: (value) => {
                    const numValue = parseInt(value, 10);
                    config.maxVisibleDepartures = numValue;
                    document.documentElement.style.setProperty('--visible-departures', numValue);
                    updateDisplay(true);
                    updateURLParameter('maxdep', numValue.toString());
                    saveConfigToLocalStorage();
                }
            },
            // Lägg till inställning för "Endast avstigning"
            {
                type: 'toggle',
                id: 'disembark-toggle',
                label: 'Visa "Endast avstigning" indikator',
                checked: config.showDisembarkOnly,
                onChange: (checked) => {
                    config.showDisembarkOnly = checked;
                    updateDisplay(true);
                    updateURLParameter('disembark', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            }
        ]));
        
        // 6. Lägg till Tillgänglighet-sektion
        panelContent.appendChild(createSettingsSection('Tillgänglighet', [
            {
                type: 'toggle',
                id: 'speech-toggle',
                label: 'Talsyntes för nästa avgång',
                checked: config.showSpeechSynthesis,
                onChange: (checked) => {
                    config.showSpeechSynthesis = checked;
                    updateDisplay(true);
                    updateURLParameter('speech', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            }
        ]));
        
        // 7. Lägg till App-information sektion
        panelContent.appendChild(createSettingsSection('App-information', [
            {
                type: 'info',
                id: 'app-version-info',
                label: 'Version:',
                value: config.version
            }
        ]));
        
        settingsPanel.appendChild(panelContent);
        
        // Lägg till panelfot med stängknapp och återställningsknapp
        const panelFooter = document.createElement('div');
        panelFooter.className = 'settings-footer';
        
        // Återställningsknapp
        const resetButton = document.createElement('button');
        resetButton.className = 'settings-button-reset';
        resetButton.textContent = 'Återställ';
        resetButton.setAttribute('aria-label', 'Återställ alla inställningar till standard');
        resetButton.addEventListener('click', resetSettings);
        
        // Stängknapp
        const closeSettingsButton = document.createElement('button');
        closeSettingsButton.className = 'settings-button-close';
        closeSettingsButton.textContent = 'Stäng';
        closeSettingsButton.addEventListener('click', () => {
            closeSettingsPanel();
        });
        
        // Först lägg till återställningsknapp, sedan mellanrum, sedan stängknapp
        panelFooter.appendChild(resetButton);
        
        // Lägg till ett mellanrum för att skjuta stängknappen till höger
        const spacer = document.createElement('div');
        spacer.style.flexGrow = '1';
        panelFooter.appendChild(spacer);
        
        panelFooter.appendChild(closeSettingsButton);
        settingsPanel.appendChild(panelFooter);
        
        // Lägg till panel till dokument
        document.body.appendChild(settingsPanel);
        
        // Lägg till overlay
        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        overlay.addEventListener('click', () => {
            closeSettingsPanel();
        });
        document.body.appendChild(overlay);
        
        // Fokusera det första interaktiva elementet för tillgänglighet
        setTimeout(() => {
            const firstToggle = settingsPanel.querySelector('input[type="checkbox"], select');
            if (firstToggle) {
                firstToggle.focus();
            }
        }, 100);
        
        // Lägg till animationsklass efter en liten fördröjning för att utlösa övergång
        setTimeout(() => {
            settingsPanel.classList.add('open');
            overlay.classList.add('visible');
        }, 10);
    }
    
    /**
     * Stänger inställningspanelen
     */
    function closeSettingsPanel() {
        if (settingsPanel) {
            settingsPanel.classList.remove('open');
            
            const overlay = document.querySelector('.settings-overlay');
            if (overlay) {
                overlay.classList.remove('visible');
                setTimeout(() => {
                    overlay.remove();
                }, 300);
            }
            
            // Vänta på att animationen ska slutföras innan den tas bort från DOM
            setTimeout(() => {
                if (settingsPanel) {
                    settingsPanel.remove();
                    settingsPanel = null;
                }
            }, 300);
        }
    }
    
    /**
     * Skapar en inställningssektion med en titel och objekt
     * @param {string} title - Sektionstitel
     * @param {Array<Object>} items - Inställningsobjektskonfiguration
     * @returns {HTMLElement} Inställningssektionselementet
     */
    function createSettingsSection(title, items) {
        const section = document.createElement('div');
        section.className = 'settings-group';
        
        const sectionTitle = document.createElement('h3');
        sectionTitle.className = 'settings-group-title';
        sectionTitle.textContent = title;
        section.appendChild(sectionTitle);
        
        items.forEach(item => {
            let settingItem;
            
            if (item.type === 'toggle') {
                settingItem = createToggleSetting(item.id, item.label, item.checked, item.onChange);
            } else if (item.type === 'select') {
                settingItem = createSelectSetting(
                    item.id, 
                    item.label, 
                    item.value, 
                    item.options, 
                    item.onChange
                );
            } else if (item.type === 'info') {
                settingItem = createInfoSetting(item.id, item.label, item.value);
            }
            
            if (settingItem) {
                section.appendChild(settingItem);
            }
        });
        
        return section;
    }
    
    /**
     * Skapar ett växlingsinställningselement
     * @param {string} id - Element-ID
     * @param {string} label - Inställningsetikett
     * @param {boolean} initialState - Initialt växlingsläge
     * @param {Function} onChange - Ändringshanterare
     * @returns {HTMLElement} Växlingsinställningselementet
     */
    function createToggleSetting(id, label, initialState, onChange) {
        const container = document.createElement('div');
        container.className = 'setting-item toggle-container';
        
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = id;
        toggleInput.checked = initialState;
        toggleInput.addEventListener('change', (e) => onChange(e.target.checked));
        
        const toggleLabel = document.createElement('label');
        toggleLabel.htmlFor = id;
        toggleLabel.textContent = label;
        
        container.appendChild(toggleInput);
        container.appendChild(toggleLabel);
        return container;
    }
    
    /**
     * Skapar ett vallisteinställningselement
     * @param {string} id - Element-ID
     * @param {string} label - Inställningsetikett
     * @param {string|number} initialValue - Initialt valt värde
     * @param {Array<Object>} options - Valmöjligheter {value, text}
     * @param {Function} onChange - Ändringshanterare
     * @returns {HTMLElement} Vallisteinställningselementet
     */
    function createSelectSetting(id, label, initialValue, options, onChange) {
        const container = document.createElement('div');
        container.className = 'setting-item select-container';
        
        const selectLabel = document.createElement('label');
        selectLabel.htmlFor = id;
        selectLabel.textContent = label;
        
        const select = document.createElement('select');
        select.id = id;
        select.className = 'settings-select';
        
        options.forEach(option => {
            const optElement = document.createElement('option');
            optElement.value = option.value;
            optElement.textContent = option.text;
            
            if (option.value == initialValue) { // Lös likhetskontroll för nummer/sträng-jämförelse
                optElement.selected = true;
            }
            
            select.appendChild(optElement);
        });
        
        select.addEventListener('change', (e) => onChange(e.target.value));
        
        container.appendChild(selectLabel);
        container.appendChild(select);
        return container;
    }
    
    /**
     * Skapar ett informationselement för inställningspanelen
     * @param {string} id - Element-ID
     * @param {string} label - Etikett
     * @param {string} value - Värde att visa
     * @returns {HTMLElement} Informationselementet
     */
    function createInfoSetting(id, label, value) {
        const container = document.createElement('div');
        container.className = 'setting-item info-container';
        
        const infoLabel = document.createElement('span');
        infoLabel.className = 'info-label';
        infoLabel.textContent = label;
        
        const infoValue = document.createElement('span');
        infoValue.className = 'info-value';
        infoValue.textContent = value;
        infoValue.id = id;
        
        container.appendChild(infoLabel);
        container.appendChild(infoValue);
        return container;
    }

    /**
     * Uppdaterar en URL-parameter utan att ladda om sidan
     * @param {string} key - Parameternamn
     * @param {string} value - Parametervärde
     */
    function updateURLParameter(key, value) {
        const url = new URL(window.location);
        url.searchParams.set(key, value);
        window.history.replaceState({}, '', url);
    }

    /**
     * Lägger till tidtabellsgiltighetsinfo till visningen
     * @param {HTMLElement} wrapper - Behållarelementet
     */
    function addValidityInfo(wrapper) {
        // Använd konfigurationsdata för giltighetsinfo
        if (timetableData.config && timetableData.config.city) {
            const cityConfig = timetableData.config.city;
            
            // Hitta aktuell säsong
            const now = new Date();
            let currentSeason = null;
            
            for (const season of cityConfig.season_mapping) {
                const seasonStart = new Date(season.period.start);
                const seasonEnd = new Date(season.period.end);
                
                if (now >= seasonStart && now <= seasonEnd) {
                    currentSeason = season;
                    break;
                }
            }
            
            if (currentSeason) {
                const validFrom = new Date(currentSeason.period.start);
                const validTo = new Date(currentSeason.period.end);
                
                const infoElement = document.createElement("div");
                infoElement.className = "validity-info";
                infoElement.innerHTML = `Aktuell tidtabell gäller: ${validFrom.toLocaleDateString('sv-SE')} - ${validTo.toLocaleDateString('sv-SE')}`;
                
                wrapper.appendChild(infoElement);
            }
        }
    }

    /**
     * Renderar alla tidtabeller för aktuellt schema
     * @param {HTMLElement} wrapper - Behållarelementet
     */
    function renderTimetables(wrapper) {
        // Rendera Sjöstadstrafiken-scheman om aktiverat
        if (config.showSjostadstrafiken) {
            renderSjostadsTimetable(wrapper);
        }

        // Rendera Emelietrafiken-scheman om aktiverat
        if (config.showEmelietrafiken) {
            renderEmelieTimetables(wrapper);
        }
        
        // Om inga tidtabeller är synliga, visa ett meddelande
        if (!config.showSjostadstrafiken && !config.showEmelietrafiken) {
            const noDataMessage = document.createElement("div");
            noDataMessage.className = "notification warning";
            noDataMessage.textContent = "Inga tidtabeller valda att visa. Aktivera minst en tidtabell från inställningarna.";
            noDataMessage.setAttribute('role', 'alert');
            wrapper.appendChild(noDataMessage);
        }
    }

    /**
     * Renderar Sjöstadstrafiken-tidtabell
     * @param {HTMLElement} wrapper - Behållarelementet
     */
    function renderSjostadsTimetable(wrapper) {
        const sjoData = timetableData.today.sjo;
        const sjoTomorrow = timetableData.tomorrow.sjo;
        const isExpired = timetableData.today.isExpired.sjo;
        const expiryDate = timetableData.today.expiryDate.sjo;
        
        if (sjoData && sjoData.departures) {
            const dayTypeText = sjoData.metadata.day_type === 'weekday' ? 'Vardagar' : 'Helgtrafik';
            const processedDepartures = {};
            
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            for (const [stop, times] of Object.entries(sjoData.departures)) {
                // Skapa array med dagens tider med dagsinformation
                const todayTimes = createEnhancedTimeObjects(times, now, now);
                
                // Lägg till morgondagens tider (om vi har dem och de behövs)
                let tomorrowTimes = [];
                if (sjoTomorrow && sjoTomorrow.departures && sjoTomorrow.departures[stop]) {
                    tomorrowTimes = createEnhancedTimeObjects(sjoTomorrow.departures[stop], tomorrow, now);
                }
                
                // Kombinera båda arrayerna
                processedDepartures[stop] = timeHandler.processScheduleTimes(
                    [...todayTimes, ...tomorrowTimes], 
                    config.maxVisibleDepartures
                );
            }

            // Skicka tomt som dayTypeText för att inte visa det
            const timetable = renderer.createTimetable(
                { departures: processedDepartures },
                "Sjöstadstrafiken",
                "", // Tomt istället för dayTypeText
                config.highlightStop,
                null,  // Inga "Endast avstigning" tider för Sjöstadstrafiken idag
                null,  // Inga "Endast avstigning" tider för Sjöstadstrafiken imorgon
                isExpired,
                expiryDate
            );
            
            wrapper.appendChild(timetable);
        }
    }

    /**
     * Slår samman morgon-, lunch- och eftermiddagsavgångar för citylinjen
     * @param {Object} schedule - Schema innehållande olika tidsperioder
     * @returns {Object} Sammanslagna avgångar
     */
    function mergeCityLineDepartures(schedule) {
        const mergedDepartures = {};
        
        // Hjälpfunktion för att bearbeta avgångar
        const processDepartures = (departures) => {
            if (!departures) return;
            Object.entries(departures).forEach(([stop, times]) => {
                if (!mergedDepartures[stop]) {
                    mergedDepartures[stop] = [];
                }
                mergedDepartures[stop].push(...times);
            });
        };

        // Bearbeta morgon avgångar om de finns
        if (schedule.morning && schedule.morning.departures) {
            processDepartures(schedule.morning.departures);
        }

        // Bearbeta lunch avgångar om de finns (tillagda i vår 2025-schema)
        if (schedule.lunch && schedule.lunch.departures) {
            processDepartures(schedule.lunch.departures);
        }

        // Bearbeta eftermiddags avgångar om de finns
        if (schedule.afternoon && schedule.afternoon.departures) {
            processDepartures(schedule.afternoon.departures);
        }

        // Sortera tider för varje hållplats
        Object.keys(mergedDepartures).forEach(stop => {
            mergedDepartures[stop].sort();
        });

        return mergedDepartures;
    }

    /**
     * Renderar Emelietrafiken-tidtabeller
     * @param {HTMLElement} wrapper - Behållarelementet
     */
    function renderEmelieTimetables(wrapper) {
        const cityData = timetableData.today.city;
        const cityTomorrow = timetableData.tomorrow.city;
        const isExpired = timetableData.today.isExpired.city;
        const expiryDate = timetableData.today.expiryDate.city;
        
        if (!cityData) return;
        
        const dayTypeText = cityData.metadata.day_type === 'weekday' ? 'Vardagar' : 
                           (cityData.metadata.day_type === 'saturday' ? 'Lördagar' : 'Söndagar');
        
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // TO CITY
        if (cityData.to_city) {
            let toCityDepartures;
            
            // Hantera olika filstrukturer (ibland nästlade, ibland flata)
            if (cityData.to_city.departures) {
                // Helgstruktur i vårformat
                toCityDepartures = cityData.to_city.departures;
            } else {
                // Vardagsstruktur med morgon/eftermiddagsperioder
                toCityDepartures = mergeCityLineDepartures(cityData.to_city);
            }
            
            // Bearbeta dagens avgångar
            const processedToCity = {};
            for (const [stop, times] of Object.entries(toCityDepartures)) {
                // Skapa array med dagens tider med dagsinformation
                const todayTimes = createEnhancedTimeObjects(times, now, now);
                
                // Hämta morgondagens tider om tillgängliga
                let tomorrowTimes = [];
                if (cityTomorrow && cityTomorrow.to_city) {
                    let tomorrowDepartures;
                    
                    if (cityTomorrow.to_city.departures) {
                        tomorrowDepartures = cityTomorrow.to_city.departures;
                    } else {
                        tomorrowDepartures = mergeCityLineDepartures(cityTomorrow.to_city);
                    }
                    
                    if (tomorrowDepartures[stop]) {
                        tomorrowTimes = createEnhancedTimeObjects(tomorrowDepartures[stop], tomorrow, now);
                    }
                }
                
                // Kombinera och bearbeta
                processedToCity[stop] = timeHandler.processScheduleTimes(
                    [...todayTimes, ...tomorrowTimes], 
                    config.maxVisibleDepartures
                );
            }

            // Hämta "Endast avstigning" tider för dagens och morgondagens TO_CITY
            const disembarkOnlyToCityToday = timetableData.today.disembarkOnly?.toCity || null;
            const disembarkOnlyToCityTomorrow = timetableData.tomorrow.disembarkOnly?.toCity || null;

            // Skicka tomt som dayTypeText för att inte visa det
            const toCityTable = renderer.createTimetable(
                { 
                    departures: processedToCity,
                    metadata: cityData.metadata  // Lägg till metadata här!
                },
                "M/S Emelie → City",
                "", // Tomt istället för dayTypeText
                config.cityHighlightStop,
                disembarkOnlyToCityToday,    // Dagens "Endast avstigning" tider för TO_CITY
                disembarkOnlyToCityTomorrow, // Morgondagens "Endast avstigning" tider för TO_CITY
                isExpired,
                expiryDate
            );
            
            wrapper.appendChild(toCityTable);
        }

        // FROM CITY (om aktiverat)
        if (config.showBothDirections && cityData.from_city) {
            let fromCityDepartures;
            
            // Hantera olika filstrukturer
            if (cityData.from_city.departures) {
                // Helgstruktur i vårformat
                fromCityDepartures = cityData.from_city.departures;
            } else {
                // Vardagsstruktur med morgon/eftermiddagsperioder
                fromCityDepartures = mergeCityLineDepartures(cityData.from_city);
            }
            
            // Bearbeta dagens och morgondagens avgångar
            const processedFromCity = {};
            for (const [stop, times] of Object.entries(fromCityDepartures)) {
                // Skapa array med dagens tider med dagsinformation
                const todayTimes = createEnhancedTimeObjects(times, now, now);
                
                // Hämta morgondagens tider om tillgängliga
                let tomorrowTimes = [];
                if (cityTomorrow && cityTomorrow.from_city) {
                    let tomorrowDepartures;
                    
                    if (cityTomorrow.from_city.departures) {
                        tomorrowDepartures = cityTomorrow.from_city.departures;
                    } else {
                        tomorrowDepartures = mergeCityLineDepartures(cityTomorrow.from_city);
                    }
                    
                    if (tomorrowDepartures[stop]) {
                        tomorrowTimes = createEnhancedTimeObjects(tomorrowDepartures[stop], tomorrow, now);
                    }
                }
                
                // Kombinera och bearbeta
                processedFromCity[stop] = timeHandler.processScheduleTimes(
                    [...todayTimes, ...tomorrowTimes], 
                    config.maxVisibleDepartures
                );
            }

            // Hämta "Endast avstigning" tider för både dagens och morgondagens FROM_CITY
            const disembarkOnlyFromCityToday = timetableData.today.disembarkOnly?.fromCity || null;
            const disembarkOnlyFromCityTomorrow = timetableData.tomorrow.disembarkOnly?.fromCity || null;

            // Skicka tomt som dayTypeText för att inte visa det
            const fromCityTable = renderer.createTimetable(
                { 
                    departures: processedFromCity,
                    metadata: cityData.metadata  // Lägg till metadata här!
                },
                "M/S Emelie ← City",
                "", // Tomt istället för dayTypeText
                config.cityReturnStop,
                disembarkOnlyFromCityToday,     // Dagens "Endast avstigning" tider för FROM_CITY
                disembarkOnlyFromCityTomorrow,  // Morgondagens "Endast avstigning" tider för FROM_CITY
                isExpired,
                expiryDate
            );
            
            wrapper.appendChild(fromCityTable);
        }
    }

    /**
     * Hanterar och visar fel för användaren
     * @param {Error} error - Felobjektet
     * @param {string} message - Användarvänligt felmeddelande
     */
    function handleError(error, message) {
        console.error('Applikationsfel:', error);
        const appElement = document.getElementById('app');
        const wrapper = renderer.createWrapper();
        wrapper.innerHTML = `
            <div class="notification error" role="alert">
                ${message}
            </div>
        `;
        appElement.appendChild(wrapper);
    }

    /**
     * Kontrollerar om det är ett nytt dygn och laddar i så fall om tidtabellen
     */
    function checkForMidnight() {
        const now = new Date();
        
        // Om vi inte har någon tidigare laddad data, eller om det är ett nytt dygn
        if (!timetableData.today || !timetableData.today.sjo || !timetableData.today.city ||
            new Date(timetableData.today.sjo._loadedForDate).getDate() !== now.getDate()) {
            
            debugLog('Nytt dygn detekterat, laddar om tidtabellsdata');
            loadAllTimetables();
        }
    }

    /**
     * Laddar om alla tidtabeller från server
     */
    async function loadAllTimetables() {
        try {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            // Om konfigurationsdata inte är laddat än, ladda det
            if (!timetableData.config.sjo || !timetableData.config.city) {
                timetableData.config = await loadConfigData();
                if (!timetableData.config) {
                    handleError(null, 'Kunde inte ladda konfigurationsdata');
                    return;
                }
            }
            
            // Ladda dagens och morgondagens tidtabeller
            const [todayData, tomorrowData] = await Promise.all([
                loadTimetableForDate(timetableData.config, now),
                loadTimetableForDate(timetableData.config, tomorrow)
            ]);
            
            if (todayData && tomorrowData) {
                timetableData.today = todayData;
                timetableData.tomorrow = tomorrowData;
                timetableData.lastUpdate = now;
                updateDisplay(true);
                
                debugLog('Tidtabellsdata laddad framgångsrikt');
            } else {
                handleError(null, 'Kunde inte ladda tidtabellsdata');
            }
        } catch (error) {
            handleError(error, 'Fel vid laddning av tidtabellsdata');
        }
    }

    /**
     * Kontrollerar efter versionsuppdateringar
     */
    async function checkForVersionUpdates() {
        try {
            const hasUpdates = await checkForUpdates();
            
            if (hasUpdates) {
                showUpdateNotification();
            }
        } catch (error) {
            console.error('Fel vid kontroll av versionsuppdateringar:', error);
        }
    }

    /**
     * Startar alla uppdateringstimers
     * - displayUpdate: Uppdaterar visningen varje minut
     * - dataRefresh: Hämtar ny data från servern var 30:e minut
     * - midnightCheck: Kontrollerar om det är ett nytt dygn varje minut
     * - versionCheck: Kontrollerar efter versionsuppdateringar varje timme
     */
    function startAllTimers() {
        // Avbryt eventuella existerande timers
        if (timers.displayUpdate) clearInterval(timers.displayUpdate);
        if (timers.dataRefresh) clearInterval(timers.dataRefresh);
        if (timers.midnightCheck) clearInterval(timers.midnightCheck);
        if (timers.versionCheck) clearInterval(timers.versionCheck);
        
        // Starta ny timer för visningsuppdatering (varje minut)
        timers.displayUpdate = setInterval(() => {
            updateDisplay();
        }, config.updateInterval);
        
        // Starta ny timer för datahämtning (var 30:e minut)
        timers.dataRefresh = setInterval(() => {
            loadAllTimetables();
        }, config.dataRefreshInterval);
        
        // Starta ny timer för midnattskontroll (varje minut)
        timers.midnightCheck = setInterval(() => {
            checkForMidnight();
        }, config.midnightCheckInterval);
        
        // Starta ny timer för versionskontroll (varje timme)
        timers.versionCheck = setInterval(() => {
            checkForVersionUpdates();
        }, config.versionCheckInterval);
    }

    // Initialisera applikationen
    async function initialize() {
        try {
            debugLog('Initialiserar applikation...');
            
            // Ladda konfigurationsdata
            timetableData.config = await loadConfigData();
            
            if (!timetableData.config) {
                handleError(null, 'Kunde inte ladda konfigurationsdata');
                return;
            }
            
            // Ladda dagens och morgondagens tidtabeller
            await loadAllTimetables();
            
            // Starta periodiska uppdateringar
            startAllTimers();
            
            // Kontrollera efter versionsuppdateringar
            checkForVersionUpdates();
            
            // Lyssna på online/offline händelser för att hantera nätverksförändringar
            window.addEventListener('online', () => {
                debugLog('Nätverk tillgängligt igen, uppdaterar data...');
                loadAllTimetables();
                checkForVersionUpdates();
            });
            
            // Lyssna på visibility change för att uppdatera när användaren kommer tillbaka till sidan
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    debugLog('Sidan aktiv igen, uppdaterar display...');
                    updateDisplay(true);
                    checkForVersionUpdates();
                }
            });
            
            // Spara aktuell version till localStorage
            saveConfigToLocalStorage();
            
            debugLog('Applikationen initialiserades framgångsrikt');
        } catch (error) {
            handleError(error, 'Kunde inte starta applikationen');
        }
    }

    // Starta applikationen
    initialize();
});
