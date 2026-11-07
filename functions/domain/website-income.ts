export const websiteIncomeRowsCte = `
WITH uniquely_linked_accounts AS (
    SELECT adsense_account_id
    FROM websites
    WHERE adsense_account_id IS NOT NULL
    GROUP BY adsense_account_id
    HAVING COUNT(*) = 1
), website_income_rows AS (
    SELECT id, website_id, income_month, source, currency, amount, 'website' AS origin
    FROM website_income
    UNION ALL
    SELECT NULL, w.id, i.income_month, 'AdSense', 'USD',
           CASE WHEN i.amount_usd = 0 AND i.amount <> 0 THEN i.amount ELSE i.amount_usd END,
           'adsense_account'
    FROM adsense_income i
    JOIN uniquely_linked_accounts u ON u.adsense_account_id = i.adsense_account_id
    JOIN websites w ON w.adsense_account_id = i.adsense_account_id
    WHERE NOT EXISTS (
        SELECT 1 FROM website_income wi
        WHERE wi.website_id = w.id AND wi.income_month = i.income_month AND lower(trim(wi.source)) = 'adsense' AND upper(trim(wi.currency)) = 'USD'
    )
    UNION ALL
    SELECT NULL, w.id, i.income_month, 'AdSense', 'CNY', i.amount_cny, 'adsense_account'
    FROM adsense_income i
    JOIN uniquely_linked_accounts u ON u.adsense_account_id = i.adsense_account_id
    JOIN websites w ON w.adsense_account_id = i.adsense_account_id
    WHERE i.amount_cny IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM website_income wi
          WHERE wi.website_id = w.id AND wi.income_month = i.income_month AND lower(trim(wi.source)) = 'adsense' AND upper(trim(wi.currency)) = 'CNY'
      )
)
`
