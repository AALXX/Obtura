import react from 'eslint-pl`u`gin-react'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
})

export default [
    {
        ignores: ['**/postcss.config.js', '**/tailwind.config.js']
    },
    ...compat.extends('eslint:recommended', 'plugin:react/recommended', 'plugin:@typescript-eslint/recommended'),
    {
        plugins: {
            react,
            '@typescript-eslint': typescriptEslint
        },

        languageOptions: {
            globals: {
                ...globals.browser
            },

            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',

            parserOptions: {
                ecmaFeatures: {
                    jsx: false
                }
            }
        },

        settings: {
            react: {
                version: 'latest'
            }
        },

        rules: {
            indent: [
                'error',
                4,
                {
                    SwitchCase: 1
                }
            ],

            'react/jsx-indent': ['error', 4],
            'react/jsx-indent-props': ['error', 4],

            'max-len': [
                'error',
                {
                    code: 350
                }
            ],

            'object-curly-spacing': ['error', 'always']
        }
    }
]
