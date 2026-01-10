# GitHub Actions CI/CD Workflows

This repository uses GitHub Actions for continuous integration and automated testing.

## Workflows

### 1. **CI Workflow** (`.github/workflows/ci.yml`)

**Triggers:**

- Pull requests to `main` or `develop` branches
- Pushes to `main` or `develop` branches

**Jobs:**

#### Node.js CI

- ✅ TypeScript type checking
- ✅ ESLint linting
- ✅ Jest test execution
- ✅ Motia type generation
- ✅ Project build verification

#### Python CI

- ✅ Python 3.12 setup with `uv`
- ✅ Dependency installation via `uv`
- ✅ Pylint linting
- ✅ Mypy type checking
- ✅ Pytest execution

#### Integration Check

- ✅ Motia configuration validation
- ✅ Console.log detection
- ✅ TODO comment tracking

### 2. **PR Checks Workflow** (`.github/workflows/pr-checks.yml`)

**Triggers:**

- Pull requests (opened, synchronized, reopened)

**Jobs:**

#### Code Quality

- Prettier formatting check
- Large file detection (>1MB)
- Sensitive data pattern detection

#### TypeScript Checks

- Comprehensive TypeScript error checking
- Unused dependency detection

#### Test Coverage

- Jest coverage report generation
- Coverage threshold validation

#### Motia Checks

- Step file validation
- `motia.config.ts` verification

### 3. **Lint Workflow** (`.github/workflows/lint.yml`)

**Triggers:**

- Pull requests to `main` or `develop`
- Pushes to `main` or `develop`

**Jobs:**

- Fast ESLint check
- Quick TypeScript validation

## Status Badges

Add these badges to your README:

```markdown
![CI](https://github.com/your-username/myagent/workflows/CI/badge.svg)
![Lint](https://github.com/your-username/myagent/workflows/Lint/badge.svg)
![PR Checks](https://github.com/your-username/myagent/workflows/PR%20Checks/badge.svg)
```

## Local Testing

Before pushing, run these commands locally:

```bash
# TypeScript check
npm run build:ts

# Lint
npm run lint

# Tests
npm run test

# Python lint
npm run py:lint

# Python tests
npm run py:test
```

## CI Configuration Details

### Node.js Version

- Uses Node.js 20 (LTS)

### Python Version

- Uses Python 3.12 with `uv` package manager

### Caching

- npm dependencies are cached for faster builds
- Python virtual environment is cached

### Continue on Error

Some non-critical checks use `continue-on-error: true`:

- Pylint (warnings allowed)
- Mypy (type hints in progress)
- Coverage (enforced but doesn't block)
- File size checks (informational)

## Troubleshooting

### Common Issues

**TypeScript errors in CI:**

```bash
# Check locally
npx tsc --noEmit
```

**ESLint failures:**

```bash
# Fix automatically
npm run lint -- --fix
```

**Python import errors:**

```bash
# Reinstall with uv
rm -rf .venv
uv venv --python 3.12
uv pip install -r requirements.txt
```

### CI Environment Variables

The CI runs with these environment variables:

- `CI=true` - Enables CI mode in Jest
- Node.js 20 from GitHub Actions
- Python 3.12 from GitHub Actions

## Contributing

When contributing:

1. **Create a feature branch**
2. **Make your changes**
3. **Run local tests** (see above)
4. **Create a pull request**
5. **Wait for CI checks** to pass
6. **Address any failures**

## Future Improvements

Potential additions:

- [ ] E2E tests with Playwright
- [ ] Performance benchmarks
- [ ] Security scanning (CodeQL)
- [ ] Dependency update alerts (Dependabot)
- [ ] Deployment automation
