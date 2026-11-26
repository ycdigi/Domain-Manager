import { ElMessageBox } from 'element-plus'
import { savePromptCategory } from '../api/prompts'
import { validateCategoryName } from '../../shared/prompts'

export const createPromptCategory = async () => {
  const result = await ElMessageBox.prompt('分类名称最多 50 个字符，例如：运营、SEO、开发。', '新增分类', {
    confirmButtonText: '新增分类', cancelButtonText: '取消', inputPlaceholder: '填写分类名称',
    inputValidator: value => {
      try { validateCategoryName(value); return true }
      catch (error) { return error instanceof Error ? error.message : '分类名称无效' }
    }
  })
  const name = validateCategoryName(result.value)
  await savePromptCategory(name)
  return name
}
