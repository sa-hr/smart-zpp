import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    ignores: ["node_modules/"],
  },
];
