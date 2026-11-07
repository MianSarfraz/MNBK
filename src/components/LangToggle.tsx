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
