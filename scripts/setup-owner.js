import {mkdirSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../src/db.js';
import {passwordHash,requireThat} from '../src/security.js';
import {BUSINESS} from '../src/catalog.js';
const rl=createInterface({input:process.stdin,output:process.stdout});
try{const email=(await rl.question('Owner email: ')).trim().toLowerCase();requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Valid email required');
console.log('Set OWNER_PASSWORD in this terminal session before running setup (minimum 14 characters).');const password=process.env.OWNER_PASSWORD;requireThat(password?.length>=14,'OWNER_PASSWORD must be at least 14 characters');mkdirSync('data',{recursive:true});const db=openDatabase(process.env.DATABASE_PATH??'data/docdetailing.sqlite');requireThat(!db.prepare('SELECT 1 FROM owners').get(),'Owner already provisioned. Use a controlled recovery procedure.');db.prepare('INSERT INTO owners VALUES(?,?,?,?)').run(randomUUID(),BUSINESS,email,passwordHash(password));db.close();console.log('Owner provisioned. Clear OWNER_PASSWORD from your terminal session.');}finally{rl.close();}
