import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
export const token=()=>randomBytes(32).toString('base64url');
export const hash=s=>createHash('sha256').update(s).digest('hex');
export function passwordHash(password){const salt=token();return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function verifyPassword(password,stored){const [salt,digest]=stored.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(digest,'hex'));}
export class Problem extends Error {constructor(status,message){super(message);this.status=status;}}
export function requireThat(ok,message,status=400){if(!ok)throw new Problem(status,message);}
export function text(value,name,max=500){requireThat(typeof value==='string'&&value.trim().length>0&&value.length<=max,`${name} is required (maximum ${max} characters)`);return value.trim();}
export function rateLimit(db,key,max,window=3600000){const now=Date.now();db.prepare('DELETE FROM rate_limits WHERE expires<?').run(now);db.prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+window);requireThat(db.prepare('SELECT count FROM rate_limits WHERE key=?').get(key).count<=max,'Too many requests. Try again later.',429);}
