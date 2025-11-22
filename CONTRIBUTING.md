# Contributing to Mimir

Thank you for your interest in contributing to Mimir! We're excited to have you here. This project thrives on community contributions, and we welcome developers of all skill levels.

## 🌟 Ways to Contribute

There are many ways to contribute to Mimir:

- 🐛 **Report bugs** - Help us identify and fix issues
- 💡 **Suggest features** - Share ideas for improvements
- 📝 **Improve documentation** - Help others understand Mimir better
- 🔧 **Submit code** - Fix bugs or implement new features
- 🧪 **Write tests** - Improve code coverage and reliability
- 💬 **Help others** - Answer questions in discussions and issues
- 🎨 **Improve UI/UX** - Enhance the frontend experience

Every contribution matters, no matter how small!

## 🚀 Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/Mimir.git
cd Mimir
```

### 2. Set Up Your Environment

```bash
# Install dependencies
npm install

# Copy environment template
cp env.example .env

# Start services
npm run start

# Build the project
npm run build
```

### 3. Create a Branch

```bash
# Create a descriptive branch name
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

## 📋 Contribution Guidelines

### Before You Start

1. **Check existing issues** - Someone might already be working on it
2. **Open an issue first** - For major changes, discuss your approach before coding
3. **Keep changes focused** - One feature or fix per pull request
4. **Read the docs** - Familiarize yourself with the codebase structure

### Code Style

We use TypeScript and follow standard conventions. The project includes:

- **ESLint** - Linting (run `npm run lint` if configured)
- **TypeScript** - Type checking (`npm run build` checks types)
- **Prettier** - Code formatting (recommended in your editor)

**Don't worry about perfect style** - we're here to help! Focus on functionality first, and we'll work together on polish during code review.

### Writing Good Commits

Use clear, descriptive commit messages:

```bash
# Good examples:
git commit -m "Add vector search to file indexing"
git commit -m "Fix memory leak in Neo4j connection pool"
git commit -m "Update README with Docker setup instructions"

# Less helpful:
git commit -m "fix bug"
git commit -m "update"
```

**Tip:** Describe *what* and *why*, not *how* (the code shows how).

### Testing

We use Vitest for testing. Please:

- ✅ Run existing tests: `npm test`
- ✅ Add tests for new features when possible
- ✅ Ensure tests pass before submitting

**New to testing?** That's okay! Submit your PR and mention it - we can help add tests together.

### Documentation

If your change affects how users interact with Mimir:

- Update relevant documentation in `docs/`
- Update the README if needed
- Add code comments for complex logic

## 🔄 Submitting a Pull Request

### 1. Push Your Changes

```bash
git push origin feature/your-feature-name
```

### 2. Open a Pull Request

Go to GitHub and open a PR from your branch. Include:

- **Clear title** - Summarize the change
- **Description** - Explain what and why
- **Related issues** - Link to relevant issues (e.g., "Fixes #123")
- **Testing notes** - How you tested the change
- **Screenshots** - For UI changes

### 3. Code Review Process

- A maintainer will review your PR (usually within a few days)
- We may suggest changes - this is normal and helps improve the code!
- Make requested changes by pushing new commits to your branch
- Once approved, we'll merge your contribution 🎉

**Remember:** Code review is a conversation, not a judgment. We're all learning together!

## 🐛 Reporting Bugs

Found a bug? Help us fix it!

### Before Reporting

1. Check if it's already reported in [Issues](https://github.com/orneryd/Mimir/issues)
2. Try to reproduce it with the latest version
3. Gather relevant information (logs, screenshots, steps to reproduce)

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what's wrong.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What should happen instead.

**Environment**
- OS: [e.g., macOS 14.0]
- Node version: [e.g., 18.17.0]
- Docker version: [e.g., 24.0.0]
- Mimir version: [e.g., 1.0.0]

**Additional context**
Logs, screenshots, or other helpful information.
```

## 💡 Suggesting Features

Have an idea? We'd love to hear it!

### Feature Request Template

```markdown
**Problem Statement**
What problem does this solve? Who benefits?

**Proposed Solution**
Describe your idea for solving it.

**Alternatives Considered**
Other approaches you've thought about.

**Additional Context**
Mockups, examples, or related features.
```

## 🏗️ Development Tips

### Project Structure

```
Mimir/
├── src/              # Core server code
│   ├── managers/     # Business logic
│   ├── tools/        # MCP tool implementations
│   └── orchestrator/ # Multi-agent system
├── frontend/         # React web UI
├── vscode-extension/ # VSCode extension
├── testing/          # Test files
├── docs/             # Documentation
└── scripts/          # Helper scripts
```

### Useful Commands

```bash
# Development
npm run dev              # Start with hot reload
npm run build           # Compile TypeScript
npm test                # Run tests
npm run test:coverage   # Test coverage report

# Docker
npm run start           # Start all services
npm run stop            # Stop all services
npm run logs            # View logs
npm run status          # Check service status

# Database
npm run db:cleanup-edges  # Clean duplicate edges
```

### Working with Neo4j

```bash
# Access Neo4j Browser
open http://localhost:7474

# Default credentials
# Username: neo4j
# Password: password
```

### Debugging

- Enable verbose logging in `.env`: `LOG_LEVEL=debug`
- Check Docker logs: `docker compose logs -f mimir-server`
- Use VSCode debugger (launch configs included)

## 🤝 Community Guidelines

We're committed to providing a welcoming and inclusive environment:

- **Be respectful** - Treat everyone with kindness
- **Be patient** - We're all learning
- **Be constructive** - Focus on solutions, not problems
- **Be collaborative** - We succeed together

## 📞 Getting Help

Stuck? Need guidance? We're here to help!

- 💬 **GitHub Discussions** - Ask questions, share ideas
- 🐛 **GitHub Issues** - Report bugs, request features
- 📖 **Documentation** - Check `docs/` for guides

**Don't hesitate to ask questions!** There are no "dumb" questions. If something is unclear, it's an opportunity to improve our documentation.

## 🎯 Good First Issues

New to the project? Look for issues labeled:

- `good first issue` - Great for newcomers
- `documentation` - Improve docs
- `help wanted` - We'd love assistance

## 📜 License

By contributing, you agree that your contributions will be licensed under the same [MIT License](LICENSE) that covers this project.

## 🙏 Recognition

All contributors are recognized in our [Contributors](https://github.com/orneryd/Mimir/graphs/contributors) page. Thank you for making Mimir better!

---

## Quick Checklist

Before submitting your PR, verify:

- [ ] Code builds successfully (`npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] Documentation updated if needed
- [ ] Commit messages are clear
- [ ] PR description explains the change
- [ ] Branch is up to date with main

**Remember:** It's okay if you can't check all boxes! Submit your PR and we'll help you get there.

---

**Thank you for contributing to Mimir! Your efforts help make this project better for everyone.** 🚀
