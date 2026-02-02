# PostgreSQL Setup for Testing

This document explains how PostgreSQL is configured for testing in both CI and local environments.

## CI Environment

In GitHub Actions, PostgreSQL is automatically configured as a service container:

- **Image**: `postgres:16-alpine`
- **Database**: `myagent_test`
- **User**: `postgres`
- **Password**: `postgres`
- **Port**: `5432`

### Environment Variables

The following environment variables are set in CI workflows:

```bash
DATABASE_BACKEND=postgres
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=myagent_test
PG_USER=postgres
PG_PASSWORD=postgres
```

## Local Development

### Option 1: Using Docker (Recommended)

Run PostgreSQL in a Docker container:

```bash
docker run -d \
  --name myagent-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=myagent_test \
  -p 5432:5432 \
  postgres:16-alpine
```

Set environment variables:

```bash
export DATABASE_BACKEND=postgres
export PG_HOST=localhost
export PG_PORT=5432
export PG_DATABASE=myagent_test
export PG_USER=postgres
export PG_PASSWORD=postgres
```

Run tests:

```bash
npm run test
```

### Option 2: Using Local PostgreSQL

If you have PostgreSQL installed locally:

```bash
# Create database
createdb myagent_test

# Set environment variables
export DATABASE_BACKEND=postgres
export PG_HOST=localhost
export PG_PORT=5432
export PG_DATABASE=myagent_test
# Use your local PostgreSQL user
export PG_USER=$USER
export PG_PASSWORD=your_password

# Run tests
npm run test
```

### Option 3: Using SQLite (Fallback)

If PostgreSQL is not available, tests will fall back to SQLite automatically:

```bash
export DATABASE_BACKEND=sqlite
# Or simply unset DATABASE_BACKEND (defaults to sqlite)

npm run test
```

**Note**: Some tests may fail with SQLite as it has different behavior than PostgreSQL.

## Stopping Docker PostgreSQL

To stop the Docker container:

```bash
docker stop myagent-postgres
docker rm myagent-postgres
```

## Troubleshooting

### Connection Refused

Make sure PostgreSQL is running:

```bash
docker ps | grep postgres
```

### Tests Fail with SQLite

Ensure `DATABASE_BACKEND=postgres` is set:

```bash
echo $DATABASE_BACKEND
```

### Port Already in Use

If you have another PostgreSQL instance running, change the port:

```bash
docker run -d --name myagent-postgres -p 5433:5432 ...
export PG_PORT=5433
```

## CI Configuration Files

The following workflows are configured with PostgreSQL:

- `.github/workflows/ci.yml` - Main CI pipeline
- `.github/workflows/pr-checks.yml` - PR checks and coverage

Both include the PostgreSQL service container and necessary environment variables.
