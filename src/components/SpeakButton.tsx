import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";

type Props = { text: string; label?: string };

/** Prononce un texte japonais avec la synthèse vocale du navigateur. */
export function SpeakButton({ text, label }: Props) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  if (!supported) return null;

  const speak = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 0.85;
    const jp = synth.getVoices().find((v) => v.lang.replace("_", "-").startsWith("ja"));
    if (jp) u.voice = jp;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.speak(u);
  };

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={`Écouter la prononciation${label ? ` : ${label}` : ""}`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary ${
        speaking ? "border-primary text-primary" : ""
      }`}
    >
      <Volume2 className="h-3.5 w-3.5" />
      {label ?? "Écouter"}
    </button>
  );
}
