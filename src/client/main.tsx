import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { LocaleProvider } from "./LocaleProvider";
import { readLocalePreference, messages } from "./i18n";
import "./styles.css";

const root = document.getElementById("root");
const startupLocale = readLocalePreference();
document.documentElement.lang = startupLocale;
document.title = messages[startupLocale].appName;
if (!root) throw new Error(messages[startupLocale].missingRoot);
createRoot(root).render(<LocaleProvider><ErrorBoundary><App /></ErrorBoundary></LocaleProvider>);
