# P0.9 — Backup, ripristino e release gate

## Scopo e stato delle verifiche

Questa procedura definisce i controlli minimi prima di una release di BaseGrid. Il repository contiene le migrazioni PostgreSQL `server/migrations/*.sql` e la CLI `npm run migrate`, ma questo non dimostra che il provider abbia backup automatici attivi né che un ripristino sia mai stato provato.

Prima di dichiarare P0.9 PASS, registrare evidenze reali per il provider e l'ambiente in uso. Non inserire in questo documento connection string, password, token, certificati privati o altri segreti.

## 1. Verifica del backup presso il provider

Nel pannello del provider PostgreSQL effettivamente usato in produzione:

1. Identificare il progetto/cluster e il database corretti; non dedurre il provider dal solo repository.
2. Verificare se i backup automatici o il point-in-time recovery sono inclusi nel piano corrente.
3. Registrare: stato attivo, frequenza, retention, ultima esecuzione riuscita, regione/posizione di conservazione e procedura di accesso ai backup.
4. Verificare le condizioni di ripristino e gli eventuali costi/limiti del piano. Non abilitare funzionalità a pagamento senza approvazione.
5. Se il provider non offre una copertura adeguata, definire un backup aggiuntivo controllato e protetto prima di dichiarare il gate superato.

Le impostazioni viste nel pannello sono evidenza di configurazione; un backup è considerato verificato solo dopo aver confermato che è recuperabile.

## 2. Backup logico PostgreSQL controllato

Eseguire soltanto da una macchina autorizzata, con client PostgreSQL compatibili con la versione del server. La variabile `DATABASE_URL` deve essere già disponibile nell'ambiente tramite un metodo sicuro; non scrivere il valore del segreto nella riga di comando, in uno script versionato o nei log.

Esempio di backup in formato custom:

```bash
pg_dump --format=custom --no-owner --no-acl --file "$BACKUP_FILE" "$DATABASE_URL"
```

Prima dell'esecuzione, impostare `BACKUP_FILE` a un percorso locale protetto con spazio sufficiente. Dopo il comando:

- controllare il codice di uscita e che il file non sia vuoto;
- registrare timestamp, dimensione, versione client e identificativo dell'ambiente, senza registrare credenziali;
- calcolare e conservare un checksum del file, ad esempio con `sha256sum "$BACKUP_FILE"`;
- trasferire il backup in una destinazione approvata, con accesso ristretto e cifratura appropriata;
- verificare la policy di retention e cancellare copie temporanee in modo sicuro quando non più necessarie.

Questo esempio non configura una schedulazione, una retention o una copia off-site automatica.

### Variante specifica per Supabase Free (dump SQL)

Supabase raccomanda ai progetti Free di esportare regolarmente il database con la CLI e conservare una copia off-site. Questa procedura è manuale: non crea una schedulazione né equivale ai backup gestiti da Supabase o a PITR.

Prerequisiti: Supabase CLI, Docker Desktop e client PostgreSQL compatibili installati su una macchina autorizzata. Verificare la documentazione ufficiale Supabase prima di eseguire il dump. Recuperare la connection string da **Connect** nel progetto corretto; usare normalmente il Session Pooler, salvo che la rete supporti IPv6 o sia configurato l'accesso diretto. Non incollare password o connection string in ticket, chat, repository o comandi versionati. Rendere disponibile la stringa tramite un meccanismo sicuro di gestione dei segreti, nella variabile d'ambiente `SUPABASE_DB_URL`.

Da una directory locale protetta e non versionata, eseguire i tre dump separati documentati da Supabase:

```bash
supabase db dump --db-url "$SUPABASE_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f schema.sql
supabase db dump --db-url "$SUPABASE_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

Dopo ogni comando verificare il codice di uscita e che il file atteso esista e non sia vuoto. Registrare dimensione, data, versione CLI e checksum; ad esempio:

```bash
sha256sum roles.sql schema.sql data.sql
```

Conservare i tre file e i checksum in una destinazione approvata, cifrata e accessibile solo agli autorizzati, separata dal repository e dal progetto Supabase. Verificare periodicamente che i file conservati corrispondano ai checksum. Non caricare dump reali nei log CI o negli artifact pubblici.

**Limiti da verificare prima di considerare il backup completo:** questo dump logico non è una copia integrale del progetto Supabase. Non include gli oggetti caricati tramite Storage API; il progetto dichiara attualmente Storage non utilizzato. Verificare separatamente se Supabase Auth, personalizzazioni degli schemi gestiti `auth`/`storage`, estensioni, webhook, funzioni, impostazioni o altri servizi sono utilizzati e richiedono procedure aggiuntive. Non presumere che gli utenti Auth o le impostazioni del progetto siano inclusi. Le migrazioni BaseGrid in `server/migrations/` e l'eventuale tabella `schema_migrations` devono essere controllate dopo il restore.

Per questo formato SQL, la verifica d'integrità tramite checksum e il controllo dei file non provano da soli che il database sia ripristinabile. Il test di restore deve usare un progetto/database Supabase temporaneo o un PostgreSQL isolato e una procedura `psql` coerente con i file `roles.sql`, `schema.sql` e `data.sql`; **non usare i comandi `pg_restore` della procedura generica per questi file SQL**. Non eseguire il restore su produzione.

## 3. Prova di ripristino isolata

Il ripristino deve essere effettuato su un database temporaneo/di staging dedicato, mai sul database di produzione. Prima di iniziare, verificare due volte l'endpoint e il nome del database di destinazione. Non usare una destinazione che contenga dati da conservare.

1. Creare un database vuoto e isolato presso un ambiente autorizzato, con risorse e accessi adeguati.
2. Verificare l'integrità dell'archivio e consultare il catalogo:

   ```bash
   pg_restore --list "$BACKUP_FILE"
   ```

3. Impostare `RESTORE_DATABASE_URL` esclusivamente per il database temporaneo e ripristinare senza opzioni di pulizia distruttiva:

   ```bash
   pg_restore --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" "$BACKUP_FILE"
   ```

4. Verificare il codice di uscita; controllare tabelle attese, conteggi ragionevoli, vincoli e presenza della tabella `schema_migrations`. Confrontare i dati ripristinati con l'ambito del backup senza esporre dati personali nei log.
5. Avviare i controlli applicativi in staging, usando configurazioni isolate. Non collegare staging ai Redis, cookie, segreti o endpoint di produzione.
6. Registrare data, backup utilizzato, database di destinazione, esito, errori e tempo impiegato. Eliminare il database temporaneo solo dopo aver salvato l'evidenza necessaria e aver verificato che non sia una risorsa di produzione.

Se non è possibile creare un ambiente isolato o verificare il contenuto ripristinato, il test resta UNVERIFIED e il gate non è superato.

## 4. Migrazioni e compatibilità

- Le migrazioni versionate sono in `server/migrations/`; il tracciamento usa `schema_migrations` e checksum.
- Eseguire `npm run migrate` solo contro l'ambiente esplicitamente previsto, con credenziali autorizzate e dopo aver verificato un backup recuperabile.
- Non modificare retroattivamente file di migrazione già applicati: un mismatch di checksum richiede indagine e intervento manuale.
- Verificare che il log della CLI riporti migrazioni applicate e già presenti coerenti con la versione da rilasciare.
- Non eseguire migrazioni di produzione automaticamente come parte di questa checklist. L'esecuzione in produzione richiede un'approvazione esplicita e una finestra operativa definita.

## 5. Release gate P0.9

Una release può essere autorizzata soltanto quando tutti i controlli applicabili hanno evidenza verificabile:

- [ ] CI GitHub sul commit esatto da rilasciare conclusa con `success`: lint, type-check backend/frontend, test e build.
- [ ] Revisione del diff e conferma che la PR sia stata approvata e unita secondo il processo del repository.
- [ ] Variabili di ambiente e servizi esterni verificati nel pannello reale; nessun segreto riportato nei log o nella documentazione.
- [ ] Stato delle migrazioni del database di destinazione verificato; nessun checksum mismatch noto.
- [ ] Backup automatico o controllato confermato, con timestamp e retention noti.
- [ ] Ripristino riuscito su ambiente isolato, con esito e tempo registrati.
- [ ] Endpoint `/health` raggiungibile e `/ready` restituisce `200` con PostgreSQL e Redis disponibili.
- [ ] Flusso critico post-release verificato con account e dati di test non produttivi, inclusi rapportino e PDF dove applicabile.
- [ ] Piano di rollback e responsabile della decisione identificati prima del rilascio.

Qualsiasi controllo mancante resta `UNVERIFIED`; non sostituirlo con un'ipotesi. Non dichiarare il rilascio sicuro se il backup non è recuperabile o se `/ready` non passa.

## 6. Registro evidenze

Compilare questo registro in un luogo operativo approvato (non aggiungere dettagli sensibili al repository):

| Controllo | Evidenza da registrare | Stato iniziale |
|---|---|---|
| Backup provider | Provider, policy, ultima esecuzione, retention | UNVERIFIED |
| Backup logico | Data, versione client, dimensione, checksum | UNVERIFIED |
| Restore isolato | Ambiente di destinazione, esito, durata, controlli | UNVERIFIED |
| Migrazioni | Versioni applicate e risultato CLI | UNVERIFIED |
| Readiness | Risultato di `/health` e `/ready` | UNVERIFIED |
| CI commit release | URL della run e SHA esatto | UNVERIFIED |
| Autorizzazione release | Approvazione e piano rollback | UNVERIFIED |

P0.9 può essere marcato PASS solo quando tutte le evidenze richieste sono state raccolte e revisionate. Questa documentazione, da sola, non dimostra che backup, restore o deployment cloud siano già funzionanti.
