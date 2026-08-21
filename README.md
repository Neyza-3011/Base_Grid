# BaseGrid

> **Sistema operativo digitale e piattaforma gestionale per imprese di servizi tecnici e installazioni.**  
> *Direzione strategica: Imprese elettriche, installatori, manutenzione impianti, fotovoltaico, automazione e team sul campo.*

---

## 📌 Visione e Posizionamento

BaseGrid è un SaaS multi-tenant progettato per diventare il **sistema operativo digitale dell'impresa elettrica** e delle aziende di impianti e manutenzione tecnica.

### Target di Riferimento (Microcampo)
Il primo mercato target è rappresentato dalle **PMI italiane con circa 2–30 tecnici e operatori sul campo** operanti nei settori:
- Installazione e manutenzione elettrica (civile e industriale)
- Impianti fotovoltaici e sistemi di accumulo
- Infrastrutture di ricarica per veicoli elettrici (Wallbox)
- Automazione industriale e domotica
- Sistemi di sicurezza, videosorveglianza e allarmi
- Cablaggio strutturato e reti dati
- Manutenzione tecnica e pronto intervento

---

## 🎯 Principi di Prodotto

- **Ridurre il tempo perso dal tecnico**: interfacce rapide, compilazione guidata ed eliminazione di passaggi ridondanti sul campo.
- **Ridurre il carico amministrativo**: stop alla trascrizione manuale di rapportini cartacei, note sparse e fogli volanti.
- **Eliminare errori e dimenticanze**: tracciamento chiaro di ore, materiali utilizzati, note e autorizzazioni.
- **Migliorare il controllo economico**: piena visibilità sui costi orari, tariffe e consuntivi di commessa.
- **Collegare i dati**: workflow integrato end-to-end invece di silos o moduli scollegati.
- **UX essenziale e focalizzata**: massima usabilità anche da smartphone e tablet in cantiere, senza funzioni inutili o complessità ingiustificata.
- **Priorità ai workflow completi**: privilegiare flussi operativi solidi e deterministici rispetto alla proliferazione di schermate superflue.

---

## 🏗️ Architettura e Stack Tecnologico Reale

Il repository è strutturato come **Node.js + TypeScript Monorepo** con workspace frontend.

### Backend (`/server`)
- **Runtime**: Node.js & TypeScript
- **Framework Web**: Express 4
- **Database Relazionale**: PostgreSQL (`pg` pool nativo con transazioni atomiche e query parametrizzate)
- **Token & Session Store**: Redis (`ioredis` con script Lua atomici per token rotation, revocation e fail-closed)
- **Autenticazione**: Sessioni JWT server-authoritative, token rotation con famiglie crittografiche, cookie `HttpOnly`
- **Protezione CSRF**: Middleware di verifica doppio token (header `x-csrf-token` + cookie dedicato)
- **Password Security**: Hashing crittografico deterministico con salt univoci (`crypto.scryptSync`)
- **Test Suite**: Vitest con test di integrazione backend completi

### Frontend (`/frontend`)
- **Framework & UI**: React 19, TypeScript, Tailwind CSS v4
- **Routing & SSR**: TanStack Router, TanStack Start & Nitro Engine
- **Component System**: Radix UI primitives & Lucide Icons
- **Data Fetching**: TanStack React Query

---

## 🔐 Sicurezza e Autenticazione (Implementazione Reale)

L'architettura adotta un modello **Server-Authoritative** rigoroso:

1. **Gestione Sessioni e Token**:
   - Access token JWT a vita breve.
   - Refresh token memorizzati con hash SHA-256 e gestiti tramite token store (Redis in produzione, in-memory engine per test locali).
   - **Token Rotation & Replay Detection**: rotazione del refresh token a ogni rinnovo; in caso di riutilizzo di un token già consumato, l'intera famiglia di token della sessione viene revocata atomicamente via script Lua.
   - Refresh token veicolati esclusivamente tramite cookie sicuri `HttpOnly`, `SameSite` e flag `Secure` in produzione.

2. **Isolamento Multi-Tenant**:
   - Ogni utente e rapportino è associato in modo non modificabile a un `companyId`.
   - Controllo autorizzativo server-side su ogni endpoint API (`requireAuth`, `requireRole`, `requireSameCompanyOrAdmin`).
   - Prevenzione sistematica di vulnerabilità di tipo IDOR e privilege escalation orizzontale.

3. **Protezione CSRF e Input**:
   - Tutte le richieste che alterano lo stato (POST, PUT, PATCH, DELETE) richiedono validazione CSRF esplicita.
   - Rate limiting su endpoint critici (autenticazione, recupero credenziali).
   - Sanitizzazione centralizzata degli errori server (gli errori 500 interni mascherano stack trace e dettagli sensibili verso il client, associando un identificativo di correlazione univoco).

4. **Resilienza e Lifecycle di Processo**:
   - **Fail-Closed**: validazione bloccante all'avvio su chiavi segrete JWT, configurazioni di produzione e disponibilità database.
   - **Graceful Shutdown**: gestione dei segnali `SIGINT` e `SIGTERM` con chiusura controllata del server HTTP, terminazione del processo child SSR, e drenaggio pulito dei pool di connessione PostgreSQL e Redis.

> *Nota sul deployment attuale*: Per agevolare lo sviluppo e il test delle funzionalità core, la verifica dell'indirizzo email e i servizi dipendenti da provider email esterni sono opzionali e non vincolanti per l'avvio e l'utilizzo del SaaS.

---

## 📊 Database e Persistenza

Il backend interagisce con **PostgreSQL** mediante un adapter dedicato (`PostgresAdapter`):
- **Pool di connessioni** configurabile con supporto SSL.
- **Transazioni atomiche** esplicite (`withTransaction` con `BEGIN`, `COMMIT` e `ROLLBACK`).
- **Tabelle principali**:
  - `companies`: anagrafica azienda, tariffa oraria di default, limiti utenti, stato sottoscrizione.
  - `users`: credenziali, ruoli (`superadmin`, `admin`, `technician`), associazione tenant.
  - `reports`: rapportini di intervento, ore lavorate, ore viaggio, materiali utilizzati (JSONB), anagrafica cliente (JSONB), tecnico assegnato (JSONB), note e firma digitale in base64.
  - `auth_tokens`: token hash per flussi di autenticazione e recupero con scadenza temporale.
- **Adapter In-Memory (`DatabaseStore`)**: disponibile unicamente per lo sviluppo locale e l'esecuzione rapida dei test automatici senza database esterno. In produzione il sistema richiede obbligatoriamente PostgreSQL.

---

## 🚦 Stato Attuale del Progetto

### ✅ Funzionalità già presenti nel repository:
- Sistema completo di autenticazione, registrazione azienda, login, logout e token refresh.
- Architettura multi-tenant con ruoli operativi (`superadmin`, `admin`, `technician`).
- Creazione, elenco, consultazione e cancellazione dei rapportini di lavoro con isolamento per azienda.
- Tracciamento di ore lavoro, ore viaggio, materiali impiegati e firma cliente.
- Pannello di gestione impostazioni aziendali (tariffe orarie, dati fiscali, preferenze).
- Dashboard analitica e riassuntiva per l'amministratore dell'azienda.
- Test suite automatizzata backend con Vitest (95+ test unitari e di integrazione).

### ⏳ Pipeline di Deployment:
- **Target**: Node Web Service in ambiente containerizzato / cloud.
- **Stato**: La pipeline di produzione (bundling server CJS + build SSR Nitro) è in fase di continuo hardening e ottimizzazione.

---

## 🗺️ Direzione del Prodotto e Roadmap

L'obiettivo a medio termine è supportare l'intero ciclo di vita del lavoro dell'impresa elettrica, collegando in modo fluido e sequenziale:

$$\text{Richiesta Cliente} \longrightarrow \text{Preventivo} \longrightarrow \text{Commessa} \longrightarrow \text{Intervento} \longrightarrow \text{Tecnico sul Campo} \longrightarrow \text{Ore \& Materiali} \longrightarrow \text{Foto \& Checklist} \longrightarrow \text{Firma} \longrightarrow \text{Rapportino} \longrightarrow \text{Controllo Completezza} \longrightarrow \text{Pronto per Fatturazione}$$

### Moduli previsti nella Roadmap Futura:
- **Gestione Impianti e Asset**: registro apparati, schede tecniche, storico interventi e tracciamento via QR Code su quadri/macchinari.
- **Pianificazione & Scheduling**: calendario interventi, assegnazione squadre e ottimizzazione percorsi tecnici.
- **Manutenzione Programmata**: scadenziari periodici, rinnovi verifiche e promemoria automatici.
- **Job Complete Score**: indicatore di completezza documentale prima della chiusura dell'intervento (foto obbligatorie, firme, seriali materiali).
- **Controllo Economico di Commessa**: comparazione preventivo vs. consuntivo reale (ore e materiali effettivi).
- **Template e Checklist Tecniche**: schede di collaudo, dichiarazioni di conformità e verifiche CEI personalizzabili.
- **Gestione Avanzata Materiali & Fornitori**: listini grossisti, carichi/scarichi furgone e ordini di acquisto.
- **Portale Cliente**: consultazione storico interventi e documenti da parte del cliente finale.
- **Modalità Offline-First**: compilazione e salvataggio rapportini anche in assenza temporanea di connettività in cantiere.
- **Integrazioni e Analytics Operativi**: export verso software di fatturazione e cruscotti di marginalità oraria.

> *Nota metodologica*: L'integrazione di automazioni o modelli di intelligenza artificiale non fa parte della roadmap immediata; sarà valutata esclusivamente dopo aver consolidato un workflow operativo deterministico, affidabile e ampiamente testato sul campo.

---

## 💻 Avvio e Sviluppo Locale

### Requisiti
- **Node.js**: versione 20+ o 22+
- **PostgreSQL** e **Redis** (per l'ambiente di produzione o test completi)

### Installazione Dipendenze
```bash
npm install
```

### Esecuzione Test
```bash
npx vitest run
```

### Avvio in Sviluppo
```bash
npm run dev
```

### Build e Avvio Produzione
```bash
npm run build
npm start
```
