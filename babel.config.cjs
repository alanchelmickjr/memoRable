module.exports = function(api) {
  // Cache based on NODE_ENV
  api.cache.using(() => process.env.NODE_ENV);

  const isTest = process.env.NODE_ENV === 'test';

  return {
    presets: [
      ['@babel/preset-env', {
        targets: {
          node: 'current'
        },
        // Use CommonJS for Jest, preserve ES modules for Rollup
        modules: isTest ? 'commonjs' : false
      }]
    ]
  };
};
