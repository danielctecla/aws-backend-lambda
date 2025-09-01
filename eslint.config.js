module.exports = {
  // Define las rutas a los archivos que ESLint debe analizar
  files: ['lambdas/*/src/**/*.js'],
  
  languageOptions: {
    ecmaVersion: 2022, // Para usar las características de ES2022
    sourceType: 'module', // Usar módulos ES6
    globals: {
      require: 'readonly',
      module: 'readonly',
      exports: 'readonly',
      console: 'readonly', // `console` solo se puede usar en modo de solo lectura
      process: 'readonly',
      Buffer: 'readonly',
      __dirname: 'readonly',
      __filename: 'readonly',
      global: 'readonly',
      setTimeout: 'readonly',
      clearTimeout: 'readonly',
      setInterval: 'readonly',
      clearInterval: 'readonly'
    }
  },

  rules: {
    // Reglas básicas
    'no-unused-vars': 'warn',
    'no-console': 'warn',
    'semi': ['error', 'always'],
    'quotes': ['error', 'single'],
    'no-undef': 'error',

    // Reglas adicionales de estilo
    'eqeqeq': 'error', // Usar `===` en lugar de `==`
    'curly': ['error', 'all'], // Obligatorio usar llaves `{}` para los bloques
    'no-magic-numbers': ['warn', 
      { 
        'ignoreArrayIndexes': true, 'ignore': [0, 1] 
      }
    ], // Evita el uso de números mágicos (números sin significado claro)
    'brace-style': ['error', '1tbs'], // Estilo de llaves: "One True Brace Style"
    
    // Reglas adicionales para producción
    'no-debugger': 'error', // No permitir el uso de `debugger`
    'no-alert': 'error', // No permitir el uso de `alert`, `confirm`, etc.
    'no-duplicate-imports': 'error', // No permitir importaciones duplicadas
    'no-empty-function': 'warn', // Muestra advertencia para funciones vacías
    'no-shadow': 'warn', // Evita la sobrecarga de nombres de variables

    // Reglas específicas para Lambda
    'consistent-return': 'error', // Asegura que todas las funciones retornen algo de forma consistente
    'callback-return': 'warn', // Asegura que se retorne la respuesta en funciones con callbacks
    'max-len': ['error', { 'code': 100 }] // Límite de 100 caracteres por línea
  }
};
