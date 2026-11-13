"use client";

import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function LangToggle() {
  const { lang, setLang } = useT();
  return (
    <Button variant="outline" size="sm" onClick={() => setLang(lang === "ur" ? "en" : "ur")}>
      {lang === "ur" ? "English" : "اردو"}
    </Button>
  );
}

/** Switch between English (123) and Urdu (۱۲۳) numerals for displayed numbers. */
export function NumeralsToggle() {
  const { numerals, setNumerals } = useT();
  return (
    <Button variant="outline" size="sm" className="num" title="Numerals" onClick={() => setNumerals(numerals === "ur" ? "en" : "ur")}>
      {numerals === "ur" ? "123" : "۱۲۳"}
    </Button>
  );
}
