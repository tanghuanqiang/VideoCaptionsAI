import i18n from "i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import {
  fallbackLng,
  getLanguageDirection,
  normalizeLanguage,
  supportedLngs,
} from "./util";

export * from "./util";

const baseUrl = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

// Bundle every source locale at build time and pass them as synchronous
// `resources`, so t() returns real strings on the first paint instead of returning
// the key and re-rendering the whole tree once HttpBackend finishes loading. That
// async swap is what remounts elements keyed off a translated value (key={t(...)})
// and breaks their mount-time effects (scroll/stack animations, layout measurement),
// leaving them flat after a reload. The preview re-imports these JSON files on every
// rebuild, so the bundled copy never goes stale.
const bundledResources = Object.fromEntries(
  Object.entries(
    import.meta.glob<Record<string, string>>("../locales/*.json", {
      eager: true,
      import: "default",
    }),
  ).map(([filePath, translation]) => {
    const code = filePath.match(/([^/]+)\.json$/)?.[1] ?? "";
    return [code, { translation }];
  }),
);

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng,
    supportedLngs,
    resources: bundledResources,
    // Treat the bundled resources as partial so bundled languages resolve
    // synchronously (no backend refetch, no re-render) while a language with no
    // bundled file still falls back to HttpBackend instead of silently showing keys.
    partialBundledLanguages: true,
    backend: { loadPath: `${baseUrl}locales/{{lng}}.json` },
    detection: {
      order: ["cookie", "navigator", "htmlTag"],
      lookupCookie: "i18next",
      caches: ["cookie"],
      // 不支持的语言归一到 fallbackLng，避免 cookie 持久化无效语言串
      // （detector 缓存的是 i18n.language，而非 resolvedLanguage）。
      convertDetectedLanguage: (l) => normalizeLanguage(l) ?? fallbackLng,
    },
    // 当前模板用 flat dotted key + 单 namespace。两个 separator 都关掉，
    // 让整个字符串作字面 key，不被切成 ns/key/subkey。
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

const syncDocumentLanguage = (lng: string) => {
  const code = normalizeLanguage(lng) ?? fallbackLng;
  document.documentElement.lang = code;
  document.documentElement.dir = getLanguageDirection(code);
};

i18n.on("initialized", () =>
  syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language),
);
i18n.on("languageChanged", syncDocumentLanguage);

export default i18n;
