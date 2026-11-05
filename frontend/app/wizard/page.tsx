import { redirect } from "next/navigation";

/**
 * The legacy /wizard flow duplicated the e-Passport guide and used a second
 * checklist engine. Keep old links working, but send everyone to the canonical
 * service guide. Fees now live in the separate /fees section.
 */
export default function WizardPage() {
  redirect("/services/epassport/guide");
}
