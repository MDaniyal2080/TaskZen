module.exports = {
  root: true,
  env: {
    node: true,
    jest: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.eslint.json'],
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // Add type-checking rules later if desired:
    // 'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended',
  ],
  ignorePatterns: ['.eslintrc.cjs', 'dist/**', 'node_modules/**'],
  rules: {
    'prettier/prettier': ['warn', { endOfLine: 'auto' }],
    // So we can progressively type APIs without blocking CI
    '@typescript-eslint/no-explicit-any': 'warn',
    // Ignore unused function args/vars prefixed with _ and avoid blocking
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    // Allow empty catch blocks; warn for other empty blocks
    'no-empty': ['warn', { allowEmptyCatch: true }],
    // Many switch cases declare scoped consts; warn only
    'no-case-declarations': 'warn',
  },
};
