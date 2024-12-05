const { FlatCompat } = require("@eslint/eslintrc");
const tsLint = require("typescript-eslint");

// const tsLint = require("@typescript-eslint/eslint-plugin");
const imp = require("eslint-plugin-import");
const unusedImports = require("eslint-plugin-unused-imports");
const deps = require("eslint-plugin-strict-dependencies");
const sonarjs = require("eslint-plugin-sonarjs");

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = (dirname) => {
  return tsLint.config(
    ...tsLint.configs.recommendedTypeChecked,
    // ...compat.extends("eslint:recommended"),
    // ...compat.extends("plugin:@typescript-eslint/recommended"),
    // ...compat.extends("plugin:import/recommended"),
    // ...compat.extends("prettier"),
    {
      languageOptions: {
        parserOptions: {
          ecmaVersion: 12,
          sourceType: "module",
          projectService: {
            allowDefaultProject: ["*.ts"],
            defaultProject: "./tsconfig.json",
          },
          tsConfigRootDir: dirname,
          // project: true,
        },
      },
      plugins: {
        // "@typescript-eslint": tsLint,
        import: imp,
        "unused-imports": unusedImports,
        "strict-dependencies": deps,
        sonarjs,
      },
      rules: {
        // Do with TypeScript
        "no-undef": "off",

        "sonarjs/no-ignored-return": "error",

        // https://github.com/typescript-eslint/typescript-eslint/issues/2063#issuecomment-675156492
        // "@typescript-eslint/ban-types": [
        //   "error",
        //   {
        //     extendDefaults: true,
        //     types: {
        //       "{}": false,
        //     },
        //   },
        // ],
        "@typescript-eslint/naming-convention": [
          "warn",
          {
            selector: "function",
            format: ["PascalCase", "camelCase"],
          },
        ],
        // "@typescript-eslint/semi": "warn",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-invalid-void-type": "error",
        "@typescript-eslint/consistent-type-imports": [
          "error",
          {
            prefer: "type-imports",
            disallowTypeAnnotations: true,
            fixStyle: "separate-type-imports",
          },
        ],

        // Use unused-imports/no-unused-vars
        "@typescript-eslint/no-unused-vars": "off",

        "no-useless-rename": "error",
        "object-shorthand": "error",

        "import/order": [
          "error",
          {
            groups: ["builtin", "external", "parent", "sibling", "index"],
            "newlines-between": "never",
            alphabetize: {
              order: "asc",
              caseInsensitive: false,
            },
          },
        ],
        "import/no-unresolved": "off",
        "unused-imports/no-unused-imports": "error",
        "unused-imports/no-unused-vars": [
          "warn",
          {
            vars: "all",
            varsIgnorePattern: "^_",
            args: "after-used",
            argsIgnorePattern: "^_",
          },
        ],
        curly: "error",
        eqeqeq: "error",
        "no-throw-literal": "warn",
        semi: "off",

        "strict-dependencies/strict-dependencies": [
          "error",
          [],
          {
            resolveRelativeImport: true,
          },
        ],
      },
    },
  );
};
