"""
PostgreSQL Schema Fetcher

Fetches all tables and their schemas from a PostgreSQL database.
"""

import os
import sys
import time
from pathlib import Path
from typing import Dict, Any, List, Optional

# Add parent lib for OutputBuilder
lib_dir = Path(__file__).parent.parent / "lib"
if lib_dir.exists():
    sys.path.insert(0, str(lib_dir))

try:
    from output_builder import OutputBuilder, ErrorInfo
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False

try:
    import psycopg2
    import psycopg2.extras
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False


def get_schema(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Fetch database schema from PostgreSQL.

    Args:
        input_data: Dictionary containing:
            - connection_string: Optional PostgreSQL connection string
            - host: Database host (default: from env or localhost)
            - port: Database port (default: from env or 5432)
            - database: Database name (default: from env)
            - user: Database user (default: from env or postgres)
            - password: Database password (default: from env or postgres)
            - schema_name: Schema to fetch (default: 'public')
            - include_system_tables: Include system tables (default: false)

    Returns:
        Dictionary with schema information in unified format
    """
    start_time = time.time()

    # Check if psycopg2 is available
    if not PSYCOPG2_AVAILABLE:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="dependency_error",
                        message="psycopg2 library is not installed",
                        retryable=False,
                        suggestions=[
                            "Install psycopg2: pip install psycopg2-binary",
                            "Or use psycopg2: pip install psycopg2"
                        ]
                    )
                ) \
                .build()
        else:
            return {
                "error": "psycopg2 library is not installed",
                "suggestions": ["pip install psycopg2-binary"]
            }

    # Extract parameters
    connection_string = input_data.get('connection_string') or os.environ.get('PG_CONNECTION_STRING')
    schema_name = input_data.get('schema_name', 'public')
    include_system_tables = input_data.get('include_system_tables', False)

    # Build connection parameters
    if connection_string:
        conn_params = {
            'dsn': connection_string
        }
    else:
        conn_params = {
            'host': input_data.get('host') or os.environ.get('PG_HOST', 'localhost'),
            'port': int(input_data.get('port') or os.environ.get('PG_PORT', '5432')),
            'database': input_data.get('database') or os.environ.get('PG_DATABASE'),
            'user': input_data.get('user') or os.environ.get('PG_USER', 'postgres'),
            'password': input_data.get('password') or os.environ.get('PG_PASSWORD', 'postgres')
        }

    # Validate database name
    if not conn_params.get('database') and not connection_string:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="validation_error",
                        message="Database name is required",
                        retryable=False,
                        suggestions=[
                            "Provide 'database' parameter",
                            "Set PG_DATABASE environment variable",
                            "Use connection_string parameter"
                        ]
                    )
                ) \
                .build()
        else:
            return {
                "error": "Database name is required",
                "suggestions": ["Provide 'database' parameter or set PG_DATABASE"]
            }

    conn = None
    cursor = None

    try:
        # Connect to database
        conn = psycopg2.connect(**conn_params)
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Get database name
        cursor.execute("SELECT current_database();")
        database_name = cursor.fetchone()['current_database']

        # Fetch all tables
        if include_system_tables:
            cursor.execute("""
                SELECT
                    table_name,
                    table_type
                FROM information_schema.tables
                WHERE table_schema = %s
                ORDER BY table_name;
            """, (schema_name,))
        else:
            cursor.execute("""
                SELECT
                    table_name,
                    table_type
                FROM information_schema.tables
                WHERE table_schema = %s
                AND table_type NOT IN ('SYSTEM TABLE', 'SYSTEM VIEW')
                ORDER BY table_name;
            """, (schema_name,))

        tables_info = cursor.fetchall()

        if not tables_info:
            if OUTPUT_BUILDER_AVAILABLE:
                return OutputBuilder() \
                    .set_result_type("json") \
                    .set_json({
                        "database": database_name,
                        "schema": schema_name,
                        "tables": [],
                        "message": f"No tables found in schema '{schema_name}'"
                    }) \
                    .add_standard_metadata("table_count", 0) \
                    .add_standard_metadata("column_count", 0) \
                    .build()
            else:
                return {
                    "database": database_name,
                    "schema": schema_name,
                    "tables": []
                }

        # Fetch schema for each table
        tables = []
        total_columns = 0

        for table_info in tables_info:
            table_name = table_info['table_name']
            table_type = table_info['table_type']

            # Get column information
            cursor.execute("""
                SELECT
                    column_name,
                    ordinal_position,
                    data_type,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_schema = %s
                AND table_name = %s
                ORDER BY ordinal_position;
            """, (schema_name, table_name))

            columns_info = cursor.fetchall()
            columns = []

            for col in columns_info:
                columns.append({
                    "column_name": col['column_name'],
                    "ordinal_position": col['ordinal_position'],
                    "data_type": col['data_type'],
                    "character_maximum_length": col['character_maximum_length'],
                    "numeric_precision": col['numeric_precision'],
                    "numeric_scale": col['numeric_scale'],
                    "is_nullable": col['is_nullable'],
                    "column_default": col['column_default'],
                    "is_primary_key": None,  # Will be filled below
                    "is_foreign_key": None   # Will be filled below
                })

            # Get primary keys
            try:
                cursor.execute("""
                    SELECT a.attname
                    FROM pg_index i
                    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                    WHERE i.indrelid = %s::regclass
                    AND i.indisprimary;
                """, (f"{schema_name}.{table_name}",))

                pk_columns = {row['attname'] for row in cursor.fetchall()}

                for col in columns:
                    col['is_primary_key'] = col['column_name'] in pk_columns
            except Exception:
                # If primary key query fails, set to False
                for col in columns:
                    col['is_primary_key'] = False

            # Get estimated row count
            try:
                cursor.execute(f"""
                    SELECT reltuples::bigint AS estimate
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relname = %s
                    AND n.nspname = %s;
                """, (table_name, schema_name))

                row_count_result = cursor.fetchone()
                row_count = row_count_result['estimate'] if row_count_result else None
            except Exception:
                row_count = None

            tables.append({
                "table_name": table_name,
                "table_type": table_type,
                "columns": columns,
                "row_count": row_count
            })

            total_columns += len(columns)

        # Build result
        result_data = {
            "database": database_name,
            "schema": schema_name,
            "tables": tables
        }

        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_result_type("json") \
                .set_json(result_data) \
                .add_standard_metadata("table_count", len(tables)) \
                .add_standard_metadata("column_count", total_columns) \
                .add_standard_metadata("schema", schema_name) \
                .add_standard_metadata("database", database_name) \
                .build()
        else:
            # Fallback format
            return result_data

    except psycopg2.OperationalError as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="connection_error",
                        message=f"Failed to connect to database: {str(e)}",
                        details=str(e),
                        retryable=True,
                        suggestions=[
                            "Check if database server is running",
                            "Verify connection parameters",
                            "Check if database exists",
                            "Verify network connectivity"
                        ]
                    )
                ) \
                .build()
        else:
            return {
                "error": f"Connection failed: {str(e)}",
                "error_type": "connection_error"
            }

    except psycopg2.Error as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="execution_error",
                        message=f"Database error: {str(e)}",
                        details=str(e),
                        retryable=False,
                        suggestions=[
                            "Check if user has required permissions",
                            "Verify schema name exists",
                            "Check database logs for more details"
                        ]
                    )
                ) \
                .build()
        else:
            return {
                "error": f"Database error: {str(e)}",
                "error_type": "execution_error"
            }

    except Exception as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=e,
                    suggestions=[
                        "Check database connection parameters",
                        "Verify database server is running",
                        "Ensure psycopg2-binary is installed"
                    ]
                ) \
                .build()
        else:
            return {
                "error": str(e),
                "error_type": "unknown_error"
            }

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# For testing
if __name__ == "__main__":
    import json
    from pathlib import Path

    # Test with environment variables
    print("Testing postgres-api-schema...")
    print("Make sure PG_DATABASE and other environment variables are set.")

    result = get_schema({
        "schema_name": "public",
        "include_system_tables": False
    })

    print(json.dumps(result, indent=2))
