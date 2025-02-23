const buildOntology = require("./_scripts/ontology");

require('dotenv').config();

module.exports = function (el) {
  /* Passthrough Copy */
  el.setDataDeepMerge(true);

  el.on('beforeBuild', async () => {
    await buildOntology("1.0");
    await buildOntology("1.1");
  });

  return {
    templateFormats: [
      "ico",
      "njk",
      "jpg",
      "md",
      "html",
      "liquid",
      "svg",
      "png",
      "pdf",
      'gif',
      "mp4"
    ],
    markdownTemplateEngine: "liquid",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
    dir: {
      layouts: "_layouts",
    },
  };
};
