// Leave room for non-ID values within D1's 100 bound parameters per statement.
export const idGroups = (ids: number[]) => {
    const groups: number[][] = []
    for (let offset = 0; offset < ids.length; offset += 80) groups.push(ids.slice(offset, offset + 80))
    return groups
}
