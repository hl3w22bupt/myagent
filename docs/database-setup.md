# Database Setup Guide

## Overview

The Motia project now supports multiple database backends through a unified database interface. This allows you to choose the best database for your use case.

## Supported Backends

### SQLite (Default)
- **Best for**: Local development, testing, single-instance deployments
- **Pros**: Simple setup, no external dependencies, file-based
- **Cons**: Not suitable for concurrent writes, limited scalability

### PostgreSQL (Recommended for Production)
- **Best for**: Production environments, multi-instance deployments, high concurrency
- **Pros**: Native support for concurrent writes, ACID transactions, scalable
- **Cons**: Requires external database server

## Quick Start

### Using SQLite (Default)

No setup required! SQLite is the default backend.

```bash
npm run dev
```

The database file will be created at: `data/myagent.db`

### Using PostgreSQL

#### 1. Start PostgreSQL

**Option A: Using Docker (Recommended)**

```bash
./scripts/init-postgres.sh
```

This will:
- Start PostgreSQL in a Docker container
- Create the database
- Show the configuration needed

**Option B: Using Local PostgreSQL**

```bash
# Create database
createdb myagent

# Start PostgreSQL (if not running)
brew services start postgresql  # macOS
# or
sudo systemctl start postgresql  # Linux
```

#### 2. Configure Environment

Add to your `.env` file:

```bash
DATABASE_BACKEND=postgres
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=myagent
PG_USER=myagent
PG_PASSWORD=myagent_password
```

Or use connection string:

```bash
DATABASE_BACKEND=postgres
PG_CONNECTION_STRING=postgresql://myagent:myagent_password@localhost:5432/myagent
```

#### 3. Start the Application

```bash
npm run dev
```

The application will automatically:
- Connect to PostgreSQL
- Create the schema if it doesn't exist
- Start using PostgreSQL for all database operations

## Why PostgreSQL?

### The Problem: Race Conditions with SQLite

The project uses an event-driven architecture where multiple steps may try to update the same task simultaneously:

```
┌─────────────────────┐
│  Task Completed     │
└──────────┬──────────┘
           │
           ├─→ result-logger → update status to "completed"
           │
           └─→ output-history-tracker → update metadata
```

With SQLite's memory database mode:
1. Each DataStore instance holds a separate in-memory copy of the database
2. When instance A saves, it writes the entire database to disk
3. When instance B saves, it overwrites instance A's changes
4. Result: Lost updates, incorrect task status

### The PostgreSQL Solution

PostgreSQL handles this correctly:
1. Multiple instances share the same database server
2. Concurrent writes are serialized by the database
3. Transactions ensure ACID guarantees
4. Result: No lost updates, correct task status

## Migration Guide

### From SQLite to PostgreSQL

#### 1. Export Data from SQLite

```bash
# Dump SQLite database to JSON
node scripts/export-sqlite-to-json.js
```

#### 2. Import to PostgreSQL

```bash
# Import JSON data to PostgreSQL
node scripts/import-json-to-postgres.js
```

#### 3. Update Environment

```bash
# In .env file
DATABASE_BACKEND=postgres
```

#### 4. Restart Application

```bash
npm run dev
```

## Database Interface

All database backends implement the same interface:

```typescript
interface Database {
  // Task operations
  createTask(data: CreateTaskData): Promise<Task>;
  getTask(taskId: string): Promise<Task | null>;
  updateTask(taskId: string, updates: Partial<Task>): Promise<Task>;
  listTasks(filters?: TaskFilters): Promise<TaskList>;
  deleteTask(taskId: string): Promise<boolean>;

  // Context operations
  createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext>;
  getContext(taskId: string): Promise<TaskContext | null>;
  updateContext(taskId: string, updates: Partial<TaskContext>): Promise<void>;

  // ... more operations
}
```

## Usage

### In Application Code

```typescript
import { getDatabase } from '@/core/database';

const db = getDatabase();
await db.initialize();

const task = await db.getTask(taskId);
await db.updateTask(taskId, { status: 'completed' });
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_BACKEND` | Database backend (`sqlite` or `postgres`) | `sqlite` |
| `PG_HOST` | PostgreSQL host | `localhost` |
| `PG_PORT` | PostgreSQL port | `5432` |
| `PG_DATABASE` | PostgreSQL database name | `myagent` |
| `PG_USER` | PostgreSQL user | `postgres` |
| `PG_PASSWORD` | PostgreSQL password | `postgres` |
| `PG_CONNECTION_STRING` | PostgreSQL connection string (overrides individual params) | - |

## Performance Comparison

| Metric | SQLite | PostgreSQL |
|--------|--------|------------|
| Read Latency | ~1ms | ~2-5ms |
| Write Latency | ~5ms | ~5-10ms |
| Concurrent Writes | ❌ Race conditions | ✅ Supported |
| Scalability | Single instance | Multi-instance |
| Setup Complexity | Zero | Low (Docker) |

## Troubleshooting

### PostgreSQL Connection Issues

**Error**: `connection refused`

**Solution**:
1. Check PostgreSQL is running: `docker ps` or `brew services list`
2. Check connection details in `.env`
3. Test connection: `psql -h localhost -U myagent -d myagent`

### Schema Already Exists

**Error**: `relation "tasks" already exists`

**Solution**:
- The schema is automatically created on first run
- If you need to reset: Drop and recreate the database

### Migration Failures

**Error**: Data import failed

**Solution**:
1. Check JSON export file exists and is valid
2. Ensure PostgreSQL schema is created
3. Check logs for specific error messages

## Development

### Adding a New Database Backend

1. Create a new class implementing `Database` interface:

```typescript
// src/core/database/my-backend.ts
import { Database } from './database.interface';

export class MyBackend implements Database {
  async initialize(): Promise<void> {
    // Setup connection
  }

  async createTask(data: CreateTaskData): Promise<Task> {
    // Implementation
  }

  // ... implement other methods
}
```

2. Add to factory:

```typescript
// src/core/database/database-factory.ts
import { MyBackend } from './my-backend';

export function createDatabase(config?: DatabaseConfig): Database {
  switch (config?.backend) {
    case 'my-backend':
      return new MyBackend();
    // ...
  }
}
```

3. Update documentation

## Support

For issues or questions:
- Check the troubleshooting section above
- Review database logs in the application
- Open an issue on GitHub
