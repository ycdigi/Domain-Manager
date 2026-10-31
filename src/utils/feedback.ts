import { ElMessageBox } from 'element-plus'

type ConfirmOptions = Parameters<typeof ElMessageBox.confirm>[2]

export const confirmAction = (message: string, title: string, options: ConfirmOptions = {}) => ElMessageBox.confirm(message, title, {
  type: 'warning',
  confirmButtonText: '确定',
  cancelButtonText: '取消',
  ...options
})

export const isDismissed = (error: unknown) => error === 'cancel' || error === 'close'
