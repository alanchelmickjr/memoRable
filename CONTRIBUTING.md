# Contributing to memoRable

We welcome and appreciate contributions from the community! Whether you're fixing a bug, proposing a new feature, or improving documentation, your help is valuable. Thank you for your interest in contributing to memoRable.

## How to Contribute

We use GitHub Issues to track bugs and feature requests.

### Reporting Bugs

If you encounter a bug, please help us by submitting an issue to our [GitHub Issues page](https://github.com/your-repo/memoRable/issues). A good bug report should include:

*   A clear and descriptive title.
*   Steps to reproduce the bug.
*   What you expected to happen.
*   What actually happened.
*   Your environment details (e.g., OS, browser version, Node.js version).
*   Screenshots or code snippets if applicable.

### Suggesting Enhancements

If you have an idea for an enhancement or a new feature, please submit an issue to our [GitHub Issues page](https://github.com/your-repo/memoRable/issues). Please provide:

*   A clear and descriptive title.
*   A detailed description of the proposed enhancement and its benefits.
*   Any potential drawbacks or alternative solutions.
*   Mockups or examples if applicable.

### Your First Code Contribution

If you're new to contributing, look for issues tagged with "good first issue" or "help wanted." These are typically more straightforward and a great way to get started. Don't hesitate to ask questions if you need clarification.

### Pull Request Process

1.  **Fork the repository**: Create your own fork of the project on GitHub.
2.  **Clone your fork**: `git clone https://github.com/YOUR_USERNAME/memoRable.git`
3.  **Create a branch**: `git checkout -b feature/your-feature-name` or `bugfix/your-bug-fix-name`.
4.  **Make your changes**: Implement your feature or bug fix.
5.  **Test your changes**: Ensure your changes pass all existing tests and, if necessary, add new tests.
6.  **Commit your changes**: Write clear and concise commit messages. We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. For example:
    *   `feat: Add new user authentication endpoint`
    *   `fix: Correct off-by-one error in pagination`
    *   `docs: Update README with installation instructions`
7.  **Push to your fork**: `git push origin feature/your-feature-name`
8.  **Submit a Pull Request (PR)**: Open a PR from your fork's branch to the `main` branch of the original repository.
    *   Provide a clear title and description for your PR.
    *   Reference any related issues (e.g., "Closes #123").
    *   Ensure your PR passes all automated checks.
9.  **Address feedback**: Project maintainers will review your PR and may request changes. Please address any feedback promptly.

## Development Setup

Details on setting up the development environment will be added here. For now, ensure you have Node.js and pnpm installed.

You can typically install dependencies with:
```bash
pnpm install
```

And run tests with:
```bash
pnpm test
```

## Code of Conduct

This project and everyone participating in it is governed by the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct.html). By participating, you are expected to uphold this code. Please report unacceptable behavior to [project-maintainers-email@example.com](mailto:project-maintainers-email@example.com) (replace with a real contact or issue reporting mechanism).

## Style Guides

Please ensure your code adheres to the ESLint and Prettier configurations in the project.

*   **Linting**: We use ESLint for identifying and reporting on patterns in JavaScript/TypeScript.
*   **Formatting**: We use Prettier for consistent code formatting.

You can usually run the linter and formatter with:
```bash
pnpm lint
pnpm format
```

Please make sure your contributions pass linting and formatting checks before submitting a PR.