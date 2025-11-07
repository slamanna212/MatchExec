import nextPlugin from "eslint-config-next";
import tseslint from "typescript-eslint";

const eslintConfig = [
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]
  },
  ...nextPlugin,
  {
    // General code quality rules for all files
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    rules: {
      // ===== Code Quality & Maintainability Rules =====
      "complexity": ["warn", 15], // Max cyclomatic complexity
      "no-var": "error", // Ban var keyword
      "prefer-const": "error", // Prefer const over let
      "no-unused-expressions": ["error", {
        allowShortCircuit: true,
        allowTernary: true
      }],
      "consistent-return": "error", // Require consistent returns
      "no-else-return": "warn", // Simplify if-else chains
      "prefer-template": "warn", // Use template strings over concatenation
      "no-nested-ternary": "warn", // Avoid deeply nested ternaries
      "no-unneeded-ternary": "error", // Simplify ternaries
      "eqeqeq": ["error", "always", { null: "ignore" }], // Require === and !==

      // ===== Console Statement Ban =====
      "no-console": "error" // Ban all console statements (exceptions below)
    }
  },
  {
    // TypeScript-specific rules (only for .ts/.tsx files)
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint.plugin
    },
    rules: {
      // ===== TypeScript Rules (Moderate Strictness) =====
      "@typescript-eslint/no-explicit-any": "warn", // Warn on 'any', don't block
      "@typescript-eslint/explicit-module-boundary-types": ["warn", {
        allowArgumentsExplicitlyTypedAsAny: true
      }], // Require return types on exported functions
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true
      }],
      "@typescript-eslint/prefer-as-const": "error",
      "@typescript-eslint/consistent-type-imports": ["warn", {
        prefer: "type-imports",
        fixStyle: "separate-type-imports"
      }],
      "@typescript-eslint/no-inferrable-types": "error",

      // ===== Naming Conventions =====
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "variable",
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "allow"
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"]
        },
        {
          selector: "typeLike",
          format: ["PascalCase"]
        },
        {
          selector: "enumMember",
          format: ["UPPER_CASE", "PascalCase"]
        }
      ]
    }
  },
  {
    // Exception: Allow console in CLI scripts, database-init, migrations, logger, and test utilities
    files: [
      "scripts/**/*.{js,ts}",
      "add-test-participants.js",
      "lib/database-init.ts",
      "migrations/**/*.{js,ts}",
      "src/lib/logger/base.ts"
    ],
    rules: {
      "no-console": "off" // Allow console in utility scripts and logger implementation
    }
  },
  {
    // Existing exception: Relaxed rules for Discord bot processes
    files: ["processes/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // Allow any in bot code
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off" // No return types required
    }
  }
];

export default eslintConfig;
