// Minimal in-memory stand-in for the subset of the SpreadsheetApp API
// (Spreadsheet / Sheet / Range) that our GAS source files call.
// This is the system-boundary mock — GAS's SpreadsheetApp itself is
// external and unavailable outside the Apps Script runtime, so tests
// inject this fake instead of reaching a real spreadsheet.

function createFakeSheet(name) {
  var rows = []; // 0-indexed array of arrays, mirrors a real sheet's 1-indexed grid
  var numberFormatCalls = []; // {row, col, numRows, numCols, format} — for verifying ensureSchema's plain-text fix
  var dataValidationCalls = []; // {row, col, numRows, numCols, rule} — for verifying the role dropdown wiring
  var readCount = 0; // incremented on each getValues()/getRawValues() call — mirrors a real Sheets API round-trip

  return {
    getName: function () {
      return name;
    },
    getRange: function (row, col, numRows, numCols) {
      numRows = numRows || 1;
      numCols = numCols || 1;
      return {
        setValues: function (values) {
          for (var r = 0; r < numRows; r++) {
            var rowIndex = row - 1 + r;
            if (!rows[rowIndex]) rows[rowIndex] = [];
            for (var c = 0; c < numCols; c++) {
              rows[rowIndex][col - 1 + c] = values[r][c];
            }
          }
        },
        getValues: function () {
          readCount++;
          var out = [];
          for (var r = 0; r < numRows; r++) {
            var rowIndex = row - 1 + r;
            var rowData = rows[rowIndex] || [];
            var rowOut = [];
            for (var c = 0; c < numCols; c++) {
              var v = rowData[col - 1 + c] !== undefined ? rowData[col - 1 + c] : '';
              // Real Sheets strips a leading literal-text apostrophe when
              // a cell's value is read back — the marker only forces
              // write-time interpretation, it isn't part of the stored
              // value. Mirroring that here so getValues() reflects what
              // the app actually receives from a real spreadsheet.
              if (typeof v === 'string' && v.charAt(0) === "'") {
                v = v.slice(1);
              }
              rowOut.push(v);
            }
            out.push(rowOut);
          }
          return out;
        },
        getRawValues: function () {
          readCount++;
          // Unlike getValues(), does NOT strip a leading apostrophe —
          // for tests that need to verify escaping happened at write
          // time (the raw stored content genuinely differs based on
          // whether we escaped or not, even though a real spreadsheet
          // would display/return the same clean text either way once
          // it strips the marker on read).
          var out = [];
          for (var r = 0; r < numRows; r++) {
            var rowIndex = row - 1 + r;
            var rowData = rows[rowIndex] || [];
            var rowOut = [];
            for (var c = 0; c < numCols; c++) {
              rowOut.push(rowData[col - 1 + c] !== undefined ? rowData[col - 1 + c] : '');
            }
            out.push(rowOut);
          }
          return out;
        },
        setNumberFormat: function (format) {
          // Real Sheets formatting/date-autodetection can't be modeled
          // by this in-memory fake; recording the call is the only
          // observable behavior available for ensureSchema's plain-text
          // fix to be verified against in these unit tests.
          numberFormatCalls.push({ row: row, col: col, numRows: numRows, numCols: numCols, format: format });
        },
        setDataValidation: function (rule) {
          // Real Sheets' DataValidation object can't be modeled by this
          // in-memory fake (it's built via the global SpreadsheetApp
          // namespace, not via anything reachable from a Range); recording
          // the call plus whatever rule object the caller handed us is the
          // only observable behavior available here.
          dataValidationCalls.push({ row: row, col: col, numRows: numRows, numCols: numCols, rule: rule });
        }
      };
    },
    appendRow: function (rowValues) {
      rows.push(rowValues.slice());
    },
    getLastRow: function () {
      return rows.length;
    },
    getMaxRows: function () {
      // Real new sheets default to 1000 rows; this is a reasonable
      // stand-in so code that defensively checks for getMaxRows (like
      // schema.js's plain-text formatting step) actually exercises that
      // path in tests instead of silently skipping it.
      return Math.max(rows.length, 1000);
    },
    deleteRow: function (rowNum) {
      rows.splice(rowNum - 1, 1);
    },
    _getNumberFormatCalls: function () {
      return numberFormatCalls;
    },
    _getDataValidationCalls: function () {
      return dataValidationCalls;
    },
    _getReadCount: function () {
      return readCount;
    }
  };
}

function createFakeSpreadsheet() {
  var sheets = {};
  return {
    getSheetByName: function (name) {
      return sheets[name] || null;
    },
    insertSheet: function (name) {
      var sheet = createFakeSheet(name);
      sheets[name] = sheet;
      return sheet;
    }
  };
}

module.exports = { createFakeSpreadsheet: createFakeSpreadsheet };
