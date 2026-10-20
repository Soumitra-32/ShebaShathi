/**
 * i18n configuration for Next.js
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(value);
        }
        return value;
      },
    },
  });

export default i18n;
