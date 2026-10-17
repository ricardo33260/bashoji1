/** Conversion kana (hiragana / katakana) → rōmaji (Hepburn simplifié). */

const DIGRAPHS: Record<string, string> = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  じゃ: "ja", じゅ: "ju", じょ: "jo",
  ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo",
  びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo",
  うぃ: "wi", うぇ: "we", ヴぁ: "va",
  てぃ: "ti", でぃ: "di", とぅ: "tu", どぅ: "du",
  しぇ: "she", ちぇ: "che", じぇ: "je",
};

const MONO: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
  ゃ: "ya", ゅ: "yu", ょ: "yo", ゔ: "vu",
};

/** Katakana → hiragana (même bloc Unicode, décalage de 0x60). */
function toHiragana(input: string): string {
  return input.replace(/[\u30a1-\u30f6]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
}

/** Convertit une lecture kana en rōmaji. Gère ー, っ et le point de séparation okurigana. */
export function toRomaji(reading: string): string {
  const src = toHiragana(reading);
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const pair = src.slice(i, i + 2);
    if (DIGRAPHS[pair]) {
      out += DIGRAPHS[pair];
      i++;
      continue;
    }
    const c = src[i]!;
    if (c === "っ") {
      const next = src.slice(i + 1, i + 3);
      const romaji = DIGRAPHS[next] ?? MONO[src[i + 1] ?? ""] ?? "";
      if (romaji) out += romaji[0] === "c" ? "t" : romaji[0];
      continue;
    }
    if (c === "ー") {
      out += out.slice(-1);
      continue;
    }
    if (c === "." || c === "・" || c === "-") {
      out += "-";
      continue;
    }
    out += MONO[c] ?? c;
  }
  return out;
}

/** Ne conserve que la partie lisible d'une lecture (avant le point d'okurigana). */
export function readingStem(reading: string): string {
  return reading.split(/[.．・]/)[0] ?? reading;
}
