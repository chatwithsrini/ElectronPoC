/**
 * Dentrix ODBC Bridge
 *
 * Executes ODBC queries against the Dentrix database using PowerShell.
 * Mirrors the .NET AppointmentADO and DentrixFacade which use System.Data.Odbc.
 *
 * Dentrix uses ODBC connection strings (UID=...;PWD=...;Server=...;DBN=...).
 * Uses 32-bit PowerShell for compatibility with 32-bit ODBC drivers (common for dental software).
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

const POWERSHELL_32BIT_PATH = '%SystemRoot%\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe';
const POWERSHELL_64BIT_PATH = 'powershell.exe';

/**
 * Execute an ODBC query and return results as array of objects.
 * Mirrors .NET OdbcConnection + OdbcCommand + OdbcDataReader.
 *
 * @param {string} connectionString - Full ODBC connection string (e.g., UID=pdba;PWD=...;Server=...;DBN=...)
 * @param {string} query - SQL query with ? placeholders for parameters
 * @param {Array} params - Query parameters (in order)
 * @returns {Promise<Object>} { success, rows, error }
 */
async function executeOdbcQuery(connectionString, query, params = []) {
  if (!connectionString || typeof connectionString !== 'string') {
    return { success: false, rows: [], error: 'Connection string is required' };
  }

  // Escape for PowerShell: single quotes in connection string, and escape params
  const escapedConnStr = connectionString.replace(/'/g, "''");
  const escapedQuery = query.replace(/'/g, "''").replace(/\r?\n/g, ' ');

  // Build params array for PowerShell - handle dates, nulls, etc.
  const paramValues = params.map((p) => {
    if (p == null) return 'NULL';
    if (p instanceof Date) return p.toISOString().slice(0, 19).replace('T', ' ');
    return String(p);
  });

  const paramsJson = JSON.stringify(paramValues);

  const script = `
$ErrorActionPreference = "Stop"
$result = @()
try {
  Add-Type -AssemblyName System.Data
  $connStr = '${escapedConnStr}'
  $query = '${escapedQuery}'
  $paramsJson = '${paramsJson}'.Replace("'", "''")
  $paramValues = $paramsJson | ConvertFrom-Json

  $conn = New-Object System.Data.Odbc.OdbcConnection($connStr)
  $conn.Open()

  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $query

  foreach ($pv in $paramValues) {
    if ($pv -eq "NULL") { $cmd.Parameters.AddWithValue("@p", [DBNull]::Value) | Out-Null }
    else { $cmd.Parameters.AddWithValue("@p", $pv) | Out-Null }
  }

  $reader = $cmd.ExecuteReader()
  $columns = @()
  for ($i = 0; $i -lt $reader.FieldCount; $i++) {
    $columns += $reader.GetName($i)
  }

  while ($reader.Read()) {
    $row = @{}
    for ($i = 0; $i -lt $reader.FieldCount; $i++) {
      $val = $reader.GetValue($i)
      if ($val -is [DateTime]) { $row[$columns[$i]] = $val.ToString("yyyy-MM-dd HH:mm:ss") }
      elseif ($val -eq [DBNull]::Value) { $row[$columns[$i]] = $null }
      else { $row[$columns[$i]] = $val.ToString().Trim() }
    }
    $result += [PSCustomObject]$row
  }
  $reader.Close()
  $conn.Close()

  $result | ConvertTo-Json -Compress -Depth 10
  exit 0
} catch {
  Write-Error "ERROR: $($_.Exception.Message)"
  exit 1
}
`.trim();

  // ODBC uses positional ? - Parameters.AddWithValue adds in order, but we use @p for all
  // Actually ODBC doesn't use named params - it uses ? and AddWithValue adds by position.
  // Let me fix the script - we need to add one param per ? in the query.
  const paramCount = (query.match(/\?/g) || []).length;
  if (paramCount !== paramValues.length) {
    return { success: false, rows: [], error: `Query has ${paramCount} placeholders but ${paramValues.length} params provided` };
  }

  const paramAddLines = paramValues
    .map((p, i) => (p === 'NULL' ? `$cmd.Parameters.AddWithValue("?", [DBNull]::Value) | Out-Null` : `$cmd.Parameters.AddWithValue("?", $paramValues[${i}]) | Out-Null`))
    .join('\n  ');

  const paramValuesStr = paramValues
    .map((p) => (p === 'NULL' ? '[DBNull]::Value' : `'${String(p).replace(/'/g, "''")}'`))
    .join(', ');

  const finalScript = `
$ErrorActionPreference = "Stop"
$result = @()
try {
  Add-Type -AssemblyName System.Data
  $connStr = '${escapedConnStr}'
  $query = '${escapedQuery}'
  $paramValues = @(${paramValuesStr})

  $conn = New-Object System.Data.Odbc.OdbcConnection($connStr)
  $conn.Open()

  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $query
  ${paramAddLines}

  $reader = $cmd.ExecuteReader()
  $columns = @()
  for ($i = 0; $i -lt $reader.FieldCount; $i++) { $columns += $reader.GetName($i) }

  while ($reader.Read()) {
    $row = @{}
    for ($j = 0; $j -lt $reader.FieldCount; $j++) {
      $val = $reader.GetValue($j)
      if ($val -is [DateTime]) { $row[$columns[$j]] = $val.ToString("yyyy-MM-dd HH:mm:ss") }
      elseif ($val -eq [DBNull]::Value) { $row[$columns[$j]] = $null }
      else { $row[$columns[$j]] = $val.ToString().Trim() }
    }
    $result += [PSCustomObject]$row
  }
  $reader.Close()
  $conn.Close()

  $result | ConvertTo-Json -Compress -Depth 10
  exit 0
} catch {
  Write-Error "ERROR: $($_.Exception.Message)"
  exit 1
}
`.trim();

  const encodedScript = Buffer.from(finalScript, 'utf16le').toString('base64');

  const powershellPaths = [POWERSHELL_32BIT_PATH, POWERSHELL_64BIT_PATH];

  for (const psPath of powershellPaths) {
    try {
      const { stdout, stderr } = await execPromise(
        `${psPath} -NoProfile -NonInteractive -EncodedCommand ${encodedScript}`,
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
      );

      const output = stdout.trim();
      if (output.startsWith('ERROR:')) {
        return { success: false, rows: [], error: output.replace('ERROR:', '').trim() };
      }

      if (!output) {
        return { success: true, rows: [] };
      }

      const rows = JSON.parse(output);
      return { success: true, rows: Array.isArray(rows) ? rows : [rows] };
    } catch (err) {
      const combined = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
      if (combined.includes('ERROR:')) {
        const match = combined.match(/ERROR:\s*(.+)/);
        return { success: false, rows: [], error: match ? match[1].trim() : combined };
      }
      if (err.message && err.message.includes('timeout')) {
        return { success: false, rows: [], error: 'Query timed out' };
      }
      continue;
    }
  }

  return { success: false, rows: [], error: 'Failed to execute ODBC query via PowerShell' };
}

module.exports = {
  executeOdbcQuery,
};
