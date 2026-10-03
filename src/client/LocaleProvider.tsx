import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "../domain/locale";
import { messages, readLocalePreference, saveLocalePreference, type Messages } from "./i18n";

type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; copy: Messages };

// Independently rendered legacy components keep their established Chinese default.
const LocaleContext = createContext<LocaleContextValue>({ locale: "zh-CN", setLocale: () => {}, copy: messages["zh-CN"] });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setSelected] = useState<Locale>(readLocalePreference);
  const setLocale = (next: Locale) => { setSelected(next); saveLocalePreference(next); };
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = messages[locale].appName;
  }, [locale]);
  return <LocaleContext.Provider value={{ locale, setLocale, copy: messages[locale] }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue { return useContext(LocaleContext); }
