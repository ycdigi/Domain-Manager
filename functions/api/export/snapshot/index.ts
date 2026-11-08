import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const db = context.env.DB
        const [websites, domains, websiteIncome, effort, tasks, snapshots, operations, notes, noteVersions, accounts, income, providerAccounts, resources, websiteResources, linkSources, linkSourceReviews, linkSourceReviewRuns, linkOpportunities, linkAttempts] = await Promise.all([
            db.prepare('SELECT * FROM websites ORDER BY id').all(),
            db.prepare('SELECT * FROM domains ORDER BY website_id, is_primary DESC, domain').all(),
            db.prepare('SELECT * FROM website_income ORDER BY website_id, income_month, source, currency').all(),
            db.prepare('SELECT * FROM website_effort ORDER BY website_id, week_start').all(),
            db.prepare('SELECT * FROM website_tasks ORDER BY website_id, id').all(),
            db.prepare('SELECT * FROM website_click_snapshots ORDER BY task_id, period_kind').all(),
            db.prepare('SELECT * FROM website_operations ORDER BY website_id, operation_date, id').all(),
            db.prepare('SELECT * FROM website_ai_notes ORDER BY website_id, id').all(),
            db.prepare('SELECT * FROM website_ai_note_versions ORDER BY note_id, version_no').all(),
            db.prepare('SELECT * FROM adsense_accounts ORDER BY id').all(),
            db.prepare('SELECT * FROM adsense_income ORDER BY adsense_account_id, income_month').all(),
            db.prepare('SELECT * FROM provider_accounts ORDER BY id').all(),
            db.prepare('SELECT * FROM provider_resources ORDER BY id').all(),
            db.prepare('SELECT * FROM website_resources ORDER BY website_id, id').all(),
            db.prepare('SELECT * FROM link_sources ORDER BY id').all(),
            db.prepare('SELECT * FROM link_source_reviews ORDER BY source_id').all(),
            db.prepare('SELECT * FROM link_source_review_runs ORDER BY id').all(),
            db.prepare('SELECT * FROM website_link_opportunities ORDER BY website_id, id').all(),
            db.prepare('SELECT * FROM link_attempts ORDER BY opportunity_id, id').all()
        ])
        return json({ websites: websites.results || [], domains: domains.results || [], website_income: websiteIncome.results || [], website_effort: effort.results || [], website_tasks: tasks.results || [], website_click_snapshots: snapshots.results || [], website_operations: operations.results || [], website_ai_notes: notes.results || [], website_ai_note_versions: noteVersions.results || [], adsense_accounts: accounts.results || [], adsense_income: income.results || [], provider_accounts: providerAccounts.results || [], provider_resources: resources.results || [], website_resources: websiteResources.results || [], link_sources: linkSources.results || [], link_source_reviews: linkSourceReviews.results || [], link_source_review_runs: linkSourceReviewRuns.results || [], website_link_opportunities: linkOpportunities.results || [], link_attempts: linkAttempts.results || [] })
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取导出快照失败') }
}
