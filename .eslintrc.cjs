/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
module.exports = {
  root: true,
  extends: ['standard-with-typescript', 'prettier', 'eslint-config-prettier'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  parserOptions: {
    project: './tsconfig.json'
  },
  ignorePatterns: ['dist', 'test'],
  rules: {
    'prettier/prettier': 'off',
    'arrow-body-style': 'off',
    'prefer-arrow-callback': 'off',
    '@typescript-eslint/consistent-type-assertions': 'off',
    '@typescript-eslint/prefer-ts-expect-error': 'off',
    '@typescript-eslint/return-await': 'off',
    '@typescript-eslint/strict-boolean-expressions': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    'no-empty-pattern': 'off'
  }
}
