"""
PostgreSQL SQL Query Executor

Executes SQL queries on a PostgreSQL database and returns results as a table.
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


def execute_query(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute SQL query on PostgreSQL database.

    Args:
        input_data: Dictionary containing:
            - query: SQL query to execute (required)
            - connection_string: Optional PostgreSQL connection string
            - host: Database host (default: from env or localhost)
            - port: Database port (default: from env or 5432)
            - database: Database name (default: from env)
            - user: Database user (default: from env or postgres)
            - password: Database password (default: from env or postgres)
            - max_rows: Maximum rows to return (default: 1000, -1 for unlimited)
            - timeout: Query timeout in seconds (default: 30)

    Returns:
        Dictionary with query results in unified format
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

    # Extract and validate parameters
    query = input_data.get('query', '').strip()

    if not query:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="validation_error",
                        message="Query is required",
                        retryable=False,
                        suggestions=[
                            "Provide 'query' parameter with SQL statement",
                            "Example: query='SELECT * FROM users LIMIT 10'"
                        ]
                    )
                ) \
                .build()
        else:
            return {
                "error": "Query is required",
                "suggestions": ["Provide 'query' parameter"]
            }

    connection_string = input_data.get('connection_string') or os.environ.get('PG_CONNECTION_STRING')
    max_rows = input_data.get('max_rows', 1000)
    timeout = input_data.get('timeout', 30)

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

        # Set statement timeout
        cursor.execute(f"SET statement_timeout TO {timeout * 1000};")

        # Get database name
        cursor.execute("SELECT current_database();")
        database_name = cursor.fetchone()['current_database']

        # Execute query
        cursor.execute(query)

        # Check if it's a SELECT query that returns data
        if cursor.description is None:
            # It was an INSERT, UPDATE, DELETE, etc.
            affected_rows = cursor.rowcount
            conn.commit()

            if OUTPUT_BUILDER_AVAILABLE:
                return OutputBuilder() \
                    .set_result_type("table") \
                    .set_table(
                        headers=["Result"],
                        rows=[[f"Query executed successfully. {affected_rows} rows affected."]],
                        title="Query Result"
                    ) \
                    .add_standard_metadata("row_count", affected_rows) \
                    .add_standard_metadata("column_count", 1) \
                    .add_standard_metadata("query_preview", query[:100]) \
                    .add_standard_metadata("database", database_name) \
                    .add_standard_metadata("affected_rows", affected_rows) \
                    .build()
            else:
                return {
                    "message": f"Query executed successfully. {affected_rows} rows affected.",
                    "affected_rows": affected_rows
                }

        # Fetch results
        if max_rows == -1:
            rows = cursor.fetchall()
            rows_truncated = False
        else:
            rows = cursor.fetchmany(max_rows)
            rows_truncated = cursor.rowcount > max_rows

        # Get column names
        headers = [desc[0] for desc in cursor.description]

        # Convert RealDictRow to list of lists
        result_rows = []
        for row in rows:
            result_rows.append(list(row.values()))

        # Convert values to JSON-serializable types
        def convert_value(value):
            if value is None:
                return None
            elif isinstance(value, (int, float, str, bool)):
                return value
            elif hasattr(value, 'isoformat'):  # datetime, date, time
                return value.isoformat()
            elif isinstance(value, bytes):
                return f"<binary data: {len(value)} bytes>"
            elif isinstance(value, dict):
                return str(value)
            else:
                return str(value)

        # Convert all values
        converted_rows = []
        for row in result_rows:
            converted_rows.append([convert_value(v) for v in row])

        # Build result
        table_title = f"Query Results ({len(converted_rows)} rows"
        if rows_truncated:
            table_title += ", truncated"
        table_title += ")"

        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_result_type("table") \
                .set_table(
                    headers=headers,
                    rows=converted_rows,
                    title=table_title,
                    sortable=True
                ) \
                .add_standard_metadata("row_count", len(converted_rows)) \
                .add_standard_metadata("column_count", len(headers)) \
                .add_standard_metadata("query_preview", query[:100]) \
                .add_standard_metadata("database", database_name) \
                .add_standard_metadata("rows_truncated", rows_truncated) \
                .build()
        else:
            # Fallback format
            return {
                "headers": headers,
                "rows": converted_rows,
                "row_count": len(converted_rows),
                "column_count": len(headers)
            }

    except psycopg2.errors.SyntaxError as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="syntax_error",
                        message=f"SQL syntax error: {str(e)}",
                        details=str(e),
                        retryable=False,
                        suggestions=[
                            "Check SQL syntax",
                            "Verify table and column names exist",
                            "Ensure proper SQL formatting"
                        ]
                    )
                ) \
                .build()
        else:
            return {
                "error": f"Syntax error: {str(e)}",
                "error_type": "syntax_error"
            }

    except psycopg2.errors.InsufficientPrivilege as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="permission_error",
                        message=f"Permission denied: {str(e)}",
                        details=str(e),
                        retryable=False,
                        suggestions=[
                            "Check if user has SELECT permission on the table",
                            "Grant required permissions to the user",
                            "Contact database administrator"
                        ]
                    )
                ) \
                .build()
        else:
            return {
                "error": f"Permission denied: {str(e)}",
                "error_type": "permission_error"
            }

    except psycopg2.errors.QueryCanceled as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="timeout_error",
                        message=f"Query timeout after {timeout} seconds",
                        details=str(e),
                        retryable=True,
                        suggestions=[
                            f"Increase timeout parameter (current: {timeout}s)",
                            "Optimize the query",
                            "Add WHERE clause to reduce result set",
                            "Create appropriate indexes"
                        ]
                    )
                ) \
                .build()
        else:
            return {
                "error": f"Query timeout: {str(e)}",
                "error_type": "timeout_error"
            }

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
                            "Check if table exists",
                            "Verify column names",
                            "Review database logs for more details"
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
                        "Verify SQL query syntax",
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

    # Test with environment variables
    print("Testing postgres-api-sql-query...")
    print("Make sure PG_DATABASE and other environment variables are set.")

    result = execute_query({
        "query": "SELECT version();",
        "max_rows": 10
    })

    print(json.dumps(result, indent=2))
