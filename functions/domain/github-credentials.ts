import { legacyGithubToken } from '../../shared/github-token'
import { encryptCredential, decryptCredential } from '../utils/credentials'

export const defaultTokenWrite = async (db: D1Database, accountId: number, token: string, key?: string) => {
    const ciphertext = await encryptCredential(token, key)
    return db.prepare(`INSERT INTO provider_credentials(account_id,label,ciphertext,token_last4,is_default,status)
        VALUES (?,'默认 Token',?,?,1,'有效')
        ON CONFLICT(account_id) WHERE is_default=1 DO UPDATE SET ciphertext=excluded.ciphertext,token_last4=excluded.token_last4,status='有效',expires_at=NULL,updated_at=CURRENT_TIMESTAMP`)
        .bind(accountId, ciphertext, token.slice(-4))
}

export const migrateGithubTokens = async (db: D1Database, key?: string, accountId?: number) => {
    const accounts = (await db.prepare(`SELECT id,name,memo FROM provider_accounts WHERE provider='github'${accountId === undefined ? '' : ' AND id=?'}`)
        .bind(...(accountId === undefined ? [] : [accountId])).all<{id:number;name:string;memo:string}>()).results || []
    const conflicts: Array<{account_id:number;name:string}> = []
    let migrated = 0
    for (const account of accounts) {
        const token = legacyGithubToken(account.memo)
        if (!token) continue
        const existing = await db.prepare('SELECT ciphertext FROM provider_credentials WHERE account_id=? AND is_default=1').bind(account.id).first<{ciphertext:string}>()
        if (existing && await decryptCredential(existing.ciphertext, key) !== token) {
            conflicts.push({account_id:account.id,name:account.name}); continue
        }
        const ciphertext = existing?.ciphertext || await encryptCredential(token,key)
        const writes = []
        if (!existing) writes.push(db.prepare("INSERT INTO provider_credentials(account_id,label,ciphertext,token_last4,is_default,status) VALUES(?,'默认 Token',?,?,1,'有效') ON CONFLICT(account_id) WHERE is_default=1 DO NOTHING").bind(account.id,ciphertext,token.slice(-4)))
        writes.push(db.prepare("UPDATE provider_accounts SET memo='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND memo=? AND EXISTS(SELECT 1 FROM provider_credentials WHERE account_id=? AND is_default=1 AND ciphertext=?)").bind(account.id,account.memo,account.id,ciphertext))
        const results = await db.batch(writes)
        if (results[results.length-1].meta.changes) migrated++
        else conflicts.push({account_id:account.id,name:account.name})
    }
    return { migrated, conflicts }
}
