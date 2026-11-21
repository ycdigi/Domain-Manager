/** Collect classes from templates, object bindings and literal dynamic prefixes. */
export const missingCssClasses = (css, source, externalClasses = new Set()) => {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, '')
    const names = new Set()
    for (const match of source.matchAll(/(?:class|className)\s*=\s*(["'`])([^"'`]+)\1/g)) match[2].split(/\s+/).forEach(name => names.add(name))
    for (const match of source.matchAll(/["']([A-Za-z_][\w-]*)["']\s*:/g)) names.add(match[1])
    for (const match of source.matchAll(/classList\.(?:add|remove|toggle)\([^)]*?["']([A-Za-z_][\w-]*)["']/g)) names.add(match[1])
    const prefixes = [...source.matchAll(/["']([A-Za-z_][\w-]*-)["']\s*\+/g)].map(match => match[1])
    return [...new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(match => match[1]))]
        .filter(name => !/^(el-|deep$|global$|slotted$)/.test(name) && !externalClasses.has(name) && !names.has(name) && !prefixes.some(prefix => name.startsWith(prefix)))
}
