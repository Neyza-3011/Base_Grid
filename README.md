# BaseGrid

BaseGrid è una web app SaaS multi-tenant in sviluppo per imprese elettriche, installatori e aziende di manutenzione tecnica. Il repository è la fonte di verità: la presenza di una route o componente non dimostra che ogni flusso sia pronto per la produzione.

## Stato del prodotto

Le funzionalità elencate sotto sono individuate nel codice. Devono comunque essere validate end-to-end, con i ruoli reali, PostgreSQL, gestione degli errori e test pertinenti, prima di essere considerate pronte per uso commerciale.

| Area | Funzioni presenti nel repository | Limiti da non confondere |
|---|---|---|
| Accesso | Registrazione/accesso, logout, refresh sessione, verifica email, recupero/reset password | Email e Google OAuth dipendono da flag e configurazione ambiente. |
| Onboarding | Route onboarding e wizard | Il gate server-side e il salvataggio/ripresa vanno verificati per ogni ruolo. |
| Azienda | Impostazioni aziendali, dati anagrafici, tariffa oraria, note rapportino, branding/logo | Non equivale a fatturazione integrata. |
| Team | Membri, inviti, modifica ruolo/profilo, attivazione/disattivazione | I permessi reali sono quelli del backend, non quelli della UI. |
| Clienti e sedi | Ricerca, creazione/modifica, archiviazione/riattivazione, gestione sedi | Va preservata la coerenza cliente-sede-tenant. |
| Asset | Registro asset associati a cliente/sede, tipo, produttore/modello, seriale, date, stato, note, archiviazione/riattivazione | QR code e manutenzione programmata non sono dichiarati operativi qui. |
| Interventi | Creazione, elenco/dettaglio, priorità, assegnazione e transizioni di stato | Workflow e autorizzazioni richiedono verifica end-to-end. |
| Rapportini | Creazione/elenco, bozze, eliminazione autorizzata, ore, materiali, note, firma e collegamento intervento | Verificare persistenza e protezione di firme/documenti. |
| PDF | Generazione/anteprima PDF e download dal flusso rapportini | Non implica firma elettronica qualificata o conformità fiscale. |
| Completezza | Job Complete Score e controllo prima di “pronto per fatturazione” | Stato operativo interno: non emette fatture. |
| Dashboard | Vista analitica e riepiloghi | Confrontare le metriche con i dati persistiti. |
| Amministrazione | Dashboard superadmin e servizi amministrativi/lifecycle aziendale | Le azioni privilegiate richiedono autorizzazioni server-side e audit. |
| UI | Landing page, tour prodotto e componenti riutilizzabili | L'accessibilità e il supporto a tutti i dispositivi non sono certificati da questo README. |

## Route frontend rilevate

- `/` — landing/accesso.
- `/dashboard` — area applicativa e moduli operativi.
- `/onboarding` e `/wizard` — configurazione iniziale.
- `/accept-invite` — accettazione invito.
- `/verify-email` — verifica email.
- `/reset-password` — reset password.
- `/billing` — route di fatturazione; non prova che Stripe sia configurato.
- `/admin/super-dashboard` — amministrazione piattaforma.

Il routing è file-based con TanStack Router/Start. Non modificare manualmente il route tree generato.

## Workflow interventi

Nel codice sono presenti stati quali `nuovo`, `da_assegnare`, `assegnato`, `in_viaggio`, `sul_posto`, `in_lavorazione`, `in_attesa`, `completato`, `verificato`, `pronto_per_fatturazione` e `fatturato`. Le transizioni dipendono da stato, ruolo e regole server-side.

Flusso di prodotto: cliente/sede → asset → intervento → assegnazione tecnico → lavorazione → rapportino → verifica completezza → pronto per fatturazione. L'ultimo stato non crea una fattura né integra software contabili.

## Ruoli

I ruoli presenti nei tipi e nelle viste comprendono `superadmin`, `owner`, `admin`, `responsabile_tecnico`, `dispatcher`, `technician`, `commerciale`, `amministrazione` e `cliente`. Non dedurre i permessi dalla sola etichetta: ogni endpoint deve applicare autorizzazione e isolamento tenant lato server. I permessi variano per operazione; ad esempio l'eliminazione dei rapportini è più ristretta della lettura/creazione.

## Architettura

- Backend: Node.js, TypeScript, Express 4.
- Database: PostgreSQL tramite pg, pool, query parametrizzate e transazioni.
- Token/session store: Redis tramite ioredis; la produzione richiede storage persistente e non deve ricadere silenziosamente in memoria.
- Frontend: React 19, TypeScript, Tailwind CSS v4, TanStack Router/Start, Nitro SSR, TanStack React Query, Radix UI e Lucide.
- PDF: pdf-lib. Test: Vitest.

Struttura principale: `server/routes/` contiene route API; `server/services/` la logica di dominio; `server/migrations/` le migrazioni SQL; `frontend/src/routes/` le route; `frontend/src/components/dashboard/` le viste operative; `frontend/src/lib/api/` i client API.

## API backend

Le aree route presenti sono: autenticazione/sessioni (`server/routes/auth.ts`), amministrazione (`admin.ts`), azienda (`company.ts`), utenti/team (`users.ts`), clienti/sedi (`customers.ts`), asset (`assets.ts`), interventi (`interventions.ts`) e rapportini (`reports.ts`). Consultare i file route e servizi per parametri, payload, codici HTTP e permessi esatti. Questo riepilogo non è una specifica OpenAPI completa.

## Avvio locale

Requisiti: Node.js compatibile con `engines` in package.json e npm. PostgreSQL e Redis servono per i test d'integrazione e per l'esecuzione con dipendenze persistenti.

```bash
npm ci
npm run dev
```

Controlli disponibili:

```bash
npm run lint
npm run typecheck:backend
npm run typecheck:frontend
npm test
npm run build
npm run start
```

Eseguire `npm run build` prima di `npm run start`. Le variabili effettive vanno confermate nel bootstrap e nei file di deployment. Tra quelle rilevanti: `NODE_ENV`, `NODE_VERSION`, `DATABASE_URL`, `DATABASE_SSL_CA` quando richiesta dal provider, `REDIS_URL`, `JWT_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `EMAIL_VERIFICATION_ENABLED` e `GOOGLE_AUTH_ENABLED`. Non committare segreti e non disabilitare la verifica TLS.

## Test e CI

La workflow `.github/workflows/ci.yml` definisce lint, type-check backend, type-check frontend, test Vitest, build e smoke test backend con PostgreSQL e Redis. Un risultato vale soltanto per lo SHA esatto testato. La presenza dei test non dimostra che siano passati; prima del rilascio controllare ultimo SHA, log, migrazioni e flussi end-to-end. Non disabilitare controlli per ottenere CI verde.

## Deployment

- Backend Render configurato tramite `render.yaml`, con build e start del progetto, health check `/health` e readiness `/ready`.
- Frontend Vercel con root directory `frontend`; `frontend/vercel.json` configura il proxy/rewrite API.
- `autoDeploy: false` mantiene il deploy Render manuale. Non avviare un deploy di produzione senza autorizzazione.
- Database e Redis devono essere configurati nella piattaforma; non salvare credenziali nel repository.

Un deploy avviato non prova che il servizio sia sano: verificare health/readiness, smoke test e SHA distribuito.

## Limiti e roadmap

Non dichiarare completati senza codice e prove adeguate: abbonamenti/pagamenti Stripe, fatture, fatturazione elettronica, integrazioni contabili/fiscali, portale cliente, QR code, manutenzione programmata, ottimizzazione percorsi, inventario avanzato fornitori, modalità offline-first, funzionalità AI, backup/restore verificato e rilascio commerciale. Le verifiche Supabase RLS restano fuori scope fino ad autorizzazione esplicita.

Aggiornare questa pagina quando cambia il codice e descrivere soltanto comportamenti supportati da implementazione e test reali.
