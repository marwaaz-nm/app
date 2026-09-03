export const ACTIONS = [
  ['survey.create', '/records', 'Survey: Add'], ['survey.edit', '/records', 'Survey: Edit + documents'],
  ['survey.submit', '/records', 'Survey: Submit'], ['survey.approve', '/records', 'Survey: Approve / Reject'],
  ['survey.archive', '/records', 'Survey: Archive'],
  ['reference.create', '/references', 'Reference: Add'], ['reference.edit', '/references', 'Reference: Edit / Workflow'],
  ['reference.delete', '/references', 'Reference: Delete'],
  ['payment.create', '/financials', 'Payment: Add'], ['payment.edit', '/financials', 'Payment: Edit'],
  ['payment.delete', '/financials', 'Payment: Delete'], ['payment.pay_debt', '/financials', 'Payment: Pay debt'],
  ['expense.create', '/financials', 'Expense: Add'], ['expense.edit', '/financials', 'Expense: Edit'],
  ['expense.delete', '/financials', 'Expense: Delete'],
  ['transfer.create', '/transfers', 'Transfer: Add'], ['transfer.edit', '/transfers', 'Transfer: Edit'],
  ['transfer.delete', '/transfers', 'Transfer: Delete'],
  ['customer.search', '/customers', 'Customers: Search'],
  ['archive.upload', '/document-archive', 'Archive: Upload / Replace'],
  ['drive.download', '/drive-files', 'Drive: Download'],
  ['report.view', '/reports', 'Reports: View'], ['report.export', '/reports', 'Reports: Export'],
].map(([id, menu, label]) => ({ id, menu, label }));

const legacyGroups: Record<string, string[]> = {
  'reference.manage': ['reference.create', 'reference.edit', 'reference.delete'],
  'finance.manage': ['payment.create', 'payment.edit', 'payment.delete', 'payment.pay_debt', 'expense.create', 'expense.edit', 'expense.delete'],
};
export function expandActions(actions: string[]) {
  return [...new Set(actions.flatMap(action => legacyGroups[action] || [action]))];
}
export function canAction(profile: { role?: string; permitted_actions?: string[] | null; permitted_menus?: string[] | null } | null | undefined, action: string) {
  if (!profile) return false;
  if (profile.role === 'Admin' || profile.role === 'SuperAdmin') return true;
  const menu = ACTIONS.find(item => item.id === action)?.menu;
  return Boolean(menu && profile.permitted_menus?.includes(menu) && expandActions(profile.permitted_actions || []).includes(action));
}
