import { en } from '@/locales/en';
import { zhCN } from '@/locales/zh-CN';

export const catalogs = {
  'zh-CN': zhCN,
  en,
} as const;

export type SupportedLocale = keyof typeof catalogs;
export type LocaleMessages = typeof zhCN;

export const locale: LocaleMessages = zhCN;

export function getGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) {
    return locale.greetings.morning;
  }
  if (hour < 18) {
    return locale.greetings.afternoon;
  }
  return locale.greetings.evening;
}
