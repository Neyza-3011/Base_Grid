# Frontend routes

Il frontend usa routing file-based con TanStack Router/Start. I file route sono in questa directory; le viste operative principali sono componenti sotto `src/components/dashboard/` e vengono orchestrate dall'area dashboard.

## Route rilevate nel repository

| File | URL / scopo |
|---|---|
| `index.tsx` | `/` — landing/accesso |
| `dashboard.tsx` | `/dashboard` — area applicativa e moduli dashboard |
| `onboarding.tsx` | `/onboarding` — configurazione iniziale azienda |
| `wizard.tsx` | `/wizard` — flusso guidato |
| `accept-invite.tsx` | `/accept-invite` — accettazione invito team |
| `verify-email.tsx` | `/verify-email` — verifica email |
| `reset-password.tsx` | `/reset-password` — reset password |
| `billing.tsx` | `/billing` — schermata/route di fatturazione; non prova che Stripe sia configurato |
| `admin/super-dashboard.tsx` | `/admin/super-dashboard` — amministrazione piattaforma |
| `about.tsx` | `/about` — pagina informativa, se presente nel route tree generato |
| `__root.tsx` | Root layout dell'applicazione; deve preservare `<Outlet />` |

Le viste dashboard comprendono componenti per rapportini, interventi, clienti/sedi, asset, team, impostazioni aziendali e analytics. La presenza di un componente non garantisce che il relativo workflow sia verificato in produzione.

## Convenzioni

- `index.tsx` rappresenta la root del segmento.
- I segmenti dinamici seguono la sintassi TanStack Router, ad esempio `$id`.
- `__root.tsx` è il root layout e deve renderizzare `<Outlet />`.
- Il route tree generato è un artefatto automatico: non modificarlo manualmente.
- Non introdurre convenzioni di Next.js/Remix (`src/pages/`, layout app router o simili) in questo progetto.

## Regole per le modifiche

1. Verificare route, componenti, guardie auth, chiamate API e autorizzazioni server-side insieme.
2. Gestire loading, error, empty state, retry e sessione scaduta; non mostrare successo prima della conferma API.
3. Non considerare i controlli UI come confine di sicurezza: i permessi devono essere applicati anche dal backend.
4. Aggiungere o aggiornare test per nuovi comportamenti e regressioni pertinenti.
5. Aggiornare questo documento solo quando la route effettiva cambia; per l'inventario funzionale generale consultare il README principale.
