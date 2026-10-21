/**
 * i18n configuration for ShebaShathi BD.
 *
 * One translation instance shared across the whole app. The active language
 * is driven by the shared persisted language state (see lib/language.ts); this
 * module only registers the resource bundles and the currency formatter.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      bn: {
        translation: require("../locales/bn.json"),
      },
      en: {
        translation: require("../locales/en.json"),
      },
    },
    lng: "bn",
    fallbackLng: "bn",
    debug: process.env.NODE_ENV === "development",
    interpolation: {
      escapeValue: false,
      format: (value, format, lang) => {
        if (format === "currency") {
          return new Intl.NumberFormat(lang === "bn" ? "bn-BD" : "en-US", {
            style: "currency",
            currency: "BDT",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(value);
        }
        return value;
      },
    },
  });

export default i18n;
