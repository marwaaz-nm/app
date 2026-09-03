import { ACTIONS, expandActions } from './permissions';
export const ACTION_MENUS: Record<string, string> = {
  ...Object.fromEntries(ACTIONS.map(action => [action.id, action.menu])),
  'survey.create': '/records', 'survey.edit': '/records', 'survey.submit': '/records',
  'survey.approve': '/records', 'survey.archive': '/records',
  'reference.manage': '/references', 'transfer.create': '/transfers',
  'finance.manage': '/financials', 'report.view': '/reports',
};

export function accountErrors(value: { fullname: unknown; username: unknown; password?: unknown }, creating: boolean) {
  const errors: Record<string, string> = {};
  if (typeof value.fullname !== 'string' || !value.fullname.trim() || value.fullname.length > 150)
    errors.fullname = 'Geli magaca oo buuxa (ugu badnaan 150 xaraf).';
  if (typeof value.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,64}$/.test(value.username.trim()))
    errors.username = 'Username: 3–64 xaraf; isticmaal xarfo, tirooyin, _, . ama -; bannaan ma bannaana.';
  if ((creating || value.password !== undefined && value.password !== '') &&
      (typeof value.password !== 'string' || value.password.length < 8 || value.password.length > 128))
    errors.password = 'Password-ku ha ahaado 8–128 xaraf. Shuruudaha server-ka ayaa sidoo kale la hubinayaa.';
  return errors;
}

export function actionsForMenus(actions: string[], menus: string[]) {
  return expandActions(actions).filter(action => Boolean(ACTION_MENUS[action]) && menus.includes(ACTION_MENUS[action]));
}
