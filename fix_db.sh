#!/bin/bash
sed -i 's/class DatabaseStore {/import { IDatabaseAdapter, TransactionClient } from "\.\/db-postgres";\nclass DatabaseStore implements IDatabaseAdapter {/g' server/db.ts
