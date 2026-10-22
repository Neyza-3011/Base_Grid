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
- In produzione la verifica del certificato TLS resta obbligatoria; per provider con CA privata, configurare `DATABASE_SSL_CA` con il bundle PEM attendibile. Non usare `rejectUnauthorized: false`.
- Nota Render Postgres: gli endpoint interni usano certificati self-signed e non supportano `verify-ca`/`verify-full`; in quel caso `DATABASE_SSL_CA` da solo non basta. Usare un endpoint compatibile con la verifica del nome host e mantenere la verifica del certificato attiva.
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

---

## 🚀 Architettura di Produzione & Deployment Gate

Il sistema è predisposto per un'architettura di produzione distribuita a due livelli con separazione tra frontend edge/SSR e backend API:

```text
Browser
  ↓ (HTTPS)
Vercel Edge / TanStack Start SSR (Directory: frontend)
  ↓ (/api/* rewrite via frontend/vercel.json)
Render Web Service (Node.js Express Backend)
  ├── PostgreSQL (Database relazionale con pool 'pg' nativo e transazioni atomiche)
  └── Redis / Upstash (Token store distribuito, rotazione refresh token atomica Lua)
```

### 1. Backend: Render (`render.yaml`)
- **Runtime**: Node.js `22.12.0` (o `20.19+`)
- **Blueprint**: Definito in `render.yaml` (`type: web`, `runtime: node`, `branch: main`, `autoDeploy: false`). I deploy Render non partono automaticamente a ogni push: le release vanno avviate esplicitamente.
- **Comandi**: `buildCommand: "npm ci --include=dev && npm run build"`, `startCommand: "npm run start"` (come nel `render.yaml`).
- **Health Check**: `/health` (endpoint liveness leggero senza dipendenze esterne)
- **Readiness Check**: `/ready` (verifica connettività attiva a PostgreSQL e Redis)
- **Variabili Deterministiche**:
  - `NODE_ENV=production`
  - `NODE_VERSION=22.12.0`
  - `EMAIL_VERIFICATION_ENABLED=false`
  - `GOOGLE_AUTH_ENABLED=false`

### 2. Frontend: Vercel (`frontend/`)
- **Root Directory**: `frontend`
- **Engine**: TanStack Start / Nitro SSR
- **Proxy Same-Origin**: Le chiamate frontend `/api/*` sono inoltrate al backend Render tramite la regola di rewrite esterna definita in `frontend/vercel.json`.

### ⚠️ Configurazione MANUALE (Piattaforme Esterne)

Le seguenti configurazioni **NON** sono presenti nel repository e **DEVONO** essere configurate manualmente sulle rispettive piattaforme:

1. **`frontend/vercel.json` (Rewrite Destination)**:
   - File: `frontend/vercel.json`
   - Destinazione attualmente configurata: `https://base-grid.onrender.com/api/:path*`.
   - **Azione**: verificare che `base-grid.onrender.com` coincida con l'URL effettivo del Web Service Render. Se l'URL del servizio cambia, aggiornare `frontend/vercel.json` e validare il rewrite prima del rilascio.
   - *Nota*: Vercel non esegue interpolazione di variabili d'ambiente all'interno di `vercel.json`; la destinazione deve essere un URL concreto nel file.

2. **Render Dashboard (Environment Variables / Secrets)**:
   - `JWT_SECRET`: stringa casuale ad alta entropia (minimo 32 caratteri, no placeholder).
   - `DATABASE_URL`: connection string PostgreSQL di produzione (es. Supabase, Neon, Render Postgres).
   - `DATABASE_SSL_CA` (opzionale): certificato root CA in formato PEM per il database, da impostare come variabile d’ambiente/secret solo quando il provider richiede una CA dedicata. Per Supabase, scaricare il certificato dalla sezione SSL del dashboard e copiarne il contenuto PEM; il codice supporta newline reali e sequenze letterali `\\n`. La connessione mantiene sempre `rejectUnauthorized: true`. Non aggiungere `sslrootcert`, `sslcert` o `sslkey` alla query di `DATABASE_URL`: gli override TLS in URL sono intenzionalmente rifiutati.
   - `REDIS_URL`: connection string Redis con TLS (es. `rediss://...` da Upstash).
   - `FRONTEND_URL`: URL canonico del frontend Vercel; l'URL attualmente noto è `https://basegridfront.vercel.app` (usare il dominio canonico definitivo solo dopo averlo configurato).
   - `CORS_ORIGINS`: origini HTTPS esatte del frontend, separate da virgola; per l'URL attualmente noto usare `https://basegridfront.vercel.app` se è il dominio effettivamente usato. Non inserire percorsi, `localhost` o `*` in produzione.
   - `SUPERADMIN_EMAIL`: indirizzo email del master super-admin.
   - `SUPERADMIN_PASSWORD`: password complessa (minimo 12 caratteri).
   - `SUPERADMIN_COMPANY_NAME`: (opzionale) nome dell'organizzazione master.

