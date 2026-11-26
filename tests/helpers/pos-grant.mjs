import crypto from 'node:crypto';
// Regression fixtures only. PIN setup/unlock and expiry are tested through the real API separately.
export function testPosGrant(db,userId,sessionToken) {
 const token=crypto.randomBytes(32).toString('hex');const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
 db.prepare('INSERT INTO pos_screen_grants(grant_hash,user_id,session_hash,expires_at) VALUES(?,?,?,?)').run(sha(token),userId,sha(sessionToken),Math.floor(Date.now()/1000)+3600);
 return token;
}
