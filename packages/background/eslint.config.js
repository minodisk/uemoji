module.exports = [
  ...require("../../eslint.factory.js")(__dirname),
  {
    ignores: ["eslint.config.js"],
    files: ["src/**/*.ts"],
  },
];
