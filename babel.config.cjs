module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current'
      },
      // Force CommonJS modules for Jest compatibility with jest.mock()
      modules: 'commonjs'
    }]
  ]
};
