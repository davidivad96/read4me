const handler = async (event) => {
  const defaultVoiceId = "Joey";
  const voiceIds = {
    es: "Conchita",
    pt: "Camila",
    fr: "Lea",
    de: "Hans",
    it: "Giorgio",
    ru: "Maxim",
    nl: "Ruben",
    nb: "Liv",
    pl: "Jacek",
    arb: "Zeina",
    cmn: "Zhiyu",
    hi: "Aditi",
    tr: "Filiz",
  };
  return voiceIds[event.LanguageCode] || defaultVoiceId;
};

export { handler };
